/**
 * CategoryRepository.js
 * カテゴリのリポジトリ
 */

class CategoryRepository extends BaseRepository {
  constructor() {
    super(SHEET_NAMES.CATEGORIES, 'categoryId', COLUMNS.CATEGORIES);
  }

  /**
   * ソート順で全件取得
   * @returns {object[]}
   */
  findAllSorted() {
    const all = this.findAll();
    return all.sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
  }

  /**
   * 名前で検索
   * @param {string} name
   * @returns {object|null}
   */
  findByName(name) {
    const results = this.findByColumn('name', name);
    return results.length > 0 ? results[0] : null;
  }
}

const categoryRepository_ = new CategoryRepository();

function getCategoryRepository() {
  return categoryRepository_;
}
