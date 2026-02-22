/**
 * IndexRepository.js
 * インデックスシートのリポジトリ
 * パフォーマンス最適化のためのインデックスデータ管理
 */

class IndexRepository {
  constructor() {
    this._adapter = getSpreadsheetAdapter();
    this._sheetName = SHEET_NAMES.INDEX;
    this._columns = ['sheetName', 'rowId', 'primaryKey', 'status', 'dueDate', 'priority', 'sortOrder', 'updatedAt'];
  }

  /**
   * インデックスを全件再構築
   */
  rebuildIndex() {
    const adapter = this._adapter;
    const indexSheet = adapter.getSheet(this._sheetName);

    // インデックスシートのデータ部分をクリア
    const lastRow = indexSheet.getLastRow();
    if (lastRow > 1) {
      indexSheet.getRange(2, 1, lastRow - 1, this._columns.length).clearContent();
    }

    // タスクデータからインデックスを再構築
    const { headers, rows } = adapter.getAllData(SHEET_NAMES.TASKS);
    const taskIdIdx = headers.indexOf('taskId');
    const statusIdx = headers.indexOf('status');
    const dueDateIdx = headers.indexOf('dueDate');
    const priorityIdx = headers.indexOf('priority');
    const sortOrderIdx = headers.indexOf('sortOrder');
    const updatedAtIdx = headers.indexOf('updatedAt');

    const indexRows = rows.map((row, i) => [
      SHEET_NAMES.TASKS,
      i + 2,
      row[taskIdIdx],
      row[statusIdx],
      row[dueDateIdx],
      row[priorityIdx],
      row[sortOrderIdx],
      row[updatedAtIdx],
    ]);

    if (indexRows.length > 0) {
      indexSheet.getRange(2, 1, indexRows.length, this._columns.length).setValues(indexRows);
    }
  }

  /**
   * インデックスからアクティブタスクのIDリストを取得（ソート済み）
   * @param {number} limit
   * @returns {string[]}
   */
  getActiveTaskIds(limit) {
    const maxLimit = limit || APP_CONFIG.MAX_DISPLAY;
    const cache = getCacheManager();
    const cached = cache.get(CACHE_KEYS.INDEX);
    if (cached && cached.activeTaskIds) {
      return cached.activeTaskIds.slice(0, maxLimit);
    }

    const { rows } = this._adapter.getAllData(this._sheetName);
    // columns: sheetName(0), rowId(1), primaryKey(2), status(3), dueDate(4), priority(5), sortOrder(6), updatedAt(7)
    const activeRows = rows.filter(r => r[0] === SHEET_NAMES.TASKS && r[3] !== TASK_STATUS.COMPLETED);

    activeRows.sort((a, b) => {
      const dateA = a[4] || '9999-99-99';
      const dateB = b[4] || '9999-99-99';
      if (dateA !== dateB) return dateA < dateB ? -1 : 1;
      const prioA = Number(a[5]) || 0;
      const prioB = Number(b[5]) || 0;
      if (prioA !== prioB) return prioB - prioA;
      const sortA = Number(a[6]) || 0;
      const sortB = Number(b[6]) || 0;
      return sortA - sortB;
    });

    const taskIds = activeRows.map(r => r[2]).slice(0, maxLimit);
    cache.put(CACHE_KEYS.INDEX, { activeTaskIds: taskIds }, APP_CONFIG.CACHE_TTL);
    return taskIds;
  }

  /**
   * タスクのインデックスを追加・更新
   * @param {object} task
   */
  upsertTaskIndex(task) {
    const { rows } = this._adapter.getAllData(this._sheetName);
    let found = false;
    rows.forEach((row, i) => {
      if (row[2] === task.taskId) {
        const updatedRow = [
          SHEET_NAMES.TASKS, i + 2, task.taskId, task.status,
          task.dueDate, task.priority, task.sortOrder, task.updatedAt,
        ];
        this._adapter.updateRow(this._sheetName, i + 2, updatedRow);
        found = true;
      }
    });

    if (!found) {
      const newRow = [
        SHEET_NAMES.TASKS, '', task.taskId, task.status,
        task.dueDate, task.priority, task.sortOrder, task.updatedAt,
      ];
      this._adapter.appendRow(this._sheetName, newRow);
    }

    getCacheManager().remove(CACHE_KEYS.INDEX);
  }

  /**
   * タスクのインデックスを削除
   * @param {string} taskId
   */
  removeTaskIndex(taskId) {
    const { rows } = this._adapter.getAllData(this._sheetName);
    const rowIndicesToDelete = [];
    rows.forEach((row, i) => {
      if (row[2] === taskId) {
        rowIndicesToDelete.push(i + 2);
      }
    });
    this._adapter.deleteRows(this._sheetName, rowIndicesToDelete);
    getCacheManager().remove(CACHE_KEYS.INDEX);
  }
}

const indexRepository_ = new IndexRepository();

function getIndexRepository() {
  return indexRepository_;
}
