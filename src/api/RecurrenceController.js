/**
 * RecurrenceController.js
 * 繰り返し設定APIコントローラー
 */

class RecurrenceController {
  static handle(method, recurrenceId, params, user) {
    const service = getRecurrenceService();

    switch (method) {
      case 'GET':
        const recurrences = service.getAllRecurrences();
        return createSuccessResponse(recurrences);

      case 'POST':
        const created = service.createRecurrence(params, user);
        return createSuccessResponse(created, '繰り返し設定を作成しました');

      case 'DELETE':
        if (!recurrenceId) {
          return createErrorResponse(ERROR_CODES.VALIDATION_ERROR, '繰り返しIDが必要です');
        }
        service.removeRecurrence(recurrenceId, user);
        return createSuccessResponse(null, '繰り返し設定を解除しました');

      default:
        return createErrorResponse(ERROR_CODES.VALIDATION_ERROR, `メソッド ${method} はサポートされていません`);
    }
  }
}
