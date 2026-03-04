/**
 * LogController.js
 * ログAPIコントローラー
 */

class LogController {
  static handle(method, taskId, params, user) {
    const service = getLogService();

    switch (method) {
      case 'GET': {
        const logs = service.getLogsByTask(taskId);
        return createSuccessResponse(logs);
      }

      default:
        return createErrorResponse(ERROR_CODES.VALIDATION_ERROR, `メソッド ${method} はサポートされていません`);
    }
  }
}
