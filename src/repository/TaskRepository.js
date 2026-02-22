/**
 * TaskRepository.js
 * タスクデータのリポジトリ
 */

class TaskRepository extends BaseRepository {
  constructor() {
    super(SHEET_NAMES.TASKS, 'taskId', COLUMNS.TASKS);
  }

  /**
   * 未完了タスクを取得（ソート済み、最大件数制限付き）
   * dueDate昇順 → priority降順 → sortOrder昇順
   * @param {number} limit
   * @param {number} offset
   * @returns {object[]}
   */
  findActiveTasks(limit, offset) {
    const maxLimit = limit || APP_CONFIG.MAX_DISPLAY;
    const startOffset = offset || 0;
    const { headers, rows } = this._adapter.getAllData(this._sheetName);

    const statusIdx = headers.indexOf('status');
    const dueDateIdx = headers.indexOf('dueDate');
    const priorityIdx = headers.indexOf('priority');
    const sortOrderIdx = headers.indexOf('sortOrder');

    const activeRows = rows.filter(row => row[statusIdx] !== TASK_STATUS.COMPLETED);

    activeRows.sort((a, b) => {
      // dueDate昇順（空は最後）
      const dateA = a[dueDateIdx] || '9999-99-99';
      const dateB = b[dueDateIdx] || '9999-99-99';
      if (dateA !== dateB) return dateA < dateB ? -1 : 1;

      // priority降順
      const prioA = Number(a[priorityIdx]) || 0;
      const prioB = Number(b[priorityIdx]) || 0;
      if (prioA !== prioB) return prioB - prioA;

      // sortOrder昇順
      const sortA = Number(a[sortOrderIdx]) || 0;
      const sortB = Number(b[sortOrderIdx]) || 0;
      return sortA - sortB;
    });

    return activeRows
      .slice(startOffset, startOffset + maxLimit)
      .map(row => this._toEntity(row));
  }

  /**
   * 完了済みタスクを検索条件付きで取得
   * @param {object} filters - { keyword, assigneeId, categoryId, dateFrom, dateTo }
   * @param {number} limit
   * @returns {object[]}
   */
  findCompletedTasks(filters, limit) {
    const maxLimit = limit || APP_CONFIG.MAX_DISPLAY;
    const { headers, rows } = this._adapter.getAllData(this._sheetName);
    const statusIdx = headers.indexOf('status');
    const titleIdx = headers.indexOf('title');
    const descIdx = headers.indexOf('description');
    const assigneeIdx = headers.indexOf('assigneeId');
    const categoryIdx = headers.indexOf('categoryId');
    const dueDateIdx = headers.indexOf('dueDate');

    let completed = rows.filter(row => row[statusIdx] === TASK_STATUS.COMPLETED);

    if (filters) {
      if (filters.keyword) {
        const kw = filters.keyword.toLowerCase();
        completed = completed.filter(row =>
          (row[titleIdx] && String(row[titleIdx]).toLowerCase().includes(kw)) ||
          (row[descIdx] && String(row[descIdx]).toLowerCase().includes(kw))
        );
      }
      if (filters.assigneeId) {
        completed = completed.filter(row => row[assigneeIdx] === filters.assigneeId);
      }
      if (filters.categoryId) {
        completed = completed.filter(row => row[categoryIdx] === filters.categoryId);
      }
      if (filters.dateFrom) {
        completed = completed.filter(row => row[dueDateIdx] >= filters.dateFrom);
      }
      if (filters.dateTo) {
        completed = completed.filter(row => row[dueDateIdx] <= filters.dateTo);
      }
    }

    return completed.slice(0, maxLimit).map(row => this._toEntity(row));
  }

  /**
   * 担当者IDでタスクを検索
   * @param {string} assigneeId
   * @returns {object[]}
   */
  findByAssignee(assigneeId) {
    return this.findByColumn('assigneeId', assigneeId);
  }

  /**
   * カテゴリIDでタスクを検索
   * @param {string} categoryId
   * @returns {object[]}
   */
  findByCategory(categoryId) {
    return this.findByColumn('categoryId', categoryId);
  }

  /**
   * 繰り返しIDでタスクを検索
   * @param {string} recurrenceId
   * @returns {object[]}
   */
  findByRecurrence(recurrenceId) {
    return this.findByColumn('recurrenceId', recurrenceId);
  }

  /**
   * 外部キーで検索
   * @param {string} invoiceNo
   * @param {string} externalUUID
   * @returns {object|null}
   */
  findByExternalKey(invoiceNo, externalUUID) {
    const { headers, rows } = this._adapter.getAllData(this._sheetName);
    const invoiceIdx = headers.indexOf('invoiceNo');
    const extUuidIdx = headers.indexOf('externalUUID');

    for (let i = 0; i < rows.length; i++) {
      if (rows[i][invoiceIdx] === invoiceNo && rows[i][extUuidIdx] === externalUUID) {
        return this._toEntity(rows[i]);
      }
    }
    return null;
  }

  /**
   * 期限切れの完了タスクを取得（1年以上前に完了）
   * @returns {string[]} 削除対象のtaskId配列
   */
  findExpiredTaskIds() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - APP_CONFIG.TASK_RETENTION_DAYS);
    const cutoffStr = Utilities.formatDate(cutoff, Session.getScriptTimeZone(), 'yyyy-MM-dd');

    const { headers, rows } = this._adapter.getAllData(this._sheetName);
    const statusIdx = headers.indexOf('status');
    const updatedAtIdx = headers.indexOf('updatedAt');
    const taskIdIdx = headers.indexOf('taskId');

    return rows
      .filter(row => {
        if (row[statusIdx] !== TASK_STATUS.COMPLETED) return false;
        const updatedAt = row[updatedAtIdx];
        if (!updatedAt) return false;
        const dateStr = updatedAt instanceof Date
          ? Utilities.formatDate(updatedAt, Session.getScriptTimeZone(), 'yyyy-MM-dd')
          : String(updatedAt).substring(0, 10);
        return dateStr < cutoffStr;
      })
      .map(row => row[taskIdIdx]);
  }

  /**
   * sortOrderを一括更新
   * @param {{ taskId: string, sortOrder: number }[]} orders
   */
  updateSortOrders(orders) {
    const { headers, rows } = this._adapter.getAllData(this._sheetName);
    const taskIdIdx = headers.indexOf('taskId');
    const sortOrderIdx = headers.indexOf('sortOrder');

    const orderMap = {};
    orders.forEach(o => { orderMap[o.taskId] = o.sortOrder; });

    const updates = [];
    rows.forEach((row, i) => {
      const id = row[taskIdIdx];
      if (orderMap[id] !== undefined) {
        row[sortOrderIdx] = orderMap[id];
        updates.push({ rowIndex: i + 2, data: row });
      }
    });

    this._adapter.updateRows(this._sheetName, updates);
  }
}

const taskRepository_ = new TaskRepository();

function getTaskRepository() {
  return taskRepository_;
}
