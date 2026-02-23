/**
 * Repositories.js
 * 全リポジトリクラスを1ファイルに統合
 * GASはファイル読み込み順を保証しないため、class継承を1ファイルで完結させる
 */

// ============================================================
// BaseRepository - リポジトリ層の基底クラス
// ============================================================
class BaseRepository {
  constructor(sheetName, primaryKey, columns) {
    this._sheetName = sheetName;
    this._primaryKey = primaryKey;
    this._columns = columns;
    this._adapter = getSpreadsheetAdapter();
  }

  _toRow(entity) {
    return this._columns.map(col => {
      const val = entity[col];
      if (val === undefined || val === null) return '';
      if (Array.isArray(val)) return JSON.stringify(val);
      if (typeof val === 'object' && !(val instanceof Date)) return JSON.stringify(val);
      return val;
    });
  }

  _toEntity(row) {
    const entity = {};
    this._columns.forEach((col, i) => {
      let val = row[i];
      if (typeof val === 'string' && val.startsWith('[')) {
        try { val = JSON.parse(val); } catch (e) { /* パース失敗は文字列のまま */ }
      }
      if (val instanceof Date) {
        val = Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd\'T\'HH:mm:ss');
      }
      entity[col] = val;
    });
    return entity;
  }

  findAll() {
    const { rows } = this._adapter.getAllData(this._sheetName);
    return rows.map(row => this._toEntity(row));
  }

  findById(id) {
    const { headers, rows } = this._adapter.getAllData(this._sheetName);
    const pkIdx = headers.indexOf(this._primaryKey);
    if (pkIdx === -1) return null;
    const row = rows.find(r => r[pkIdx] === id);
    return row ? this._toEntity(row) : null;
  }

  findByColumn(column, value) {
    const { headers, rows } = this._adapter.getAllData(this._sheetName);
    const colIdx = headers.indexOf(column);
    if (colIdx === -1) return [];
    return rows.filter(r => r[colIdx] === value).map(r => this._toEntity(r));
  }

  findByConditions(conditions) {
    const { headers, rows } = this._adapter.getAllData(this._sheetName);
    const colIndices = {};
    Object.keys(conditions).forEach(col => {
      const idx = headers.indexOf(col);
      if (idx !== -1) colIndices[col] = idx;
    });

    return rows
      .filter(row => {
        return Object.keys(colIndices).every(col => {
          const value = row[colIndices[col]];
          const condition = conditions[col];
          if (Array.isArray(condition)) {
            return condition.includes(value);
          }
          return value === condition;
        });
      })
      .map(row => this._toEntity(row));
  }

  create(entity) {
    const row = this._toRow(entity);
    this._adapter.appendRow(this._sheetName, row);
    return entity;
  }

  createBatch(entities) {
    if (!entities || entities.length === 0) return [];
    const rows = entities.map(e => this._toRow(e));
    this._adapter.appendRows(this._sheetName, rows);
    return entities;
  }

  update(id, entity) {
    const result = this._adapter.findByPrimaryKey(this._sheetName, this._primaryKey, id);
    if (!result) return null;
    const row = this._toRow(entity);
    this._adapter.updateRow(this._sheetName, result.rowIndex, row);
    return entity;
  }

  updateBatch(updates) {
    if (!updates || updates.length === 0) return [];
    const { headers, rows } = this._adapter.getAllData(this._sheetName);
    const pkIdx = headers.indexOf(this._primaryKey);

    const idToRowIndex = {};
    rows.forEach((row, i) => {
      idToRowIndex[row[pkIdx]] = i + 2;
    });

    const sheetUpdates = [];
    const results = [];
    updates.forEach(u => {
      const rowIndex = idToRowIndex[u.id];
      if (rowIndex) {
        const row = this._toRow(u.entity);
        sheetUpdates.push({ rowIndex, data: row });
        results.push(u.entity);
      }
    });

    this._adapter.updateRows(this._sheetName, sheetUpdates);
    return results;
  }

  delete(id) {
    const result = this._adapter.findByPrimaryKey(this._sheetName, this._primaryKey, id);
    if (!result) return false;
    this._adapter.deleteRow(this._sheetName, result.rowIndex);
    return true;
  }

  deleteBatch(ids) {
    if (!ids || ids.length === 0) return 0;
    const { headers, rows } = this._adapter.getAllData(this._sheetName);
    const pkIdx = headers.indexOf(this._primaryKey);
    const idsSet = new Set(ids);
    const rowIndicesToDelete = [];

    rows.forEach((row, i) => {
      if (idsSet.has(row[pkIdx])) {
        rowIndicesToDelete.push(i + 2);
      }
    });

    this._adapter.deleteRows(this._sheetName, rowIndicesToDelete);
    return rowIndicesToDelete.length;
  }

  count() {
    return this._adapter.getRowCount(this._sheetName);
  }
}

// ============================================================
// TaskRepository
// ============================================================
class TaskRepository extends BaseRepository {
  constructor() {
    super(SHEET_NAMES.TASKS, 'taskId', COLUMNS.TASKS);
  }

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
      const dateA = a[dueDateIdx] || '9999-99-99';
      const dateB = b[dueDateIdx] || '9999-99-99';
      if (dateA !== dateB) return dateA < dateB ? -1 : 1;
      const prioA = Number(a[priorityIdx]) || 0;
      const prioB = Number(b[priorityIdx]) || 0;
      if (prioA !== prioB) return prioB - prioA;
      const sortA = Number(a[sortOrderIdx]) || 0;
      const sortB = Number(b[sortOrderIdx]) || 0;
      return sortA - sortB;
    });

    return activeRows
      .slice(startOffset, startOffset + maxLimit)
      .map(row => this._toEntity(row));
  }

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
        const filterId = filters.assigneeId;
        completed = completed.filter(row => {
          const val = row[assigneeIdx];
          if (!val) return false;
          if (val === '__ALL__') return true;
          return String(val).split(',').includes(filterId);
        });
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

  findByAssignee(assigneeId) {
    return this.findByColumn('assigneeId', assigneeId);
  }

  findByCategory(categoryId) {
    return this.findByColumn('categoryId', categoryId);
  }

  findByRecurrence(recurrenceId) {
    return this.findByColumn('recurrenceId', recurrenceId);
  }

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

// ============================================================
// UserRepository
// ============================================================
class UserRepository extends BaseRepository {
  constructor() {
    super(SHEET_NAMES.USERS, 'userId', COLUMNS.USERS);
  }

  findByEmail(email) {
    const results = this.findByColumn('email', email);
    return results.length > 0 ? results[0] : null;
  }

  findByRole(role) {
    return this.findByColumn('role', role);
  }

  findByDepartment(department) {
    return this.findByColumn('department', department);
  }
}

// ============================================================
// CategoryRepository
// ============================================================
class CategoryRepository extends BaseRepository {
  constructor() {
    super(SHEET_NAMES.CATEGORIES, 'categoryId', COLUMNS.CATEGORIES);
  }

  findAllSorted() {
    const all = this.findAll();
    return all.sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
  }

  findByName(name) {
    const results = this.findByColumn('name', name);
    return results.length > 0 ? results[0] : null;
  }
}

// ============================================================
// AttachmentRepository
// ============================================================
class AttachmentRepository extends BaseRepository {
  constructor() {
    super(SHEET_NAMES.ATTACHMENTS, 'attachmentId', COLUMNS.ATTACHMENTS);
  }

  findByTaskId(taskId) {
    return this.findByColumn('taskId', taskId);
  }

  getTotalSizeByTask(taskId) {
    const attachments = this.findByTaskId(taskId);
    return attachments.reduce((sum, a) => sum + (Number(a.size) || 0), 0);
  }
}

// ============================================================
// LogRepository
// ============================================================
class LogRepository extends BaseRepository {
  constructor() {
    super(SHEET_NAMES.LOGS, 'logId', COLUMNS.LOGS);
  }

  findByTaskId(taskId) {
    return this.findByColumn('taskId', taskId);
  }

  findByUserId(userId) {
    return this.findByColumn('userId', userId);
  }

  findExpiredLogIds(beforeDate) {
    const { headers, rows } = this._adapter.getAllData(this._sheetName);
    const logIdIdx = headers.indexOf('logId');
    const timestampIdx = headers.indexOf('timestamp');

    return rows
      .filter(row => {
        const ts = row[timestampIdx];
        if (!ts) return false;
        const dateStr = ts instanceof Date
          ? Utilities.formatDate(ts, Session.getScriptTimeZone(), 'yyyy-MM-dd')
          : String(ts).substring(0, 10);
        return dateStr < beforeDate;
      })
      .map(row => row[logIdIdx]);
  }
}

// ============================================================
// RecurrenceRepository
// ============================================================
class RecurrenceRepository extends BaseRepository {
  constructor() {
    super(SHEET_NAMES.RECURRENCES, 'recurrenceId', COLUMNS.RECURRENCES);
  }

  findByType(type) {
    return this.findByColumn('type', type);
  }
}

// ============================================================
// ExternalLinkRepository
// ============================================================
class ExternalLinkRepository extends BaseRepository {
  constructor() {
    super(SHEET_NAMES.EXTERNAL_LINKS, 'linkId', COLUMNS.EXTERNAL_LINKS);
  }

  findByTaskId(taskId) {
    return this.findByColumn('taskId', taskId);
  }

  findByExternalKey(invoiceNo, externalUUID) {
    const { headers, rows } = this._adapter.getAllData(this._sheetName);
    const invoiceIdx = headers.indexOf('invoiceNo');
    const extUuidIdx = headers.indexOf('externalUUID');

    for (let i = 0; i < rows.length; i++) {
      if (rows[i][invoiceIdx] === invoiceNo && rows[i][extUuidIdx] === externalUUID) {
        const entity = {};
        headers.forEach((h, j) => { entity[h] = rows[i][j]; });
        return entity;
      }
    }
    return null;
  }

  findBySourceSheet(sourceSheetId) {
    return this.findByColumn('sourceSheetId', sourceSheetId);
  }
}

// ============================================================
// IndexRepository（BaseRepositoryを継承しない独立クラス）
// ============================================================
class IndexRepository {
  constructor() {
    this._adapter = getSpreadsheetAdapter();
    this._sheetName = SHEET_NAMES.INDEX;
    this._columns = ['sheetName', 'rowId', 'primaryKey', 'status', 'dueDate', 'priority', 'sortOrder', 'updatedAt'];
  }

  rebuildIndex() {
    const adapter = this._adapter;
    const indexSheet = adapter.getSheet(this._sheetName);

    const lastRow = indexSheet.getLastRow();
    if (lastRow > 1) {
      indexSheet.getRange(2, 1, lastRow - 1, this._columns.length).clearContent();
    }

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

  getActiveTaskIds(limit) {
    const maxLimit = limit || APP_CONFIG.MAX_DISPLAY;
    const cache = getCacheManager();
    const cached = cache.get(CACHE_KEYS.INDEX);
    if (cached && cached.activeTaskIds) {
      return cached.activeTaskIds.slice(0, maxLimit);
    }

    const { rows } = this._adapter.getAllData(this._sheetName);
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

// ============================================================
// シングルトンアクセサ（遅延初期化）
// ============================================================
var taskRepository_ = null;
function getTaskRepository() {
  if (!taskRepository_) taskRepository_ = new TaskRepository();
  return taskRepository_;
}

var userRepository_ = null;
function getUserRepository() {
  if (!userRepository_) userRepository_ = new UserRepository();
  return userRepository_;
}

var categoryRepository_ = null;
function getCategoryRepository() {
  if (!categoryRepository_) categoryRepository_ = new CategoryRepository();
  return categoryRepository_;
}

var attachmentRepository_ = null;
function getAttachmentRepository() {
  if (!attachmentRepository_) attachmentRepository_ = new AttachmentRepository();
  return attachmentRepository_;
}

var logRepository_ = null;
function getLogRepository() {
  if (!logRepository_) logRepository_ = new LogRepository();
  return logRepository_;
}

var recurrenceRepository_ = null;
function getRecurrenceRepository() {
  if (!recurrenceRepository_) recurrenceRepository_ = new RecurrenceRepository();
  return recurrenceRepository_;
}

var externalLinkRepository_ = null;
function getExternalLinkRepository() {
  if (!externalLinkRepository_) externalLinkRepository_ = new ExternalLinkRepository();
  return externalLinkRepository_;
}

var indexRepository_ = null;
function getIndexRepository() {
  if (!indexRepository_) indexRepository_ = new IndexRepository();
  return indexRepository_;
}
