/**
 * ExternalLinkRepository.js
 * 外部連携リンクのリポジトリ
 */

class ExternalLinkRepository extends BaseRepository {
  constructor() {
    super(SHEET_NAMES.EXTERNAL_LINKS, 'linkId', COLUMNS.EXTERNAL_LINKS);
  }

  /**
   * タスクIDで検索
   * @param {string} taskId
   * @returns {object[]}
   */
  findByTaskId(taskId) {
    return this.findByColumn('taskId', taskId);
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
        const entity = {};
        headers.forEach((h, j) => { entity[h] = rows[i][j]; });
        return entity;
      }
    }
    return null;
  }

  /**
   * ソースシートIDで検索
   * @param {string} sourceSheetId
   * @returns {object[]}
   */
  findBySourceSheet(sourceSheetId) {
    return this.findByColumn('sourceSheetId', sourceSheetId);
  }
}

const externalLinkRepository_ = new ExternalLinkRepository();

function getExternalLinkRepository() {
  return externalLinkRepository_;
}
