/**
 * TestDataGenerator.js
 * テストデータ生成
 */

/**
 * テストデータを生成してスプレッドシートに挿入
 * @param {number} taskCount - 生成するタスク数
 * @returns {object}
 */
function generateTestData(taskCount) {
  const count = taskCount || 100;
  const now = new Date().toISOString();

  // テストユーザー作成
  const testUsers = [];
  const departments = ['開発部', '営業部', '管理部', '経理部', '企画部'];
  for (let i = 0; i < 10; i++) {
    testUsers.push({
      userId: UUIDGenerator.generate(),
      email: `testuser${i}@example.com`,
      displayName: `テストユーザー${i}`,
      department: departments[i % departments.length],
      role: i === 0 ? 'admin' : 'user',
      createdAt: now,
      updatedAt: now,
    });
  }

  // テストカテゴリ作成
  const testCategories = [
    { categoryId: UUIDGenerator.generate(), name: '開発', color: '#4285f4', sortOrder: 0, createdAt: now },
    { categoryId: UUIDGenerator.generate(), name: 'デザイン', color: '#ea4335', sortOrder: 1, createdAt: now },
    { categoryId: UUIDGenerator.generate(), name: 'マーケティング', color: '#fbbc05', sortOrder: 2, createdAt: now },
    { categoryId: UUIDGenerator.generate(), name: '運用', color: '#34a853', sortOrder: 3, createdAt: now },
    { categoryId: UUIDGenerator.generate(), name: 'ドキュメント', color: '#a142f4', sortOrder: 4, createdAt: now },
  ];

  // テストタスク作成
  const statuses = ['未着手', '進行中', '完了'];
  const priorities = [1, 2, 3];
  const titles = [
    'API設計レビュー', 'UI改善', 'バグ修正', 'ドキュメント更新', 'テスト作成',
    'パフォーマンス改善', 'セキュリティ監査', 'データ移行', 'インフラ構築', 'ミーティング準備',
    'コードレビュー', 'リリース準備', '仕様書作成', 'クライアント対応', 'DB設計',
    '画面デザイン', 'テスト実行', '環境構築', 'ログ分析', '運用手順書作成',
  ];

  const testTasks = [];
  for (let i = 0; i < count; i++) {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + Math.floor(Math.random() * 60) - 30);
    const dueDateStr = Utilities.formatDate(dueDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    const status = i < count * 0.7 ? statuses[i % 2] : statuses[2]; // 70%未完了, 30%完了

    testTasks.push({
      taskId: UUIDGenerator.generate(),
      title: titles[i % titles.length] + ` #${i + 1}`,
      description: `テストタスクの説明 ${i + 1}。これはテストデータ生成による自動作成されたタスクです。`,
      dueDate: dueDateStr,
      dueTime: `${String(9 + (i % 8)).padStart(2, '0')}:00`,
      priority: priorities[i % 3],
      status: status,
      assigneeId: testUsers[i % testUsers.length].userId,
      categoryId: testCategories[i % testCategories.length].categoryId,
      recurrenceId: '',
      externalUUID: '',
      invoiceNo: '',
      sortOrder: i * 10,
      calendarEventId: '',
      createdAt: now,
      updatedAt: now,
      createdBy: testUsers[0].userId,
      updatedBy: testUsers[0].userId,
    });
  }

  // バルクインサート
  const userRepo = getUserRepository();
  const categoryRepo = getCategoryRepository();
  const taskRepo = getTaskRepository();

  return LockManager.executeWithLock(() => {
    userRepo.createBatch(testUsers);
    categoryRepo.createBatch(testCategories);
    taskRepo.createBatch(testTasks);

    // インデックス再構築
    getIndexRepository().rebuildIndex();

    return {
      users: testUsers.length,
      categories: testCategories.length,
      tasks: testTasks.length,
    };
  });
}

/**
 * テストデータを全削除
 */
function clearTestData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetNames = [
    SHEET_NAMES.TASKS, SHEET_NAMES.USERS, SHEET_NAMES.CATEGORIES,
    SHEET_NAMES.RECURRENCES, SHEET_NAMES.EXTERNAL_LINKS,
    SHEET_NAMES.ATTACHMENTS, SHEET_NAMES.LOGS, SHEET_NAMES.INDEX,
  ];

  sheetNames.forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (sheet && sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
    }
  });

  Logger.log('テストデータを全削除しました');
  return { success: true };
}
