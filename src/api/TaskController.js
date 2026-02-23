/**
 * TaskController.js
 * タスクAPIコントローラー
 */

class TaskController {
  /**
   * タスクAPI リクエストハンドラ
   * @param {string} method
   * @param {string|null} taskId
   * @param {object} params
   * @param {object} user
   * @returns {object}
   */
  static handle(method, taskId, params, user) {
    const service = getTaskService();

    switch (method) {
      case 'GET':
        if (taskId) {
          return TaskController._getTask(service, taskId);
        }
        return TaskController._listTasks(service, params);

      case 'POST':
        return TaskController._createTask(service, params, user);

      case 'PUT':
        if (!taskId) {
          return createErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'タスクIDが必要です');
        }
        return TaskController._updateTask(service, taskId, params, user);

      case 'DELETE':
        if (!taskId) {
          return createErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'タスクIDが必要です');
        }
        return TaskController._deleteTask(service, taskId, user);

      default:
        return createErrorResponse(ERROR_CODES.VALIDATION_ERROR, `メソッド ${method} はサポートされていません`);
    }
  }

  /**
   * sortOrder一括更新ハンドラ
   */
  static handleSort(params, user) {
    const service = getTaskService();
    service.updateSortOrders(params.orders, user);
    return createSuccessResponse(null, 'ソート順を更新しました');
  }

  static _getTask(service, taskId) {
    const task = service.getTask(taskId);
    return createSuccessResponse(task);
  }

  static _listTasks(service, params) {
    const filters = {};
    if (params.assigneeId) filters.assigneeId = params.assigneeId;
    if (params.categoryId) filters.categoryId = params.categoryId;
    if (params.priority) filters.priority = params.priority;
    if (params.keyword) filters.keyword = params.keyword;
    if (params.status) filters.status = params.status;
    if (params.includeCompleted) filters.includeCompleted = params.includeCompleted;

    const limit = Number(params.limit) || APP_CONFIG.MAX_DISPLAY;
    const offset = Number(params.offset) || 0;

    // 完了タスクのみ検索
    if (params.status === TASK_STATUS.COMPLETED) {
      const result = service.getCompletedTasks(filters, limit);
      return createSuccessResponse(result);
    }

    // includeCompleted含むアクティブタスク取得
    const result = service.getActiveTasks(filters, limit, offset);
    return createSuccessResponse(result);
  }

  static _createTask(service, params, user) {
    const task = service.createTask(params, user);
    return createSuccessResponse(task, 'タスクを作成しました');
  }

  static _updateTask(service, taskId, params, user) {
    const task = service.updateTask(taskId, params, user);
    return createSuccessResponse(task, 'タスクを更新しました');
  }

  static _deleteTask(service, taskId, user) {
    service.deleteTask(taskId, user);
    return createSuccessResponse(null, 'タスクを削除しました');
  }
}
