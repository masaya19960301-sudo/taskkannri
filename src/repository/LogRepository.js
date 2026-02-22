/**
 * LogRepository.js
 * 操作ログのリポジトリ
 */

class LogRepository extends BaseRepository {
  constructor() {
    super(SHEET_NAMES.LOGS, 'logId', COLUMNS.LOGS);
  }

  /**
   * タスクIDで検索
   * @param {string} taskId
   * @returns {object[]}
   */
  findByTaskId(taskId) {
    return this.findByColumn('taskId', taskId);
  }

  /**
   * ユーザーIDで検索
   * @param {string} userId
   * @returns {object[]}
   */
  findByUserId(userId) {
    return this.findByColumn('userId', userId);
  }

  /**
   * 指定日以前のログを取得
   * @param {string} beforeDate - YYYY-MM-DD
   * @returns {string[]} 削除対象のlogId配列
   */
  findExpiredLogIds(beforeDate) {
    const { headers, rows } = this._adapter.getAllData(this._sheetName);
    const logIdIdx = headers.indexOf('logId');
    const timestampIdx = headers.indexOf('timestamp');

    return rows
      .filter(row => {
        const ts = row[timestampIdx];
        if (!ts) return false;
        const dateStr = ts instanceof Date
          ? Utilities.formatDate(ts, Session.getScriptTimeZone(), 'yyyy-MM-dd')
          : String(ts).substring(0, 10);
        return dateStr < beforeDate;
      })
      .map(row => row[logIdIdx]);
  }
}

const logRepository_ = new LogRepository();

function getLogRepository() {
  return logRepository_;
}
