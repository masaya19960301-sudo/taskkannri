/**
 * TestRunner.js
 * テスト実行フレームワーク（GAS環境用）
 */

class TestRunner {
  constructor() {
    this._results = [];
    this._passed = 0;
    this._failed = 0;
    this._errors = [];
  }

  /**
   * テストケースを実行
   * @param {string} name
   * @param {Function} fn
   */
  test(name, fn) {
    try {
      fn();
      this._passed++;
      this._results.push({ name, status: 'PASS' });
    } catch (e) {
      this._failed++;
      this._results.push({ name, status: 'FAIL', error: e.message });
      this._errors.push({ name, error: e.message });
    }
  }

  /**
   * アサーション
   */
  assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(`${message || 'アサーション失敗'}: 期待値=${expected}, 実際=${actual}`);
    }
  }

  assertNotNull(value, message) {
    if (value === null || value === undefined) {
      throw new Error(`${message || 'NULL検出'}: 値がnullです`);
    }
  }

  assertTrue(condition, message) {
    if (!condition) {
      throw new Error(`${message || 'TRUE検証失敗'}: falseが返されました`);
    }
  }

  assertFalse(condition, message) {
    if (condition) {
      throw new Error(`${message || 'FALSE検証失敗'}: trueが返されました`);
    }
  }

  assertThrows(fn, message) {
    let threw = false;
    try {
      fn();
    } catch (e) {
      threw = true;
    }
    if (!threw) {
      throw new Error(`${message || '例外検証失敗'}: 例外がスローされませんでした`);
    }
  }

  assertArrayLength(arr, expected, message) {
    if (!Array.isArray(arr) || arr.length !== expected) {
      throw new Error(`${message || '配列長検証失敗'}: 期待=${expected}, 実際=${arr ? arr.length : 'not array'}`);
    }
  }

  /**
   * テスト結果を取得
   */
  getResults() {
    return {
      total: this._passed + this._failed,
      passed: this._passed,
      failed: this._failed,
      results: this._results,
      errors: this._errors,
    };
  }

  /**
   * テスト結果をログ出力
   */
  report() {
    const results = this.getResults();
    Logger.log('========================================');
    Logger.log(`テスト結果: ${results.passed}/${results.total} 通過 (${results.failed} 失敗)`);
    Logger.log('========================================');
    results.results.forEach(r => {
      const icon = r.status === 'PASS' ? '[OK]' : '[NG]';
      Logger.log(`${icon} ${r.name}${r.error ? ' - ' + r.error : ''}`);
    });
    if (results.errors.length > 0) {
      Logger.log('--- エラー詳細 ---');
      results.errors.forEach(e => {
        Logger.log(`  ${e.name}: ${e.error}`);
      });
    }
    return results;
  }
}
