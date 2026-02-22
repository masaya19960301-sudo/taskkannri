/**
 * LogService.js
 * ログ管理のビジネスロジック
 */

class LogService {
  constructor() {
    this._repo = getLogRepository();
  }

  /**
   * タスクのログ一覧を取得
   * @param {string} taskId
   * @returns {object[]}
   */
  getLogsByTask(taskId) {
    const logs = this._repo.findByTaskId(taskId);
    return logs.sort((a, b) => {
      const timeA = a.timestamp || '';
      const timeB = b.timestamp || '';
      return timeB.localeCompare(timeA);
    });
  }

  /**
   * 古いログを削除（月次バッチ）
   * @returns {number} 削除件数
   */
  cleanupOldLogs() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - APP_CONFIG.LOG_RETENTION_DAYS);
    const cutoffStr = Utilities.formatDate(cutoff, Session.getScriptTimeZone(), 'yyyy-MM-dd');

    const expiredIds = this._repo.findExpiredLogIds(cutoffStr);
    if (expiredIds.length === 0) return 0;

    const deleted = LockManager.executeWithLock(() => this._repo.deleteBatch(expiredIds));
    Logger.log(`古いログ削除: ${deleted}件`);
    return deleted;
  }

  /**
   * 古いタスクを削除（年次バッチ）
   * @returns {number} 削除件数
   */
  cleanupOldTasks() {
    const taskRepo = getTaskRepository();
    const expiredIds = taskRepo.findExpiredTaskIds();
    if (expiredIds.length === 0) return 0;

    // 関連データも一括削除
    const attachmentRepo = getAttachmentRepository();
    const linkRepo = getExternalLinkRepository();
    const indexRepo = getIndexRepository();

    return LockManager.executeWithLock(() => {
      let totalDeleted = 0;
      expiredIds.forEach(taskId => {
        // 添付ファイル削除
        const attachments = attachmentRepo.findByTaskId(taskId);
        attachments.forEach(att => {
          try {
            DriveApp.getFileById(att.driveFileId).setTrashed(true);
          } catch (e) { /* ignore */ }
        });
        if (attachments.length > 0) {
          attachmentRepo.deleteBatch(attachments.map(a => a.attachmentId));
        }

        // 外部リンク削除
        const links = linkRepo.findByTaskId(taskId);
        if (links.length > 0) {
          linkRepo.deleteBatch(links.map(l => l.linkId));
        }

        // インデックス削除
        indexRepo.removeTaskIndex(taskId);

        // ログ削除
        const logs = this._repo.findByTaskId(taskId);
        if (logs.length > 0) {
          this._repo.deleteBatch(logs.map(l => l.logId));
        }

        totalDeleted++;
      });

      // タスク本体を削除
      taskRepo.deleteBatch(expiredIds);

      Logger.log(`古いタスク削除: ${totalDeleted}件`);
      return totalDeleted;
    });
  }
}

const logService_ = new LogService();

function getLogService() {
  return logService_;
}
