/**
 * ExternalSyncService.js
 * 外部スプレッドシートとの同期ビジネスロジック
 */

class ExternalSyncService {
  constructor() {
    this._linkRepo = getExternalLinkRepository();
    this._taskRepo = getTaskRepository();
    this._logRepo = getLogRepository();
  }

  /**
   * 外部リンクを登録
   * @param {object} linkData
   * @param {object} currentUser
   * @returns {object}
   */
  createLink(linkData, currentUser) {
    if (!linkData.taskId || !linkData.invoiceNo || !linkData.externalUUID) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'taskId, invoiceNo, externalUUID は必須です');
    }

    const task = this._taskRepo.findById(linkData.taskId);
    if (!task) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'タスクが見つかりません');
    }

    const now = new Date().toISOString();
    const link = {
      linkId: UUIDGenerator.generate(),
      taskId: linkData.taskId,
      invoiceNo: linkData.invoiceNo,
      externalUUID: linkData.externalUUID,
      sourceSheetId: linkData.sourceSheetId || '',
      sourceRowId: linkData.sourceRowId || '',
      syncUpdatedAt: now,
    };

    // タスクにも外部キー情報を保存
    const taskUpdate = {
      ...task,
      invoiceNo: linkData.invoiceNo,
      externalUUID: linkData.externalUUID,
      updatedAt: now,
      updatedBy: currentUser.userId,
    };

    return LockManager.executeWithLock(() => {
      this._taskRepo.update(task.taskId, taskUpdate);
      return this._linkRepo.create(link);
    });
  }

  /**
   * 日次自動同期の実行
   * @returns {{ synced: number, errors: string[] }}
   */
  executeDailySync() {
    const links = this._linkRepo.findAll();
    let syncedCount = 0;
    const errors = [];

    links.forEach(link => {
      try {
        if (!link.sourceSheetId) return;

        const task = this._taskRepo.findById(link.taskId);
        if (!task) return;

        // 外部シートからデータを取得
        const externalData = this._readExternalData(link.sourceSheetId, link.sourceRowId);
        if (!externalData) return;

        // 競合解決: updatedAt が新しい方を優先
        const taskUpdatedAt = new Date(task.updatedAt).getTime();
        const externalUpdatedAt = externalData.updatedAt
          ? new Date(externalData.updatedAt).getTime()
          : 0;

        if (externalUpdatedAt > taskUpdatedAt) {
          // 外部データの方が新しい → タスクを更新
          const updates = {
            ...task,
            title: externalData.title || task.title,
            description: externalData.description || task.description,
            updatedAt: new Date().toISOString(),
            updatedBy: 'SYSTEM_SYNC',
          };
          this._taskRepo.update(task.taskId, updates);
          syncedCount++;
        } else if (task.status === TASK_STATUS.COMPLETED) {
          // タスクが完了 → 外部シートを更新
          this._updateExternalData(link.sourceSheetId, link.sourceRowId, {
            status: TASK_STATUS.COMPLETED,
            updatedAt: task.updatedAt,
          });
          syncedCount++;
        }

        // 同期日時を更新
        this._linkRepo.update(link.linkId, {
          ...link,
          syncUpdatedAt: new Date().toISOString(),
        });
      } catch (e) {
        errors.push(`linkId=${link.linkId}: ${e.message}`);
        Logger.log(`同期エラー: ${e.message}`);
      }
    });

    Logger.log(`日次同期完了: ${syncedCount}件同期, ${errors.length}件エラー`);

    this._writeLog('SYSTEM', LOG_ACTION.SYNC, 'SYSTEM',
      `日次同期: ${syncedCount}件成功, ${errors.length}件エラー`);

    return { synced: syncedCount, errors };
  }

  /**
   * 手動同期の実行
   * @param {string} taskId
   * @param {object} currentUser
   * @returns {object}
   */
  syncTask(taskId, currentUser) {
    const links = this._linkRepo.findByTaskId(taskId);
    if (links.length === 0) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'この タスクの外部リンクが見つかりません');
    }

    const results = { synced: 0, errors: [] };
    links.forEach(link => {
      try {
        if (!link.sourceSheetId) return;
        const task = this._taskRepo.findById(taskId);
        const externalData = this._readExternalData(link.sourceSheetId, link.sourceRowId);

        if (externalData) {
          const taskTime = new Date(task.updatedAt).getTime();
          const extTime = externalData.updatedAt
            ? new Date(externalData.updatedAt).getTime()
            : 0;

          if (extTime > taskTime) {
            this._taskRepo.update(taskId, {
              ...task,
              title: externalData.title || task.title,
              updatedAt: new Date().toISOString(),
              updatedBy: currentUser.userId,
            });
          }
          results.synced++;
        }

        this._linkRepo.update(link.linkId, {
          ...link,
          syncUpdatedAt: new Date().toISOString(),
        });
      } catch (e) {
        results.errors.push(e.message);
      }
    });

    this._writeLog(taskId, LOG_ACTION.SYNC, currentUser.userId, '手動同期');
    return results;
  }

  /**
   * 外部シートからデータを読み取り
   * @param {string} sheetId
   * @param {string} rowId
   * @returns {object|null}
   */
  _readExternalData(sheetId, rowId) {
    try {
      const ss = SpreadsheetApp.openById(sheetId);
      const sheet = ss.getSheets()[0];
      const rowIdx = Number(rowId);
      if (isNaN(rowIdx) || rowIdx < 2) return null;

      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      const rowData = sheet.getRange(rowIdx, 1, 1, sheet.getLastColumn()).getValues()[0];

      const data = {};
      headers.forEach((h, i) => { data[h] = rowData[i]; });
      return data;
    } catch (e) {
      Logger.log(`外部シート読み取りエラー: ${e.message}`);
      return null;
    }
  }

  /**
   * 外部シートにデータを書き込み
   * @param {string} sheetId
   * @param {string} rowId
   * @param {object} data
   */
  _updateExternalData(sheetId, rowId, data) {
    try {
      const ss = SpreadsheetApp.openById(sheetId);
      const sheet = ss.getSheets()[0];
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      const rowIdx = Number(rowId);
      if (isNaN(rowIdx) || rowIdx < 2) return;

      const currentRow = sheet.getRange(rowIdx, 1, 1, headers.length).getValues()[0];
      Object.keys(data).forEach(key => {
        const colIdx = headers.indexOf(key);
        if (colIdx !== -1) {
          currentRow[colIdx] = data[key];
        }
      });
      sheet.getRange(rowIdx, 1, 1, headers.length).setValues([currentRow]);
    } catch (e) {
      Logger.log(`外部シート書き込みエラー: ${e.message}`);
    }
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
}

const externalSyncService_ = new ExternalSyncService();

function getExternalSyncService() {
  return externalSyncService_;
}
