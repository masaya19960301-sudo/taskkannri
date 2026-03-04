/**
 * CategoryController.js
 * カテゴリAPIコントローラー
 */

class CategoryController {
  static handle(method, categoryId, params, user) {
    const service = getCategoryService();

    switch (method) {
      case 'GET': {
        const categories = service.getAllCategories();
        return createSuccessResponse(categories);
      }

      case 'POST': {
        const created = service.createCategory(params, user);
        return createSuccessResponse(created, 'カテゴリを作成しました');
      }

      case 'PUT': {
        if (!categoryId) {
          return createErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'カテゴリIDが必要です');
        }
        const updated = service.updateCategory(categoryId, params, user);
        return createSuccessResponse(updated, 'カテゴリを更新しました');
      }

      case 'DELETE': {
        if (!categoryId) {
          return createErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'カテゴリIDが必要です');
        }
        service.deleteCategory(categoryId, user);
        return createSuccessResponse(null, 'カテゴリを削除しました');
      }

      default:
        return createErrorResponse(ERROR_CODES.VALIDATION_ERROR, `メソッド ${method} はサポートされていません`);
    }
  }
}
