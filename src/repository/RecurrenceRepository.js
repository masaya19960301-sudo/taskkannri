/**
 * RecurrenceRepository.js
 * 繰り返し設定のリポジトリ
 */

class RecurrenceRepository extends BaseRepository {
  constructor() {
    super(SHEET_NAMES.RECURRENCES, 'recurrenceId', COLUMNS.RECURRENCES);
  }

  /**
   * タイプで検索
   * @param {string} type
   * @returns {object[]}
   */
  findByType(type) {
    return this.findByColumn('type', type);
  }
}

const recurrenceRepository_ = new RecurrenceRepository();

function getRecurrenceRepository() {
  return recurrenceRepository_;
}
