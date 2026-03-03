/**
 * Router.js
 * REST風APIルーター
 * google.script.run からの呼び出しをルーティングする
 */

/**
 * APIリクエストを処理するメインエントリポイント
 * @param {string} method - GET/POST/PUT/DELETE
 * @param {string} path - エンドポイントパス（例: /tasks, /tasks/{id}）
 * @param {object} params - リクエストパラメータ
 * @param {string} csrfToken - CSRFトークン（書き込み操作時）
 * @returns {object} APIレスポンス
 */
function apiRequest(method, path, params, csrfToken) {
  try {
    // 認証チェック
    const currentUser = AuthManager.authenticate();

    // 初回アクセスユーザーの自動登録
    let user = currentUser;
    if (!user) {
      user = getUserService().getOrCreateCurrentUser();
    }

    // CSRF検証（書き込み操作）
    if (['POST', 'PUT', 'DELETE'].includes(method)) {
      if (!AuthManager.validateCsrfToken(csrfToken)) {
        return createErrorResponse(ERROR_CODES.INVALID_CSRF, 'CSRFトークンが無効です');
      }
    }

    // ルーティング
    return routeRequest(method, path, params || {}, user);
  } catch (e) {
    if (e instanceof AppError) {
      return e.toResponse();
    }
    Logger.log(`APIエラー: ${e.message}\n${e.stack}`);
    return createErrorResponse(ERROR_CODES.INTERNAL_ERROR, `内部エラーが発生しました: ${e.message}`);
  }
}

/**
 * リクエストをルーティング
 * @param {string} method
 * @param {string} path
 * @param {object} params
 * @param {object} user
 * @returns {object}
 */
function routeRequest(method, path, params, user) {
  // パスからIDを抽出
  const pathParts = path.split('/').filter(p => p);

  // /tasks
  if (pathParts[0] === 'tasks') {
    if (pathParts.length === 1) {
      return TaskController.handle(method, null, params, user);
    }
    // /tasks/{id}
    if (pathParts.length === 2) {
      return TaskController.handle(method, pathParts[1], params, user);
    }
    // /tasks/{id}/attachments
    if (pathParts.length === 3 && pathParts[2] === 'attachments') {
      return AttachmentController.handle(method, pathParts[1], null, params, user);
    }
    // /tasks/{id}/attachments/{attachmentId}
    if (pathParts.length === 4 && pathParts[2] === 'attachments') {
      return AttachmentController.handle(method, pathParts[1], pathParts[3], params, user);
    }
    // /tasks/{id}/logs
    if (pathParts.length === 3 && pathParts[2] === 'logs') {
      return LogController.handle(method, pathParts[1], params, user);
    }
    // /tasks/{id}/sort
    if (pathParts.length === 3 && pathParts[2] === 'sort') {
      return TaskController.handleSort(params, user);
    }
  }

  // /users
  if (pathParts[0] === 'users') {
    if (pathParts.length === 1) {
      return UserController.handle(method, null, params, user);
    }
    if (pathParts.length === 2) {
      return UserController.handle(method, pathParts[1], params, user);
    }
  }

  // /categories
  if (pathParts[0] === 'categories') {
    if (pathParts.length === 1) {
      return CategoryController.handle(method, null, params, user);
    }
    if (pathParts.length === 2) {
      return CategoryController.handle(method, pathParts[1], params, user);
    }
  }

  // /sync
  if (pathParts[0] === 'sync') {
    return SyncController.handle(method, pathParts[1] || null, params, user);
  }

  // /calendar
  if (pathParts[0] === 'calendar') {
    return CalendarController.handle(method, pathParts[1] || null, params, user);
  }

  // /recurrence
  if (pathParts[0] === 'recurrence') {
    return RecurrenceController.handle(method, pathParts[1] || null, params, user);
  }

  // /auth
  if (pathParts[0] === 'auth') {
    return AuthController.handle(method, pathParts[1] || null, params, user);
  }

  // /purchase-items
  if (pathParts[0] === 'purchase-items') {
    if (pathParts.length === 1) {
      return PurchaseItemController.handle(method, null, params, user);
    }
    if (pathParts.length === 2) {
      return PurchaseItemController.handle(method, pathParts[1], params, user);
    }
  }

  // /meeting-agenda
  if (pathParts[0] === 'meeting-agenda') {
    if (pathParts.length === 1) {
      return MeetingAgendaController.handle(method, null, params, user);
    }
    if (pathParts.length === 2) {
      return MeetingAgendaController.handle(method, pathParts[1], params, user);
    }
  }

  return createErrorResponse(ERROR_CODES.NOT_FOUND, `エンドポイント ${path} が見つかりません`);
}
