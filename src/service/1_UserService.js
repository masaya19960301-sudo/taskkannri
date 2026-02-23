/**
 * UserService.js
 * ユーザー管理のビジネスロジック
 */

class UserService {
  constructor() {
    this._repo = getUserRepository();
  }

  /**
   * 現在のユーザーを取得または新規登録
   * @returns {object}
   */
  getOrCreateCurrentUser() {
    const email = AuthManager.getCurrentUserEmail();
    if (!email) {
      throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Googleアカウントでのログインが必要です');
    }

    let user = this._repo.findByEmail(email);
    if (user) return user;

    // 初回アクセス時の自動登録
    // ユーザーが0人なら最初のユーザーを管理者にする
    const allUsers = this._repo.findAll();
    const role = allUsers.length === 0 ? USER_ROLE.ADMIN : USER_ROLE.USER;

    const now = new Date().toISOString();
    user = {
      userId: UUIDGenerator.generate(),
      email: email,
      displayName: email.split('@')[0],
      department: '',
      role: role,
      createdAt: now,
      updatedAt: now,
    };

    return LockManager.executeWithLock(() => {
      // ダブルチェック
      const existing = this._repo.findByEmail(email);
      if (existing) return existing;
      return this._repo.create(user);
    });
  }

  /**
   * ユーザー情報を更新
   * @param {string} userId
   * @param {object} updates
   * @param {object} currentUser
   * @returns {object}
   */
  updateUser(userId, updates, currentUser) {
    if (currentUser.userId !== userId && currentUser.role !== USER_ROLE.ADMIN) {
      throw new AppError(ERROR_CODES.FORBIDDEN, '自分以外のユーザー情報は管理者のみ更新可能です');
    }

    const validation = Validator.validateUser({ ...updates, email: updates.email || 'dummy@dummy.com' });
    if (!validation.valid) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, validation.errors.join(', '));
    }

    const existing = this._repo.findById(userId);
    if (!existing) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'ユーザーが見つかりません');
    }

    // ロール変更は管理者のみ
    if (updates.role && updates.role !== existing.role && currentUser.role !== USER_ROLE.ADMIN) {
      throw new AppError(ERROR_CODES.FORBIDDEN, 'ロール変更は管理者のみ可能です');
    }

    const updatedUser = {
      ...existing,
      displayName: updates.displayName || existing.displayName,
      department: updates.department !== undefined ? updates.department : existing.department,
      role: updates.role || existing.role,
      updatedAt: new Date().toISOString(),
    };

    const result = LockManager.executeWithLock(() => this._repo.update(userId, updatedUser));
    AuthManager.clearUserCache();
    return result;
  }

  /**
   * 全ユーザーを取得
   * @returns {object[]}
   */
  getAllUsers() {
    const cache = getCacheManager();
    const cacheKey = CACHE_KEYS.USERS_PREFIX + 'all';
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const users = this._repo.findAll();
    cache.put(cacheKey, users, APP_CONFIG.CACHE_TTL);
    return users;
  }

  /**
   * ユーザーIDで取得
   * @param {string} userId
   * @returns {object}
   */
  getUserById(userId) {
    const user = this._repo.findById(userId);
    if (!user) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'ユーザーが見つかりません');
    }
    return user;
  }

  /**
   * CSRFトークンの取得
   * @returns {string}
   */
  getCsrfToken() {
    return AuthManager.generateCsrfToken();
  }
}

const userService_ = new UserService();

function getUserService() {
  return userService_;
}
