/**
 * SpreadsheetAdapter.js
 * スプレッドシートへの低レベルアクセスを抽象化するアダプター
 * Repository層はこのアダプターを通じてのみデータストアにアクセスする
 */

class SpreadsheetAdapter {
  constructor() {
    this._ss = null;
    this._sheetCache = {};
  }

  /**
   * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet}
   */
  getSpreadsheet() {
    if (!this._ss) {
      this._ss = SpreadsheetApp.getActiveSpreadsheet();
    }
    return this._ss;
  }

  /**
   * @param {string} sheetName
   * @returns {GoogleAppsScript.Spreadsheet.Sheet}
   */
  getSheet(sheetName) {
    if (!this._sheetCache[sheetName]) {
      const sheet = this.getSpreadsheet().getSheetByName(sheetName);
      if (!sheet) {
        throw new AppError(ERROR_CODES.INTERNAL_ERROR, `シート「${sheetName}」が見つかりません`);
      }
      this._sheetCache[sheetName] = sheet;
    }
    return this._sheetCache[sheetName];
  }

  /**
   * ヘッダー行を取得
   * @param {string} sheetName
   * @returns {string[]}
   */
  getHeaders(sheetName) {
    const sheet = this.getSheet(sheetName);
    const lastCol = sheet.getLastColumn();
    if (lastCol === 0) return [];
    return sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  }

  /**
   * 全データを取得（ヘッダー除く）
   * @param {string} sheetName
   * @returns {{ headers: string[], rows: any[][] }}
   */
  getAllData(sheetName) {
    const sheet = this.getSheet(sheetName);
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow <= 1 || lastCol === 0) {
      return { headers: this.getHeaders(sheetName), rows: [] };
    }
    const data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    const headers = data[0];
    const rows = data.slice(1);
    return { headers, rows };
  }

  /**
   * 特定行を取得（1-based rowIndex, ヘッダー行は1）
   * @param {string} sheetName
   * @param {number} rowIndex - 1-based（データ行は2から）
   * @returns {any[]}
   */
  getRow(sheetName, rowIndex) {
    const sheet = this.getSheet(sheetName);
    const lastCol = sheet.getLastColumn();
    return sheet.getRange(rowIndex, 1, 1, lastCol).getValues()[0];
  }

  /**
   * 行を追加
   * @param {string} sheetName
   * @param {any[]} rowData
   * @returns {number} 追加された行番号
   */
  appendRow(sheetName, rowData) {
    const sheet = this.getSheet(sheetName);
    sheet.appendRow(rowData);
    return sheet.getLastRow();
  }

  /**
   * 複数行を一括追加
   * @param {string} sheetName
   * @param {any[][]} rowsData
   * @returns {number} 追加後の最終行番号
   */
  appendRows(sheetName, rowsData) {
    if (!rowsData || rowsData.length === 0) return;
    const sheet = this.getSheet(sheetName);
    const startRow = sheet.getLastRow() + 1;
    const numCols = rowsData[0].length;
    sheet.getRange(startRow, 1, rowsData.length, numCols).setValues(rowsData);
    return sheet.getLastRow();
  }

  /**
   * 特定行を更新
   * @param {string} sheetName
   * @param {number} rowIndex - 1-based
   * @param {any[]} rowData
   */
  updateRow(sheetName, rowIndex, rowData) {
    const sheet = this.getSheet(sheetName);
    sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
  }

  /**
   * 複数行を一括更新
   * @param {string} sheetName
   * @param {{ rowIndex: number, data: any[] }[]} updates
   */
  updateRows(sheetName, updates) {
    if (!updates || updates.length === 0) return;
    const sheet = this.getSheet(sheetName);
    updates.forEach(update => {
      sheet.getRange(update.rowIndex, 1, 1, update.data.length).setValues([update.data]);
    });
    SpreadsheetApp.flush();
  }

  /**
   * 特定行を削除
   * @param {string} sheetName
   * @param {number} rowIndex - 1-based
   */
  deleteRow(sheetName, rowIndex) {
    const sheet = this.getSheet(sheetName);
    sheet.deleteRow(rowIndex);
  }

  /**
   * 複数行を削除（降順で削除してインデックスずれを回避）
   * @param {string} sheetName
   * @param {number[]} rowIndices - 1-based
   */
  deleteRows(sheetName, rowIndices) {
    if (!rowIndices || rowIndices.length === 0) return;
    const sorted = [...rowIndices].sort((a, b) => b - a);
    const sheet = this.getSheet(sheetName);
    sorted.forEach(idx => sheet.deleteRow(idx));
  }

  /**
   * 条件に合致する行を検索
   * @param {string} sheetName
   * @param {string} columnName
   * @param {*} value
   * @returns {{ rowIndex: number, data: object }[]}
   */
  findByColumn(sheetName, columnName, value) {
    const { headers, rows } = this.getAllData(sheetName);
    const colIdx = headers.indexOf(columnName);
    if (colIdx === -1) return [];

    const results = [];
    rows.forEach((row, i) => {
      if (row[colIdx] === value) {
        const obj = {};
        headers.forEach((h, j) => { obj[h] = row[j]; });
        results.push({ rowIndex: i + 2, data: obj });
      }
    });
    return results;
  }

  /**
   * 主キーで1件検索
   * @param {string} sheetName
   * @param {string} primaryKeyColumn
   * @param {string} primaryKeyValue
   * @returns {{ rowIndex: number, data: object } | null}
   */
  findByPrimaryKey(sheetName, primaryKeyColumn, primaryKeyValue) {
    const results = this.findByColumn(sheetName, primaryKeyColumn, primaryKeyValue);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * シートの行数を取得（ヘッダー除く）
   * @param {string} sheetName
   * @returns {number}
   */
  getRowCount(sheetName) {
    const sheet = this.getSheet(sheetName);
    return Math.max(0, sheet.getLastRow() - 1);
  }

  /**
   * シートキャッシュをクリア
   */
  clearCache() {
    this._sheetCache = {};
    this._ss = null;
  }
}

// シングルトンインスタンス（遅延初期化）
var spreadsheetAdapter_ = null;

function getSpreadsheetAdapter() {
  if (!spreadsheetAdapter_) spreadsheetAdapter_ = new SpreadsheetAdapter();
  return spreadsheetAdapter_;
}
