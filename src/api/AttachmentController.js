/**
 * AttachmentController.js
 * 添付ファイルAPIコントローラー
 */

class AttachmentController {
  static handle(method, taskId, attachmentId, params, user) {
    const service = getAttachmentService();

    switch (method) {
      case 'GET': {
        if (attachmentId) {
          const url = service.getDownloadUrl(attachmentId);
          return createSuccessResponse({ url });
        }
        const attachments = service.getAttachments(taskId);
        return createSuccessResponse(attachments);
      }

      case 'POST': {
        const created = service.addAttachment(taskId, params, user);
        return createSuccessResponse(created, '添付ファイルを追加しました');
      }

      case 'DELETE': {
        if (!attachmentId) {
          return createErrorResponse(ERROR_CODES.VALIDATION_ERROR, '添付ファイルIDが必要です');
        }
        service.deleteAttachment(attachmentId, user);
        return createSuccessResponse(null, '添付ファイルを削除しました');
      }

      default:
        return createErrorResponse(ERROR_CODES.VALIDATION_ERROR, `メソッド ${method} はサポートされていません`);
    }
  }
}
