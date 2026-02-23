/**
 * AuthManager.js
 * セッション管理・認証・CSRF対策
 */

class AuthManager {
  /**
   * 現在のユーザーメールアドレスを取得
   * @returns {string}
   */
  static getCurrentUserEmail() {
    return Session.getActiveUser().getEmail();
  }

  /**
   * 現在のユーザー情報を取得（キャッシュ付き）
   * @returns {object|null}
   */
  static getCurrentUser() {
    const email = AuthManager.getCurrentUserEmail();
    if (!email) return null;

    const cache = getCacheManager();
    const cacheKey = CACHE_KEYS.CURRENT_USER + email;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const adapter = getSpreadsheetAdapter();
    const result = adapter.findByColumn(SHEET_NAMES.USERS, 'email', email);
    if (result.length === 0) return null;

    const user = result[0].data;
    cache.put(cacheKey, user, 600);
    return user;
  }

  /**
   * ログインチェック（未登録ユーザーはnullを返す）
   * @returns {object|null}
   */
  static authenticate() {
    const email = AuthManager.getCurrentUserEmail();
    if (!email) {
      throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Googleアカウントでのログインが必要です');
    }
    return AuthManager.getCurrentUser();
  }

  /**
   * ロールチェック
   * @param {object} user
   * @param {string} requiredRole
   * @returns {boolean}
   */
  static authorize(user, requiredRole) {
    if (!user) {
      throw new AppError(ERROR_CODES.UNAUTHORIZED, '認証が必要です');
    }
    if (requiredRole === USER_ROLE.ADMIN && user.role !== USER_ROLE.ADMIN) {
      throw new AppError(ERROR_CODES.FORBIDDEN, '管理者権限が必要です');
    }
    return true;
  }

  /**
   * CSRFトークンを生成
   * @returns {string}
   */
  static generateCsrfToken() {
    const email = AuthManager.getCurrentUserEmail();
    const token = UUIDGenerator.generate();
    const cache = getCacheManager();
    cache.put(CACHE_KEYS.CSRF_PREFIX + email, token, 3600);
    return token;
  }

  /**
   * CSRFトークンを検証
   * @param {string} token
   * @returns {boolean}
   */
  static validateCsrfToken(token) {
    if (!token) return false;
    const email = AuthManager.getCurrentUserEmail();
    const cache = getCacheManager();
    const storedToken = cache.get(CACHE_KEYS.CSRF_PREFIX + email);
    return storedToken === token;
  }

  /**
   * ユーザーキャッシュをクリア
   */
  static clearUserCache() {
    const email = AuthManager.getCurrentUserEmail();
    if (email) {
      getCacheManager().remove(CACHE_KEYS.CURRENT_USER + email);
    }
  }
}
