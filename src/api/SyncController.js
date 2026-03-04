/**
 * SyncController.js
 * 外部同期APIコントローラー
 */

class SyncController {
  static handle(method, action, params, user) {
    const service = getExternalSyncService();

    switch (method) {
      case 'POST': {
        if (action === 'manual') {
          if (!params.taskId) {
            return createErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'taskId が必要です');
          }
          const result = service.syncTask(params.taskId, user);
          return createSuccessResponse(result, '同期が完了しました');
        }
        if (action === 'link') {
          const link = service.createLink(params, user);
          return createSuccessResponse(link, '外部リンクを作成しました');
        }
        if (action === 'daily') {
          AuthManager.authorize(user, USER_ROLE.ADMIN);
          const result = service.executeDailySync();
          return createSuccessResponse(result, '日次同期が完了しました');
        }
        return createErrorResponse(ERROR_CODES.NOT_FOUND, `同期アクション ${action} が見つかりません`);
      }

      default:
        return createErrorResponse(ERROR_CODES.VALIDATION_ERROR, `メソッド ${method} はサポートされていません`);
    }
  }
}
