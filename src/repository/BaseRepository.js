/**
 * BaseRepository.js
 * リポジトリ層の基底クラス
 * 将来 Firestore へ置換する際はこの基底クラスのみ差し替える
 */

class BaseRepository {
  /**
   * @param {string} sheetName - シート名
   * @param {string} primaryKey - 主キーカラム名
   * @param {string[]} columns - カラム定義
   */
  constructor(sheetName, primaryKey, columns) {
    this._sheetName = sheetName;
    this._primaryKey = primaryKey;
    this._columns = columns;
    this._adapter = getSpreadsheetAdapter();
  }

  /**
   * オブジェクトを行配列に変換
   * @param {object} entity
   * @returns {any[]}
   */
  _toRow(entity) {
    return this._columns.map(col => {
      const val = entity[col];
      if (val === undefined || val === null) return '';
      if (Array.isArray(val)) return JSON.stringify(val);
      if (typeof val === 'object' && !(val instanceof Date)) return JSON.stringify(val);
      return val;
    });
  }

  /**
   * 行配列をオブジェクトに変換
   * @param {any[]} row
   * @returns {object}
   */
  _toEntity(row) {
    const entity = {};
    this._columns.forEach((col, i) => {
      let val = row[i];
      // JSON配列フィールドのパース
      if (typeof val === 'string' && val.startsWith('[')) {
        try { val = JSON.parse(val); } catch (e) { /* パース失敗は文字列のまま */ }
      }
      // Date型の正規化
      if (val instanceof Date) {
        val = Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd\'T\'HH:mm:ss');
      }
      entity[col] = val;
    });
    return entity;
  }

  /**
   * 全件取得
   * @returns {object[]}
   */
  findAll() {
    const { rows } = this._adapter.getAllData(this._sheetName);
    return rows.map(row => this._toEntity(row));
  }

  /**
   * 主キーで1件取得
   * @param {string} id
   * @returns {object|null}
   */
  findById(id) {
    const result = this._adapter.findByPrimaryKey(this._sheetName, this._primaryKey, id);
    return result ? result.data : null;
  }

  /**
   * 条件で検索
   * @param {string} column
   * @param {*} value
   * @returns {object[]}
   */
  findByColumn(column, value) {
    const results = this._adapter.findByColumn(this._sheetName, column, value);
    return results.map(r => r.data);
  }

  /**
   * 複数条件でフィルタ
   * @param {object} conditions - { column: value }
   * @returns {object[]}
   */
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

  /**
   * 1件追加
   * @param {object} entity
   * @returns {object}
   */
  create(entity) {
    const row = this._toRow(entity);
    this._adapter.appendRow(this._sheetName, row);
    return entity;
  }

  /**
   * 複数件一括追加
   * @param {object[]} entities
   * @returns {object[]}
   */
  createBatch(entities) {
    if (!entities || entities.length === 0) return [];
    const rows = entities.map(e => this._toRow(e));
    this._adapter.appendRows(this._sheetName, rows);
    return entities;
  }

  /**
   * 1件更新
   * @param {string} id - 主キー値
   * @param {object} entity
   * @returns {object|null}
   */
  update(id, entity) {
    const result = this._adapter.findByPrimaryKey(this._sheetName, this._primaryKey, id);
    if (!result) return null;
    const row = this._toRow(entity);
    this._adapter.updateRow(this._sheetName, result.rowIndex, row);
    return entity;
  }

  /**
   * 複数件一括更新
   * @param {{ id: string, entity: object }[]} updates
   * @returns {object[]}
   */
  updateBatch(updates) {
    if (!updates || updates.length === 0) return [];
    const { headers, rows } = this._adapter.getAllData(this._sheetName);
    const pkIdx = headers.indexOf(this._primaryKey);

    const idToRowIndex = {};
    rows.forEach((row, i) => {
      idToRowIndex[row[pkIdx]] = i + 2; // 1-basedでヘッダー分+1
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

  /**
   * 1件削除
   * @param {string} id
   * @returns {boolean}
   */
  delete(id) {
    const result = this._adapter.findByPrimaryKey(this._sheetName, this._primaryKey, id);
    if (!result) return false;
    this._adapter.deleteRow(this._sheetName, result.rowIndex);
    return true;
  }

  /**
   * 複数件一括削除
   * @param {string[]} ids
   * @returns {number} 削除件数
   */
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

  /**
   * レコード数を取得
   * @returns {number}
   */
  count() {
    return this._adapter.getRowCount(this._sheetName);
  }
}
