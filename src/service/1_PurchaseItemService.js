/**
 * PurchaseItemService.js
 * 購入品管理のビジネスロジック
 */

class PurchaseItemService {
  constructor() {
    this._repo = getPurchaseItemRepository();
  }

  /**
   * アクティブな購入品一覧を取得（購入済以外）
   * @returns {object[]}
   */
  getActiveItems() {
    return this._repo.findActiveItems();
  }

  /**
   * 全購入品を取得（履歴検索用）
   * @param {object} filters
   * @returns {object[]}
   */
  getAllItems(filters) {
    let items = this._repo.findAll();

    if (filters) {
      if (filters.status) {
        items = items.filter(item => item.status === filters.status);
      }
      if (filters.keyword) {
        const kw = filters.keyword.toLowerCase();
        items = items.filter(item =>
          (item.itemName && String(item.itemName).toLowerCase().includes(kw)) ||
          (item.notes && String(item.notes).toLowerCase().includes(kw))
        );
      }
      if (filters.assigneeId) {
        items = items.filter(item => item.assigneeId === filters.assigneeId);
      }
    }

    // 新しい順にソート
    items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return items;
  }

  /**
   * 購入品を作成
   * @param {object} data
   * @param {object} currentUser
   * @returns {object}
   */
  createItem(data, currentUser) {
    if (!data.itemName || String(data.itemName).trim().length === 0) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, '商品名は必須です');
    }

    const now = new Date().toISOString();
    const item = {
      itemId: UUIDGenerator.generate(),
      itemName: Validator.sanitize(data.itemName),
      purchaseDate: data.purchaseDate || '',
      assigneeId: data.assigneeId || '',
      notes: data.notes ? Validator.sanitize(data.notes) : '',
      status: PURCHASE_STATUS.NOT_ARRANGED,
      expectedDeliveryDate: '',
      createdAt: now,
      updatedAt: now,
      createdBy: currentUser.userId,
      updatedBy: currentUser.userId,
    };

    return LockManager.executeWithLock(() => this._repo.create(item));
  }

  /**
   * 購入品を更新
   * @param {string} itemId
   * @param {object} updates
   * @param {object} currentUser
   * @returns {object}
   */
  updateItem(itemId, updates, currentUser) {
    const existing = this._repo.findById(itemId);
    if (!existing) {
      throw new AppError(ERROR_CODES.NOT_FOUND, '購入品が見つかりません');
    }

    const now = new Date().toISOString();
    const updated = {
      ...existing,
      itemName: updates.itemName !== undefined ? Validator.sanitize(updates.itemName) : existing.itemName,
      purchaseDate: updates.purchaseDate !== undefined ? updates.purchaseDate : existing.purchaseDate,
      assigneeId: updates.assigneeId !== undefined ? updates.assigneeId : existing.assigneeId,
      notes: updates.notes !== undefined ? Validator.sanitize(updates.notes) : existing.notes,
      status: updates.status !== undefined ? updates.status : existing.status,
      expectedDeliveryDate: updates.expectedDeliveryDate !== undefined ? updates.expectedDeliveryDate : existing.expectedDeliveryDate,
      updatedAt: now,
      updatedBy: currentUser.userId,
    };

    return LockManager.executeWithLock(() => this._repo.update(itemId, updated));
  }

  /**
   * 購入品を削除
   * @param {string} itemId
   * @param {object} currentUser
   * @returns {boolean}
   */
  deleteItem(itemId, currentUser) {
    const existing = this._repo.findById(itemId);
    if (!existing) {
      throw new AppError(ERROR_CODES.NOT_FOUND, '購入品が見つかりません');
    }

    return LockManager.executeWithLock(() => this._repo.delete(itemId));
  }
}

const purchaseItemService_ = new PurchaseItemService();

function getPurchaseItemService() {
  return purchaseItemService_;
}
