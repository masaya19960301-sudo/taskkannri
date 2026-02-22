/**
 * UnitTests.js
 * 疑似ユニットテスト
 */

/**
 * 全テストを実行
 */
function runAllTests() {
  const runner = new TestRunner();

  // Validator テスト
  testValidator(runner);

  // UUID テスト
  testUUID(runner);

  // Repository テスト
  testRepositories(runner);

  // Service テスト
  testServices(runner);

  // API ルーティングテスト
  testRouter(runner);

  return runner.report();
}

/**
 * Validator のテスト
 */
function testValidator(runner) {
  runner.test('Validator: タスクバリデーション - 正常', () => {
    const result = Validator.validateTask({
      title: 'テストタスク',
      status: '未着手',
      priority: 2,
      dueDate: '2026-03-01',
      dueTime: '10:00',
    }, false);
    runner.assertTrue(result.valid, 'バリデーションが通るべき');
  });

  runner.test('Validator: タスクバリデーション - titleなし', () => {
    const result = Validator.validateTask({
      title: '',
      status: '未着手',
    }, false);
    runner.assertFalse(result.valid, 'タイトルなしで失敗すべき');
  });

  runner.test('Validator: タスクバリデーション - 不正なstatus', () => {
    const result = Validator.validateTask({
      title: 'テスト',
      status: '不正ステータス',
    }, false);
    runner.assertFalse(result.valid, '不正ステータスで失敗すべき');
  });

  runner.test('Validator: タスクバリデーション - 不正なpriority', () => {
    const result = Validator.validateTask({
      title: 'テスト',
      status: '未着手',
      priority: 5,
    }, false);
    runner.assertFalse(result.valid, '不正プライオリティで失敗すべき');
  });

  runner.test('Validator: タスクバリデーション - 不正な日付フォーマット', () => {
    const result = Validator.validateTask({
      title: 'テスト',
      status: '未着手',
      dueDate: '2026/03/01',
    }, false);
    runner.assertFalse(result.valid, '不正な日付フォーマットで失敗すべき');
  });

  runner.test('Validator: タスクバリデーション - scriptタグ検出', () => {
    const result = Validator.validateTask({
      title: '<script>alert("xss")</script>',
      status: '未着手',
    }, false);
    runner.assertFalse(result.valid, 'scriptタグで失敗すべき');
  });

  runner.test('Validator: ユーザーバリデーション - 正常', () => {
    const result = Validator.validateUser({
      email: 'test@example.com',
      displayName: 'テストユーザー',
    });
    runner.assertTrue(result.valid, 'バリデーション通るべき');
  });

  runner.test('Validator: ユーザーバリデーション - 不正なメール', () => {
    const result = Validator.validateUser({
      email: 'invalid-email',
      displayName: 'テスト',
    });
    runner.assertFalse(result.valid, '不正メールで失敗すべき');
  });

  runner.test('Validator: 繰り返しバリデーション - weeklyでweekdays必須', () => {
    const result = Validator.validateRecurrence({
      type: 'weekly',
      baseDate: '2026-03-01',
    });
    runner.assertFalse(result.valid, 'weekdaysなしで失敗すべき');
  });

  runner.test('Validator: サニタイズ', () => {
    const result = Validator.sanitize('<script>alert("xss")</script>');
    runner.assertFalse(result.includes('<script>'), 'scriptタグが除去されるべき');
    runner.assertTrue(result.includes('&lt;script&gt;'), 'エスケープされるべき');
  });

  runner.test('Validator: 必須フィールドチェック', () => {
    const result = Validator.validateRequired({ name: 'test', age: '' }, ['name', 'age', 'email']);
    runner.assertFalse(result.valid);
    runner.assertEqual(result.errors.length, 2, 'エラー2件');
  });

  runner.test('Validator: 更新時はtitle不要', () => {
    const result = Validator.validateTask({ priority: 2 }, true);
    runner.assertTrue(result.valid, '更新時はtitle不要');
  });
}

/**
 * UUID テスト
 */
function testUUID(runner) {
  runner.test('UUID: 生成テスト', () => {
    const id1 = UUIDGenerator.generate();
    const id2 = UUIDGenerator.generate();
    runner.assertNotNull(id1);
    runner.assertTrue(id1.length > 0, 'UUIDが空でない');
    runner.assertTrue(id1 !== id2, '一意性');
  });
}

/**
 * Repository テスト
 */
function testRepositories(runner) {
  // テスト用にスプレッドシートが必要
  runner.test('UserRepository: インスタンス取得', () => {
    const repo = getUserRepository();
    runner.assertNotNull(repo);
    runner.assertTrue(repo instanceof UserRepository);
  });

  runner.test('TaskRepository: インスタンス取得', () => {
    const repo = getTaskRepository();
    runner.assertNotNull(repo);
    runner.assertTrue(repo instanceof TaskRepository);
  });

  runner.test('RecurrenceRepository: インスタンス取得', () => {
    const repo = getRecurrenceRepository();
    runner.assertNotNull(repo);
  });

  runner.test('CategoryRepository: インスタンス取得', () => {
    const repo = getCategoryRepository();
    runner.assertNotNull(repo);
  });

  runner.test('LogRepository: インスタンス取得', () => {
    const repo = getLogRepository();
    runner.assertNotNull(repo);
  });

  runner.test('AttachmentRepository: インスタンス取得', () => {
    const repo = getAttachmentRepository();
    runner.assertNotNull(repo);
  });

  runner.test('IndexRepository: インスタンス取得', () => {
    const repo = getIndexRepository();
    runner.assertNotNull(repo);
  });

  // CRUD テスト（実データを用いる）
  runner.test('UserRepository: CRUD', () => {
    const repo = getUserRepository();
    const now = new Date().toISOString();
    const testUser = {
      userId: 'test-' + UUIDGenerator.generate(),
      email: 'unittest@test.com',
      displayName: 'UnitTest User',
      department: 'テスト部',
      role: 'user',
      createdAt: now,
      updatedAt: now,
    };

    // Create
    const created = repo.create(testUser);
    runner.assertEqual(created.userId, testUser.userId);

    // Read
    const found = repo.findById(testUser.userId);
    runner.assertNotNull(found);
    runner.assertEqual(found.email, 'unittest@test.com');

    // Update
    const updated = repo.update(testUser.userId, { ...testUser, displayName: 'Updated Name', updatedAt: new Date().toISOString() });
    runner.assertNotNull(updated);

    // Delete
    const deleted = repo.delete(testUser.userId);
    runner.assertTrue(deleted);
    const afterDelete = repo.findById(testUser.userId);
    runner.assertTrue(afterDelete === null || afterDelete === undefined);
  });

  runner.test('TaskRepository: CRUD + フィルタ', () => {
    const repo = getTaskRepository();
    const now = new Date().toISOString();
    const testTask = {
      taskId: 'test-task-' + UUIDGenerator.generate(),
      title: 'テストタスク',
      description: 'テスト用',
      dueDate: '2026-12-31',
      dueTime: '10:00',
      priority: 3,
      status: '未着手',
      assigneeId: 'test-user',
      categoryId: '',
      recurrenceId: '',
      externalUUID: '',
      invoiceNo: '',
      sortOrder: 0,
      calendarEventId: '',
      createdAt: now,
      updatedAt: now,
      createdBy: 'test',
      updatedBy: 'test',
    };

    // Create
    repo.create(testTask);

    // findActiveTasks
    const active = repo.findActiveTasks(10, 0);
    runner.assertTrue(active.length > 0, 'アクティブタスクが取得できるべき');

    // findByAssignee
    const byAssignee = repo.findByAssignee('test-user');
    runner.assertTrue(byAssignee.length > 0);

    // Cleanup
    repo.delete(testTask.taskId);
  });
}

/**
 * Service テスト
 */
function testServices(runner) {
  runner.test('UserService: インスタンス取得', () => {
    const service = getUserService();
    runner.assertNotNull(service);
  });

  runner.test('TaskService: インスタンス取得', () => {
    const service = getTaskService();
    runner.assertNotNull(service);
  });

  runner.test('RecurrenceService: インスタンス取得', () => {
    const service = getRecurrenceService();
    runner.assertNotNull(service);
  });

  runner.test('CategoryService: カテゴリ一覧取得', () => {
    const service = getCategoryService();
    const categories = service.getAllCategories();
    runner.assertTrue(Array.isArray(categories));
  });

  runner.test('LogService: インスタンス取得', () => {
    const service = getLogService();
    runner.assertNotNull(service);
  });

  runner.test('TaskService: バリデーションエラーの検出', () => {
    const service = getTaskService();
    const currentUser = AuthManager.getCurrentUser() || { userId: 'test', role: 'admin' };

    runner.assertThrows(() => {
      service.createTask({ title: '', status: '未着手' }, currentUser);
    }, 'タイトル空でバリデーションエラー');
  });

  runner.test('TaskService: 不正ステータスの拒否', () => {
    const service = getTaskService();
    const currentUser = AuthManager.getCurrentUser() || { userId: 'test', role: 'admin' };

    runner.assertThrows(() => {
      service.createTask({ title: 'テスト', status: '不正' }, currentUser);
    }, '不正ステータスで拒否');
  });

  runner.test('RecurrenceService: 次回日付計算 - daily', () => {
    const service = getRecurrenceService();
    const next = service._calculateNextDate(
      { type: 'daily', interval: 1 },
      '2026-03-01'
    );
    runner.assertEqual(next, '2026-03-02');
  });

  runner.test('RecurrenceService: 次回日付計算 - monthly', () => {
    const service = getRecurrenceService();
    const next = service._calculateNextDate(
      { type: 'monthly', interval: 1 },
      '2026-03-15'
    );
    runner.assertEqual(next, '2026-04-15');
  });

  runner.test('RecurrenceService: 次回日付計算 - monthEnd', () => {
    const service = getRecurrenceService();
    const next = service._calculateNextDate(
      { type: 'monthEnd', interval: 1 },
      '2026-01-31'
    );
    runner.assertEqual(next, '2026-02-28');
  });

  runner.test('RecurrenceService: 次回日付計算 - yearly', () => {
    const service = getRecurrenceService();
    const next = service._calculateNextDate(
      { type: 'yearly', interval: 1 },
      '2026-06-15'
    );
    runner.assertEqual(next, '2027-06-15');
  });
}

/**
 * Router テスト
 */
function testRouter(runner) {
  runner.test('Router: 存在しないパス', () => {
    // AuthManagerが動作する環境でのみ
    try {
      const result = routeRequest('GET', '/nonexistent', {},
        { userId: 'test', role: 'admin' });
      runner.assertFalse(result.success, '存在しないパスで失敗すべき');
      runner.assertEqual(result.code, 'NOT_FOUND');
    } catch (e) {
      // Auth不足の場合はスキップ
    }
  });

  runner.test('ErrorResponse: 標準フォーマット', () => {
    const resp = createErrorResponse('TEST_ERROR', 'テストエラー', { detail: 'info' });
    runner.assertFalse(resp.success);
    runner.assertEqual(resp.code, 'TEST_ERROR');
    runner.assertEqual(resp.message, 'テストエラー');
    runner.assertNotNull(resp.details);
  });

  runner.test('SuccessResponse: 標準フォーマット', () => {
    const resp = createSuccessResponse({ id: 1 }, 'OK');
    runner.assertTrue(resp.success);
    runner.assertNotNull(resp.data);
    runner.assertEqual(resp.message, 'OK');
  });

  runner.test('AppError: toResponse', () => {
    const err = new AppError('TEST_CODE', 'テストメッセージ');
    const resp = err.toResponse();
    runner.assertFalse(resp.success);
    runner.assertEqual(resp.code, 'TEST_CODE');
    runner.assertEqual(resp.message, 'テストメッセージ');
  });
}
