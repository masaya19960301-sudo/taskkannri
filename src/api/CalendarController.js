/**
 * CalendarController.js
 * カレンダー連携APIコントローラー
 */

class CalendarController {
  static handle(method, action, params, user) {
    const service = getCalendarService();

    switch (method) {
      case 'POST': {
        if (!params.taskId) {
          return createErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'taskId が必要です');
        }
        if (action === 'sync') {
          const result = service.syncTaskToCalendar(params.taskId, user);
          return createSuccessResponse(result, 'カレンダーに同期しました');
        }
        if (action === 'delete') {
          service.deleteCalendarEvent(params.taskId);
          return createSuccessResponse(null, 'カレンダーイベントを削除しました');
        }
        return createErrorResponse(ERROR_CODES.NOT_FOUND, `カレンダーアクション ${action} が見つかりません`);
      }

      default:
        return createErrorResponse(ERROR_CODES.VALIDATION_ERROR, `メソッド ${method} はサポートされていません`);
    }
  }
}
