/**
 * TriggerSetup.js
 * Time Triggerの設定・管理
 */

/**
 * 全トリガーを初期セットアップ
 */
function setupAllTriggers() {
  // 既存トリガーの削除
  removeAllTriggers();

  // 繰り返しタスク生成トリガー（毎時）
  ScriptApp.newTrigger('triggerProcessRecurrences')
    .timeBased()
    .everyHours(1)
    .create();

  // 日次同期トリガー（毎日午前6時）
  ScriptApp.newTrigger('triggerDailySync')
    .timeBased()
    .atHour(6)
    .everyDays(1)
    .create();

  // ログクリーンアップトリガー（毎月1日午前3時）
  ScriptApp.newTrigger('triggerMonthlyCleanup')
    .timeBased()
    .onMonthDay(1)
    .atHour(3)
    .create();

  // インデックス再構築トリガー（毎日午前2時）
  ScriptApp.newTrigger('triggerRebuildIndex')
    .timeBased()
    .atHour(2)
    .everyDays(1)
    .create();

  Logger.log('全トリガーのセットアップが完了しました');
}

/**
 * 全トリガーを削除
 */
function removeAllTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    ScriptApp.deleteTrigger(trigger);
  });
  Logger.log(`${triggers.length}件のトリガーを削除しました`);
}

/**
 * 繰り返しタスク生成処理
 */
function triggerProcessRecurrences() {
  try {
    const count = getRecurrenceService().processCompletedRecurrences();
    Logger.log(`繰り返しタスク生成トリガー完了: ${count}件生成`);
  } catch (e) {
    Logger.log(`繰り返しタスク生成トリガーエラー: ${e.message}`);
  }
}

/**
 * 日次同期処理
 */
function triggerDailySync() {
  try {
    const result = getExternalSyncService().executeDailySync();
    Logger.log(`日次同期トリガー完了: ${result.synced}件同期, ${result.errors.length}件エラー`);
  } catch (e) {
    Logger.log(`日次同期トリガーエラー: ${e.message}`);
  }
}

/**
 * 月次クリーンアップ処理
 */
function triggerMonthlyCleanup() {
  try {
    const logService = getLogService();
    const logsDeleted = logService.cleanupOldLogs();
    const tasksDeleted = logService.cleanupOldTasks();
    Logger.log(`月次クリーンアップ完了: ログ${logsDeleted}件, タスク${tasksDeleted}件削除`);
  } catch (e) {
    Logger.log(`月次クリーンアップエラー: ${e.message}`);
  }
}

/**
 * インデックス再構築処理
 */
function triggerRebuildIndex() {
  try {
    getIndexRepository().rebuildIndex();
    Logger.log('インデックス再構築完了');
  } catch (e) {
    Logger.log(`インデックス再構築エラー: ${e.message}`);
  }
}
