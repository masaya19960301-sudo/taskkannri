/**
 * LockManager.js
 * LockServiceを利用した同時アクセス制御
 */

class LockManager {
  /**
   * スクリプトロックを取得して処理を実行
   * @param {Function} fn - ロック内で実行する関数
   * @param {number} waitMs - ロック取得の最大待機時間（デフォルト: 10000ms）
   * @returns {*} fn の戻り値
   */
  static executeWithLock(fn, waitMs) {
    const lock = LockService.getScriptLock();
    const timeout = waitMs || 10000;
    try {
      if (!lock.tryLock(timeout)) {
        throw new AppError(ERROR_CODES.LOCK_TIMEOUT, 'ロックの取得に失敗しました。しばらくしてから再試行してください。');
      }
      return fn();
    } finally {
      lock.releaseLock();
    }
  }

  /**
   * ドキュメントロックを取得して処理を実行
   * @param {Function} fn
   * @param {number} waitMs
   * @returns {*}
   */
  static executeWithDocumentLock(fn, waitMs) {
    const lock = LockService.getDocumentLock();
    const timeout = waitMs || 10000;
    try {
      if (!lock.tryLock(timeout)) {
        throw new AppError(ERROR_CODES.LOCK_TIMEOUT, 'ドキュメントロックの取得に失敗しました。');
      }
      return fn();
    } finally {
      lock.releaseLock();
    }
  }
}
