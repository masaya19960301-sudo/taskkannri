/**
 * UserController.js
 * ユーザーAPIコントローラー
 */

class UserController {
  static handle(method, userId, params, user) {
    const service = getUserService();

    switch (method) {
      case 'GET':
        if (userId) {
          const targetUser = service.getUserById(userId);
          return createSuccessResponse(targetUser);
        }
        const users = service.getAllUsers();
        return createSuccessResponse(users);

      case 'PUT':
        if (!userId) {
          return createErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'ユーザーIDが必要です');
        }
        const updated = service.updateUser(userId, params, user);
        return createSuccessResponse(updated, 'ユーザー情報を更新しました');

      default:
        return createErrorResponse(ERROR_CODES.VALIDATION_ERROR, `メソッド ${method} はサポートされていません`);
    }
  }
}
