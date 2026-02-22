/**
 * PerformanceTest.js
 * パフォーマンステスト（5000件対応）
 */

/**
 * パフォーマンステストを実行
 * @returns {object} テスト結果
 */
function runPerformanceTest() {
  const results = {};

  // 1. 5000件のタスクデータ生成テスト
  Logger.log('=== パフォーマンステスト開始 ===');

  results.dataGeneration = measureTime('5000件データ生成', () => {
    return generateTestData(5000);
  });

  // 2. アクティブタスク取得（200件制限）
  results.activeTasksFetch = measureTime('アクティブタスク取得(200件制限)', () => {
    const repo = getTaskRepository();
    return repo.findActiveTasks(200, 0);
  });

  // 3. フィルタ付きアクティブタスク取得
  results.filteredTasksFetch = measureTime('フィルタ付きタスク取得', () => {
    const service = getTaskService();
    return service.getActiveTasks({ priority: 3 }, 200, 0);
  });

  // 4. キーワード検索
  results.keywordSearch = measureTime('キーワード検索', () => {
    const service = getTaskService();
    return service.getActiveTasks({ keyword: 'API' }, 200, 0);
  });

  // 5. 完了タスク検索
  results.completedSearch = measureTime('完了タスク検索', () => {
    const repo = getTaskRepository();
    return repo.findCompletedTasks({ keyword: 'テスト' }, 200);
  });

  // 6. インデックス再構築
  results.indexRebuild = measureTime('インデックス再構築', () => {
    const indexRepo = getIndexRepository();
    return indexRepo.rebuildIndex();
  });

  // 7. インデックスからのID取得
  results.indexFetch = measureTime('インデックスからID取得', () => {
    const indexRepo = getIndexRepository();
    return indexRepo.getActiveTaskIds(200);
  });

  // 8. キャッシュ読み書き
  results.cacheTest = measureTime('キャッシュ読み書き(100回)', () => {
    const cache = getCacheManager();
    for (let i = 0; i < 100; i++) {
      cache.put('perf_test_' + i, { data: 'test_' + i }, 60);
    }
    for (let i = 0; i < 100; i++) {
      cache.get('perf_test_' + i);
    }
    for (let i = 0; i < 100; i++) {
      cache.remove('perf_test_' + i);
    }
  });

  // 9. バルク更新テスト
  results.bulkUpdate = measureTime('バルク更新(100件)', () => {
    const repo = getTaskRepository();
    const tasks = repo.findActiveTasks(100, 0);
    if (tasks.length === 0) return;

    const updates = tasks.slice(0, 100).map(t => ({
      id: t.taskId,
      entity: { ...t, updatedAt: new Date().toISOString() },
    }));
    return repo.updateBatch(updates);
  });

  // 10. sortOrder一括更新
  results.sortOrderUpdate = measureTime('sortOrder一括更新(50件)', () => {
    const repo = getTaskRepository();
    const tasks = repo.findActiveTasks(50, 0);
    const orders = tasks.map((t, i) => ({
      taskId: t.taskId,
      sortOrder: i * 10,
    }));
    return repo.updateSortOrders(orders);
  });

  // テストデータクリーンアップ
  results.cleanup = measureTime('テストデータ削除', () => {
    return clearTestData();
  });

  // 結果レポート
  Logger.log('=== パフォーマンステスト結果 ===');
  Object.keys(results).forEach(key => {
    Logger.log(`${key}: ${results[key].duration}ms`);
  });

  return results;
}

/**
 * 処理時間計測ヘルパー
 */
function measureTime(label, fn) {
  const start = new Date().getTime();
  let result;
  try {
    result = fn();
  } catch (e) {
    Logger.log(`${label}: エラー - ${e.message}`);
    return { duration: new Date().getTime() - start, error: e.message };
  }
  const duration = new Date().getTime() - start;
  Logger.log(`${label}: ${duration}ms`);
  return { duration, result };
}
