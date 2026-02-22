/**
 * AuthController.js
 * 認証APIコントローラー
 */

class AuthController {
  static handle(method, action, params, user) {
    switch (method) {
      case 'GET':
        if (action === 'me') {
          return createSuccessResponse(user);
        }
        if (action === 'csrf') {
          const token = AuthManager.generateCsrfToken();
          return createSuccessResponse({ csrfToken: token });
        }
        return createErrorResponse(ERROR_CODES.NOT_FOUND, `認証アクション ${action} が見つかりません`);

      case 'POST':
        if (action === 'register') {
          const userService = getUserService();
          const registered = userService.getOrCreateCurrentUser();
          if (params.displayName) {
            return createSuccessResponse(
              userService.updateUser(registered.userId, {
                displayName: params.displayName,
                department: params.department || '',
              }, registered)
            );
          }
          return createSuccessResponse(registered);
        }
        return createErrorResponse(ERROR_CODES.NOT_FOUND, `認証アクション ${action} が見つかりません`);

      default:
        return createErrorResponse(ERROR_CODES.VALIDATION_ERROR, `メソッド ${method} はサポートされていません`);
    }
  }
}
