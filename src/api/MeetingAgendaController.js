/**
 * MeetingAgendaController.js
 * 定例会議案APIコントローラー
 */

class MeetingAgendaController {
  static handle(method, agendaId, params, user) {
    const service = getMeetingAgendaService();

    switch (method) {
      case 'GET':
        if (agendaId) {
          const agenda = service.getAllAgendas({}).find(a => a.agendaId === agendaId);
          if (!agenda) {
            return createErrorResponse(ERROR_CODES.NOT_FOUND, '議案が見つかりません');
          }
          return createSuccessResponse(agenda);
        }
        const agendas = params.includeAnswered === 'true'
          ? service.getAllAgendas(params)
          : service.getActiveAgendas();
        return createSuccessResponse({ agendas });

      case 'POST':
        const created = service.createAgenda(params, user);
        return createSuccessResponse(created, '議案を登録しました');

      case 'PUT':
        if (!agendaId) {
          return createErrorResponse(ERROR_CODES.VALIDATION_ERROR, '議案IDが必要です');
        }
        const updated = service.updateAgenda(agendaId, params, user);
        return createSuccessResponse(updated, '議案を更新しました');

      case 'DELETE':
        if (!agendaId) {
          return createErrorResponse(ERROR_CODES.VALIDATION_ERROR, '議案IDが必要です');
        }
        service.deleteAgenda(agendaId, user);
        return createSuccessResponse(null, '議案を削除しました');

      default:
        return createErrorResponse(ERROR_CODES.VALIDATION_ERROR, `メソッド ${method} はサポートされていません`);
    }
  }
}
