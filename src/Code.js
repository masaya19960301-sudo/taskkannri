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

/**
 * クレームシートID設定を取得
 * @returns {string}
 */
function getClaimSheetIdSetting() {
  const props = PropertiesService.getScriptProperties();
  return props.getProperty('CLAIM_SHEET_ID') || '';
}

/**
 * クレームシートID設定を保存
 * @param {string} sheetId
 */
function saveClaimSheetIdSetting(sheetId) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty('CLAIM_SHEET_ID', sheetId || '');
}

/**
 * クレーム同期を手動実行
 * @param {string} sheetId
 * @returns {object}
 */
function runClaimSync(sheetId) {
  return getClaimSyncService().syncClaimTasks(sheetId);
}

/**
 * 元シートからの即時同期リクエスト受付（doPost）
 * 元シートのonEditトリガーからUrlFetchApp経由で呼ばれる
 * @param {object} e - POSTイベント
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;

    // 同期トークン検証
    const props = PropertiesService.getScriptProperties();
    const syncToken = props.getProperty('SYNC_TOKEN');
    if (syncToken && payload.token !== syncToken) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, message: '認証エラー' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'claimSync') {
      const sheetId = payload.sheetId || props.getProperty('CLAIM_SHEET_ID');
      if (!sheetId) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, message: 'シートID未設定' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const result = getClaimSyncService().syncClaimTasks(sheetId);
      return ContentService.createTextOutput(JSON.stringify({ success: true, data: result }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ success: false, message: '不明なアクション' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    Logger.log('doPostエラー: ' + err.message);
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 未完了タスクのカレンダーイベントを一括再同期（管理者用）
 * @returns {{ synced: number, failed: number }}
 */
function runCalendarResync() {
  const user = getUserService().getOrCreateCurrentUser();
  return getCalendarService().rebuildAllCalendarEvents(user);
}

/**
 * 同期トークンを生成・保存
 * @returns {string} 生成されたトークン
 */
function generateSyncToken() {
  const token = UUIDGenerator.generate();
  PropertiesService.getScriptProperties().setProperty('SYNC_TOKEN', token);
  return token;
}

/**
 * 同期トークンを取得
 * @returns {string}
 */
function getSyncToken() {
  return PropertiesService.getScriptProperties().getProperty('SYNC_TOKEN') || '';
}
