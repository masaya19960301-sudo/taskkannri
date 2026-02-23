/**
 * RecurrenceService.js
 * 繰り返しタスクのビジネスロジック
 */

class RecurrenceService {
  constructor() {
    this._recurrenceRepo = getRecurrenceRepository();
    this._taskRepo = getTaskRepository();
  }

  /**
   * 繰り返し設定を作成
   * @param {object} recurrenceData
   * @param {object} currentUser
   * @returns {object}
   */
  createRecurrence(recurrenceData, currentUser) {
    const validation = Validator.validateRecurrence(recurrenceData);
    if (!validation.valid) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, validation.errors.join(', '));
    }

    const recurrence = {
      recurrenceId: UUIDGenerator.generate(),
      type: recurrenceData.type,
      interval: Number(recurrenceData.interval) || 1,
      weekdays: recurrenceData.weekdays || [],
      baseDate: recurrenceData.baseDate,
    };

    return LockManager.executeWithLock(() => this._recurrenceRepo.create(recurrence));
  }

  /**
   * 繰り返し設定を解除
   * @param {string} recurrenceId
   * @param {object} currentUser
   * @returns {boolean}
   */
  removeRecurrence(recurrenceId, currentUser) {
    const existing = this._recurrenceRepo.findById(recurrenceId);
    if (!existing) {
      throw new AppError(ERROR_CODES.NOT_FOUND, '繰り返し設定が見つかりません');
    }

    return LockManager.executeWithLock(() => {
      // 関連タスクの繰り返しIDをクリア
      const tasks = this._taskRepo.findByRecurrence(recurrenceId);
      const updates = tasks.map(t => ({
        id: t.taskId,
        entity: { ...t, recurrenceId: '', updatedAt: new Date().toISOString() },
      }));
      this._taskRepo.updateBatch(updates);

      // 繰り返し設定を削除
      return this._recurrenceRepo.delete(recurrenceId);
    });
  }

  /**
   * 完了タスクに対する次回タスクを生成
   * @param {object} completedTask
   * @param {object} currentUser
   * @returns {object|null}
   */
  generateNextTask(completedTask, currentUser) {
    if (!completedTask.recurrenceId) return null;

    const recurrence = this._recurrenceRepo.findById(completedTask.recurrenceId);
    if (!recurrence) return null;

    const nextDate = this._calculateNextDate(recurrence, completedTask.dueDate);
    if (!nextDate) return null;

    const now = new Date().toISOString();
    const nextTask = {
      taskId: UUIDGenerator.generate(),
      title: completedTask.title,
      description: completedTask.description,
      dueDate: nextDate,
      dueTime: completedTask.dueTime,
      priority: completedTask.priority,
      status: TASK_STATUS.NOT_STARTED,
      assigneeId: completedTask.assigneeId,
      categoryId: completedTask.categoryId,
      recurrenceId: completedTask.recurrenceId,
      externalUUID: '',
      invoiceNo: '',
      sortOrder: completedTask.sortOrder,
      calendarEventId: '',
      createdAt: now,
      updatedAt: now,
      createdBy: currentUser.userId,
      updatedBy: currentUser.userId,
    };

    return LockManager.executeWithLock(() => {
      const created = this._taskRepo.create(nextTask);
      getIndexRepository().upsertTaskIndex(created);
      return created;
    });
  }

  /**
   * 全繰り返し設定を取得
   * @returns {object[]}
   */
  getAllRecurrences() {
    return this._recurrenceRepo.findAll();
  }

  /**
   * 次回日付を計算
   * @param {object} recurrence
   * @param {string} currentDate - YYYY-MM-DD
   * @returns {string|null} YYYY-MM-DD
   */
  _calculateNextDate(recurrence, currentDate) {
    if (!currentDate) return null;

    const date = new Date(currentDate + 'T00:00:00');
    const interval = Number(recurrence.interval) || 1;

    switch (recurrence.type) {
      case RECURRENCE_TYPE.DAILY:
        date.setDate(date.getDate() + interval);
        break;

      case RECURRENCE_TYPE.WEEKLY: {
        const weekdays = Array.isArray(recurrence.weekdays) ? recurrence.weekdays : [];
        if (weekdays.length === 0) {
          date.setDate(date.getDate() + 7 * interval);
        } else {
          // 次の該当曜日を探す
          const currentDay = date.getDay();
          const sortedDays = [...weekdays].map(Number).sort((a, b) => a - b);
          let nextDay = sortedDays.find(d => d > currentDay);
          if (nextDay !== undefined) {
            date.setDate(date.getDate() + (nextDay - currentDay));
          } else {
            // 翌週の最初の曜日
            const daysUntilNextWeek = 7 - currentDay + sortedDays[0];
            date.setDate(date.getDate() + daysUntilNextWeek + (interval - 1) * 7);
          }
        }
        break;
      }

      case RECURRENCE_TYPE.MONTHLY:
        date.setMonth(date.getMonth() + interval);
        break;

      case RECURRENCE_TYPE.YEARLY:
        date.setFullYear(date.getFullYear() + interval);
        break;

      case RECURRENCE_TYPE.MONTH_END: {
        // 翌月末の計算
        date.setMonth(date.getMonth() + interval + 1);
        date.setDate(0); // 前月の末日
        break;
      }

      default:
        return null;
    }

    return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }

  /**
   * 未処理の繰り返しタスク生成を実行（Time Trigger用）
   */
  processCompletedRecurrences() {
    const completedTasks = this._taskRepo.findByConditions({
      status: TASK_STATUS.COMPLETED,
    });

    const systemUser = { userId: 'SYSTEM' };
    let generatedCount = 0;

    completedTasks.forEach(task => {
      if (!task.recurrenceId) return;
      // 同じ繰り返しIDで未完了タスクが既に存在するかチェック
      const existingTasks = this._taskRepo.findByRecurrence(task.recurrenceId);
      const hasActive = existingTasks.some(t => t.status !== TASK_STATUS.COMPLETED);
      if (!hasActive) {
        const nextTask = this.generateNextTask(task, systemUser);
        if (nextTask) generatedCount++;
      }
    });

    Logger.log(`繰り返しタスク生成: ${generatedCount}件`);
    return generatedCount;
  }
}

const recurrenceService_ = new RecurrenceService();

function getRecurrenceService() {
  return recurrenceService_;
}
