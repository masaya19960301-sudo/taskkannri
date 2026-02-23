/**
 * CategoryService.js
 * カテゴリ管理のビジネスロジック
 */

class CategoryService {
  constructor() {
    this._repo = getCategoryRepository();
  }

  /**
   * カテゴリ一覧を取得（キャッシュ付き）
   * @returns {object[]}
   */
  getAllCategories() {
    const cache = getCacheManager();
    const cached = cache.get(CACHE_KEYS.CATEGORIES);
    if (cached) return cached;

    const categories = this._repo.findAllSorted();
    cache.put(CACHE_KEYS.CATEGORIES, categories, APP_CONFIG.CACHE_TTL);
    return categories;
  }

  /**
   * カテゴリを作成
   * @param {object} categoryData
   * @param {object} currentUser
   * @returns {object}
   */
  createCategory(categoryData, currentUser) {
    if (!categoryData.name || categoryData.name.trim().length === 0) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'カテゴリ名は必須です');
    }

    const existing = this._repo.findByName(categoryData.name);
    if (existing) {
      throw new AppError(ERROR_CODES.CONFLICT, '同じ名前のカテゴリが既に存在します');
    }

    const category = {
      categoryId: UUIDGenerator.generate(),
      name: Validator.sanitize(categoryData.name),
      color: categoryData.color || '#4a86c8',
      sortOrder: Number(categoryData.sortOrder) || 0,
      createdAt: new Date().toISOString(),
    };

    const result = LockManager.executeWithLock(() => this._repo.create(category));
    getCacheManager().remove(CACHE_KEYS.CATEGORIES);
    return result;
  }

  /**
   * カテゴリを更新
   * @param {string} categoryId
   * @param {object} updates
   * @param {object} currentUser
   * @returns {object}
   */
  updateCategory(categoryId, updates, currentUser) {
    const existing = this._repo.findById(categoryId);
    if (!existing) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'カテゴリが見つかりません');
    }

    const updated = {
      ...existing,
      name: updates.name !== undefined ? Validator.sanitize(updates.name) : existing.name,
      color: updates.color || existing.color,
      sortOrder: updates.sortOrder !== undefined ? Number(updates.sortOrder) : existing.sortOrder,
    };

    const result = LockManager.executeWithLock(() => this._repo.update(categoryId, updated));
    getCacheManager().remove(CACHE_KEYS.CATEGORIES);
    return result;
  }

  /**
   * カテゴリを削除
   * @param {string} categoryId
   * @param {object} currentUser
   * @returns {boolean}
   */
  deleteCategory(categoryId, currentUser) {
    const existing = this._repo.findById(categoryId);
    if (!existing) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'カテゴリが見つかりません');
    }

    const result = LockManager.executeWithLock(() => this._repo.delete(categoryId));
    getCacheManager().remove(CACHE_KEYS.CATEGORIES);
    return result;
  }
}

const categoryService_ = new CategoryService();

function getCategoryService() {
  return categoryService_;
}
