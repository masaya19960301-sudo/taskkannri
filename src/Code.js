/**
 * Code.js
 * メインエントリポイント
 * GAS HTMLServiceでのSPA配信とAPIエンドポイント
 */

/**
 * Webアプリケーションのエントリポイント
 */
function doGet(e) {
  const html = HtmlService.createTemplateFromFile('frontend/index')
    .evaluate()
    .setTitle('TO DO - タスク管理')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  return html;
}

/**
 * HTMLテンプレート内で他のHTMLファイルをインクルード
 * @param {string} filename
 * @returns {string}
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * APIリクエストのグローバルエントリポイント
 * google.script.run.api() から呼び出される
 * @param {string} method
 * @param {string} path
 * @param {object} params
 * @param {string} csrfToken
 * @returns {object}
 */
function api(method, path, params, csrfToken) {
  return apiRequest(method, path, params, csrfToken);
}

/**
 * 初期データ一括取得（初回ロード最適化）
 * @returns {object}
 */
function getInitialData() {
  try {
    const user = getUserService().getOrCreateCurrentUser();
    const csrfToken = AuthManager.generateCsrfToken();
    const taskResult = getTaskService().getActiveTasks({}, APP_CONFIG.MAX_DISPLAY, 0);
    const categories = getCategoryService().getAllCategories();
    const users = getUserService().getAllUsers();

    return createSuccessResponse({
      currentUser: user,
      csrfToken: csrfToken,
      tasks: taskResult.tasks,
      taskTotal: taskResult.total,
      categories: categories,
      users: users,
    });
  } catch (e) {
    if (e instanceof AppError) return e.toResponse();
    Logger.log(`初期データ取得エラー: ${e.message}`);
    return createErrorResponse(ERROR_CODES.INTERNAL_ERROR, e.message);
  }
}

/**
 * スプレッドシート初期化（初回のみ実行）
 */
function setupSpreadsheet() {
  return initializeSpreadsheet();
}
