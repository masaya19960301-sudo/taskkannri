/**
 * TaskService.js
 * タスク管理のビジネスロジック
 */

class TaskService {
  constructor() {
    this._taskRepo = getTaskRepository();
    this._indexRepo = getIndexRepository();
    this._logRepo = getLogRepository();
    this._attachmentRepo = getAttachmentRepository();
  }

  /**
   * アクティブタスク一覧を取得（includeCompleted対応）
   * @param {object} filters - { assigneeId, categoryId, priority, keyword, includeCompleted }
   * @param {number} limit
   * @param {number} offset
   * @returns {{ tasks: object[], total: number }}
   */
  getActiveTasks(filters, limit, offset) {
    const maxLimit = Math.min(limit || APP_CONFIG.MAX_DISPLAY, APP_CONFIG.MAX_DISPLAY);
    const startOffset = offset || 0;
    const includeCompleted = filters && filters.includeCompleted === 'true';

    let tasks;
    if (includeCompleted) {
      // 完了含む全タスクを取得
      const active = this._taskRepo.findActiveTasks(maxLimit + startOffset + 100, 0);
      const completed = this._taskRepo.findCompletedTasks(filters, maxLimit);
      tasks = [...active, ...completed];
    } else {
      tasks = this._taskRepo.findActiveTasks(maxLimit + startOffset + 100, 0);
    }

    // フィルタ適用
    if (filters) {
      if (filters.assigneeId) {
        const filterId = filters.assigneeId;
        tasks = tasks.filter(t => {
          if (!t.assigneeId) return false;
          if (t.assigneeId === ASSIGNEE_ALL) return true;
          const ids = t.assigneeId.split(',');
          return ids.includes(filterId);
        });
      }
      if (filters.categoryId) {
        tasks = tasks.filter(t => t.categoryId === filters.categoryId);
      }
      if (filters.priority) {
        tasks = tasks.filter(t => Number(t.priority) === Number(filters.priority));
      }
      if (filters.keyword) {
        const kw = filters.keyword.toLowerCase();
        tasks = tasks.filter(t =>
          (t.title && t.title.toLowerCase().includes(kw)) ||
          (t.description && t.description.toLowerCase().includes(kw))
        );
      }
      if (filters.status && filters.status !== TASK_STATUS.COMPLETED) {
        tasks = tasks.filter(t => t.status === filters.status);
      }
    }

    // 重複排除
    const seen = new Set();
    tasks = tasks.filter(t => {
      if (seen.has(t.taskId)) return false;
      seen.add(t.taskId);
      return true;
    });

    const total = tasks.length;
    const paginated = tasks.slice(startOffset, startOffset + maxLimit);

    return { tasks: paginated, total };
  }

  /**
   * 完了タスクを検索取得
   * @param {object} filters
   * @param {number} limit
   * @returns {{ tasks: object[], total: number }}
   */
  getCompletedTasks(filters, limit) {
    const tasks = this._taskRepo.findCompletedTasks(filters, limit);
    return { tasks, total: tasks.length };
  }

  /**
   * タスクを1件取得
   * @param {string} taskId
   * @returns {object}
   */
  getTask(taskId) {
    const task = this._taskRepo.findById(taskId);
    if (!task) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'タスクが見つかりません');
    }
    return task;
  }

  /**
   * タスクを作成
   * @param {object} taskData
   * @param {object} currentUser
   * @returns {object}
   */
  createTask(taskData, currentUser) {
    // バリデーション
    const validation = Validator.validateTask(taskData, false);
    if (!validation.valid) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, validation.errors.join(', '));
    }

    // 最大件数チェック
    const count = this._taskRepo.count();
    if (count >= APP_CONFIG.MAX_TASKS) {
      throw new AppError(ERROR_CODES.MAX_TASKS_REACHED, `タスク数が上限(${APP_CONFIG.MAX_TASKS})に達しています`);
    }

    const now = new Date().toISOString();
    const sanitized = Validator.sanitizeFields(taskData, ['title', 'description']);

    const task = {
      taskId: UUIDGenerator.generate(),
      title: sanitized.title,
      description: sanitized.description || '',
      dueDate: taskData.dueDate || '',
      dueTime: taskData.dueTime || '',
      priority: Number(taskData.priority) || TASK_PRIORITY.MEDIUM,
      status: taskData.status || TASK_STATUS.NOT_STARTED,
      assigneeId: taskData.assigneeId || '',
      categoryId: taskData.categoryId || '',
      recurrenceId: taskData.recurrenceId || '',
      externalUUID: taskData.externalUUID || UUIDGenerator.generate(),
      invoiceNo: taskData.invoiceNo || '',
      sortOrder: Number(taskData.sortOrder) || 0,
      calendarEventId: '',
      createdAt: now,
      updatedAt: now,
      createdBy: currentUser.userId,
      updatedBy: currentUser.userId,
    };

    const result = LockManager.executeWithLock(() => {
      const created = this._taskRepo.create(task);
      this._indexRepo.upsertTaskIndex(created);
      return created;
    });

    // ログ記録
    this._writeLog(result.taskId, LOG_ACTION.CREATE, currentUser.userId, 'タスク作成');

    // タスク作成時にカレンダー自動同期（期限日がある場合）
    if (result.dueDate) {
      try {
        getCalendarService().syncTaskToCalendar(result.taskId, currentUser);
      } catch (e) {
        // カレンダー同期失敗はタスク作成自体を妨げないが、詳細をログに記録
        Logger.log(`カレンダー自動同期エラー: ${e.message}\n${e.stack || ''}`);
      }
    }

    this._invalidateTaskCache();
    return result;
  }

  /**
   * タスクを更新
   * @param {string} taskId
   * @param {object} updates
   * @param {object} currentUser
   * @returns {object}
   */
  updateTask(taskId, updates, currentUser) {
    const validation = Validator.validateTask(updates, true);
    if (!validation.valid) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, validation.errors.join(', '));
    }

    const existing = this._taskRepo.findById(taskId);
    if (!existing) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'タスクが見つかりません');
    }

    const sanitized = Validator.sanitizeFields(updates, ['title', 'description']);
    const now = new Date().toISOString();

    const updated = { ...existing };
    Object.keys(sanitized).forEach(key => {
      if (sanitized[key] !== undefined && key !== 'taskId' && key !== 'createdAt' && key !== 'createdBy') {
        updated[key] = sanitized[key];
      }
    });
    updated.updatedAt = now;
    updated.updatedBy = currentUser.userId;

    const result = LockManager.executeWithLock(() => {
      const saved = this._taskRepo.update(taskId, updated);
      if (!saved) {
        throw new AppError(ERROR_CODES.NOT_FOUND, 'タスクの保存に失敗しました');
      }
      this._indexRepo.upsertTaskIndex(saved);
      return saved;
    });

    // ステータス変更ログ
    if (updates.status && updates.status !== existing.status) {
      this._writeLog(taskId, LOG_ACTION.STATUS_CHANGE, currentUser.userId,
        `${existing.status} → ${updates.status}`);

      // 完了時に繰り返しタスクの次回タスクを自動生成
      if (updates.status === TASK_STATUS.COMPLETED && result.recurrenceId) {
        try {
          const nextTask = getRecurrenceService().generateNextTask(result, currentUser);
          if (nextTask) {
            this._writeLog(nextTask.taskId, LOG_ACTION.CREATE, currentUser.userId,
              '繰り返しタスクから自動生成');
          }
        } catch (e) {
          Logger.log(`繰り返しタスク生成エラー: ${e.message}`);
        }
      }

      // 完了時にクレームシートへの書き戻し
      if (updates.status === TASK_STATUS.COMPLETED && result.externalUUID && result.externalUUID.startsWith('claim_')) {
        try {
          getClaimSyncService().writeBackOnComplete(result);
          this._writeLog(taskId, LOG_ACTION.UPDATE, currentUser.userId,
            `元シート書き戻し成功: ${result.externalUUID}`);
        } catch (e) {
          // 書き戻し失敗はタスク更新自体を妨げないが、ログとレスポンスに含める
          Logger.log(`クレーム書き戻しエラー: ${e.message}`);
          this._writeLog(taskId, LOG_ACTION.UPDATE, currentUser.userId,
            `元シート書き戻し失敗: ${e.message}`);
          result._writeBackError = `元シートへの書き戻しに失敗しました: ${e.message}`;
        }
      }
    } else {
      this._writeLog(taskId, LOG_ACTION.UPDATE, currentUser.userId, 'タスク更新');
    }

    // 担当者変更ログ
    if (updates.assigneeId && updates.assigneeId !== existing.assigneeId) {
      this._writeLog(taskId, LOG_ACTION.ASSIGN, currentUser.userId,
        `担当者変更: ${updates.assigneeId}`);
    }

    this._invalidateTaskCache();
    return result;
  }

  /**
   * タスクを削除
   * @param {string} taskId
   * @param {object} currentUser
   * @returns {boolean}
   */
  deleteTask(taskId, currentUser) {
    const existing = this._taskRepo.findById(taskId);
    if (!existing) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'タスクが見つかりません');
    }

    return LockManager.executeWithLock(() => {
      // 添付ファイルの削除
      const attachments = this._attachmentRepo.findByTaskId(taskId);
      attachments.forEach(att => {
        try {
          DriveApp.getFileById(att.driveFileId).setTrashed(true);
        } catch (e) {
          Logger.log(`添付ファイル削除エラー: ${e.message}`);
        }
      });
      if (attachments.length > 0) {
        this._attachmentRepo.deleteBatch(attachments.map(a => a.attachmentId));
      }

      // カレンダーイベント削除
      if (existing.calendarEventId) {
        try {
          CalendarApp.getDefaultCalendar().getEventById(existing.calendarEventId).deleteEvent();
        } catch (e) {
          Logger.log(`カレンダーイベント削除エラー: ${e.message}`);
        }
      }

      // タスク削除
      this._taskRepo.delete(taskId);
      this._indexRepo.removeTaskIndex(taskId);

      // ログ記録
      this._writeLog(taskId, LOG_ACTION.DELETE, currentUser.userId, `タスク削除: ${existing.title}`);
      this._invalidateTaskCache();

      return true;
    });
  }

  /**
   * sortOrderを一括更新（D&D対応）
   * @param {{ taskId: string, sortOrder: number }[]} orders
   * @param {object} currentUser
   */
  updateSortOrders(orders, currentUser) {
    if (!orders || orders.length === 0) return;

    LockManager.executeWithLock(() => {
      this._taskRepo.updateSortOrders(orders);
    });

    // インデックス更新はロック外で実行（ロック保持時間を短縮）
    const orderMap = {};
    orders.forEach(o => { orderMap[o.taskId] = o.sortOrder; });
    const { headers, rows } = getSpreadsheetAdapter().getAllData(SHEET_NAMES.INDEX);
    const pkIdx = headers.indexOf('primaryKey');
    const sortIdx = headers.indexOf('sortOrder');
    if (pkIdx !== -1 && sortIdx !== -1) {
      const updates = [];
      rows.forEach((row, i) => {
        if (orderMap[row[pkIdx]] !== undefined) {
          row[sortIdx] = orderMap[row[pkIdx]];
          updates.push({ rowIndex: i + 2, data: row });
        }
      });
      if (updates.length > 0) {
        getSpreadsheetAdapter().updateRows(SHEET_NAMES.INDEX, updates);
      }
    }

    this._invalidateTaskCache();
  }

  /**
   * タスクのステータスを変更
   * @param {string} taskId
   * @param {string} newStatus
   * @param {object} currentUser
   * @returns {object}
   */
  changeStatus(taskId, newStatus, currentUser) {
    return this.updateTask(taskId, { status: newStatus }, currentUser);
  }

  /**
   * ログ書き込みヘルパー
   */
  _writeLog(taskId, actionType, userId, detail) {
    try {
      this._logRepo.create({
        logId: UUIDGenerator.generate(),
        taskId: taskId,
        actionType: actionType,
        userId: userId,
        detail: detail || '',
        timestamp: new Date().toISOString(),
      });
    } catch (e) {
      Logger.log(`ログ書き込みエラー: ${e.message}`);
    }
  }

  /**
   * タスクキャッシュの無効化
   */
  _invalidateTaskCache() {
    getCacheManager().remove(CACHE_KEYS.INDEX);
  }
}

const taskService_ = new TaskService();

function getTaskService() {
  return taskService_;
}
