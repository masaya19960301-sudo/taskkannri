/**
 * ClaimSheetTrigger.js
 * クレーム情報スプレッドシート（元シート）に設置するスクリプト
 *
 * ■ 設置手順:
 *   1. クレーム情報スプレッドシートを開く
 *   2. 拡張機能 → Apps Script を開く
 *   3. このファイルの内容を貼り付ける
 *   4. 下記の定数を設定する:
 *      - TASK_APP_URL: タスク管理アプリのWebアプリURL（デプロイ後のURL）
 *      - SYNC_TOKEN: タスク管理アプリで generateSyncToken() を実行して取得したトークン
 *   5. setupOnEditTrigger() を1回実行する（installable onEditトリガーを登録）
 *
 * ■ 動作:
 *   - クレーム情報シートが編集されると、タスク管理アプリに同期リクエストを送信
 *   - 連続編集時のスパムを防ぐため、5分間のデバウンスあり
 */

// ====== 設定（必ず変更してください） ======
const TASK_APP_URL = '';  // タスク管理アプリのデプロイURL（例: https://script.google.com/macros/s/xxxx/exec）
const SYNC_TOKEN = '';    // タスク管理アプリで generateSyncToken() を実行して取得
// ==========================================

const DEBOUNCE_MINUTES = 5; // 同期の最小間隔（分）

/**
 * installable onEditトリガーを設定（初回1回だけ実行）
 */
function setupOnEditTrigger() {
  // 既存のonEditトリガーを削除
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'onSheetEdit') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // 新規トリガー作成
  ScriptApp.newTrigger('onSheetEdit')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();

  Logger.log('onEditトリガーを設定しました');
}

/**
 * 編集時ハンドラ（installable trigger）
 * 対象列（C,D,G,K,L,M,N,V,W,X,AA）の変更時のみ同期をトリガー
 */
function onSheetEdit(e) {
  if (!TASK_APP_URL) {
    Logger.log('TASK_APP_URLが未設定です');
    return;
  }

  const range = e.range;
  const sheet = range.getSheet();

  // 最初のシートのみ対象
  if (sheet.getIndex() !== 1) return;

  // 対象行（11〜102）のみ
  const row = range.getRow();
  if (row < 11 || row > 102) return;

  // 対象列のみ（C=3, D=4, G=7, K=11, L=12, M=13, N=14, V=22, W=23, X=24, AA=27）
  const targetCols = [3, 4, 7, 11, 12, 13, 14, 22, 23, 24, 27];
  const col = range.getColumn();
  const lastCol = range.getLastColumn();
  const hasTargetCol = targetCols.some(c => c >= col && c <= lastCol);
  if (!hasTargetCol) return;

  // デバウンス: 前回同期から5分以内はスキップ
  const cache = CacheService.getScriptCache();
  const lastSync = cache.get('lastClaimSync');
  if (lastSync) {
    Logger.log('デバウンス中のためスキップ（前回: ' + lastSync + '）');
    return;
  }

  // デバウンスフラグを設定
  cache.put('lastClaimSync', new Date().toISOString(), DEBOUNCE_MINUTES * 60);

  // 非同期で同期リクエスト送信
  try {
    const sheetId = SpreadsheetApp.getActive().getId();
    const payload = {
      action: 'claimSync',
      sheetId: sheetId,
      token: SYNC_TOKEN,
    };

    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    };

    const response = UrlFetchApp.fetch(TASK_APP_URL, options);
    Logger.log('同期リクエスト送信: ' + response.getContentText());
  } catch (err) {
    Logger.log('同期リクエストエラー: ' + err.message);
  }
}
