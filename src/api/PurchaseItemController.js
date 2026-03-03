/**
 * PurchaseItemController.js
 * 購入品APIコントローラー
 */

class PurchaseItemController {
  static handle(method, itemId, params, user) {
    const service = getPurchaseItemService();

    switch (method) {
      case 'GET':
        if (itemId) {
          const item = service.getAllItems({}).find(i => i.itemId === itemId);
          if (!item) {
            return createErrorResponse(ERROR_CODES.NOT_FOUND, '購入品が見つかりません');
          }
          return createSuccessResponse(item);
        }
        const items = params.includeCompleted === 'true'
          ? service.getAllItems(params)
          : service.getActiveItems();
        return createSuccessResponse({ items });

      case 'POST':
        const created = service.createItem(params, user);
        return createSuccessResponse(created, '購入品を登録しました');

      case 'PUT':
        if (!itemId) {
          return createErrorResponse(ERROR_CODES.VALIDATION_ERROR, '購入品IDが必要です');
        }
        const updated = service.updateItem(itemId, params, user);
        return createSuccessResponse(updated, '購入品を更新しました');

      case 'DELETE':
        if (!itemId) {
          return createErrorResponse(ERROR_CODES.VALIDATION_ERROR, '購入品IDが必要です');
        }
        service.deleteItem(itemId, user);
        return createSuccessResponse(null, '購入品を削除しました');

      default:
        return createErrorResponse(ERROR_CODES.VALIDATION_ERROR, `メソッド ${method} はサポートされていません`);
    }
  }
}
