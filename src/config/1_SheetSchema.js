/**
 * SheetSchema.js
 * スプレッドシート構造の定義・初期化
 */

/**
 * スプレッドシートの初期セットアップを実行
 * @param {string} spreadsheetId - 対象スプレッドシートのID（省略時はバインドされたもの）
 */
function initializeSpreadsheet(spreadsheetId) {
  const ss = spreadsheetId
    ? SpreadsheetApp.openById(spreadsheetId)
    : SpreadsheetApp.getActiveSpreadsheet();

  const schemas = [
    { name: SHEET_NAMES.USERS, columns: COLUMNS.USERS },
    { name: SHEET_NAMES.TASKS, columns: COLUMNS.TASKS },
    { name: SHEET_NAMES.RECURRENCES, columns: COLUMNS.RECURRENCES },
    { name: SHEET_NAMES.EXTERNAL_LINKS, columns: COLUMNS.EXTERNAL_LINKS },
    { name: SHEET_NAMES.ATTACHMENTS, columns: COLUMNS.ATTACHMENTS },
    { name: SHEET_NAMES.LOGS, columns: COLUMNS.LOGS },
    { name: SHEET_NAMES.CATEGORIES, columns: COLUMNS.CATEGORIES },
    { name: SHEET_NAMES.INDEX, columns: ['sheetName', 'rowId', 'primaryKey', 'status', 'dueDate', 'priority', 'sortOrder', 'updatedAt'] },
    { name: SHEET_NAMES.PURCHASE_ITEMS, columns: COLUMNS.PURCHASE_ITEMS },
    { name: SHEET_NAMES.MEETING_AGENDA, columns: COLUMNS.MEETING_AGENDA },
  ];

  schemas.forEach(schema => {
    let sheet = ss.getSheetByName(schema.name);
    if (!sheet) {
      sheet = ss.insertSheet(schema.name);
    }
    const headerRange = sheet.getRange(1, 1, 1, schema.columns.length);
    headerRange.setValues([schema.columns]);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#4a86c8');
    headerRange.setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  });

  // デフォルトの「Sheet1」を削除
  const defaultSheet = ss.getSheetByName('Sheet1') || ss.getSheetByName('シート1');
  if (defaultSheet && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }

  return { success: true, message: 'スプレッドシートの初期化が完了しました' };
}

/**
 * スプレッドシートの構造を検証
 */
function validateSpreadsheetStructure() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const errors = [];

  const requiredSheets = Object.values(SHEET_NAMES);
  requiredSheets.forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (!sheet) {
      errors.push(`シート「${name}」が見つかりません`);
    }
  });

  return {
    valid: errors.length === 0,
    errors: errors,
  };
}
