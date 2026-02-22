/**
 * AppError.js
 * アプリケーション固有のエラークラス
 */

class AppError extends Error {
  /**
   * @param {string} code - ERROR_CODES の値
   * @param {string} message - エラーメッセージ
   * @param {object} [details] - 追加情報
   */
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details || null;
    this.name = 'AppError';
  }

  /**
   * APIレスポンス形式に変換
   * @returns {object}
   */
  toResponse() {
    return {
      success: false,
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

/**
 * エラーレスポンスを標準形式で生成
 * @param {string} code
 * @param {string} message
 * @param {object} [details]
 * @returns {object}
 */
function createErrorResponse(code, message, details) {
  return {
    success: false,
    code: code,
    message: message,
    details: details || null,
  };
}

/**
 * 成功レスポンスを標準形式で生成
 * @param {*} data
 * @param {string} [message]
 * @returns {object}
 */
function createSuccessResponse(data, message) {
  return {
    success: true,
    data: data,
    message: message || null,
  };
}
