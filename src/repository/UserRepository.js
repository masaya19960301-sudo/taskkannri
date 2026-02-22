/**
 * UserRepository.js
 * ユーザーデータのリポジトリ
 */

class UserRepository extends BaseRepository {
  constructor() {
    super(SHEET_NAMES.USERS, 'userId', COLUMNS.USERS);
  }

  /**
   * メールアドレスでユーザーを検索
   * @param {string} email
   * @returns {object|null}
   */
  findByEmail(email) {
    const results = this.findByColumn('email', email);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * ロールでユーザーを検索
   * @param {string} role
   * @returns {object[]}
   */
  findByRole(role) {
    return this.findByColumn('role', role);
  }

  /**
   * 部署でユーザーを検索
   * @param {string} department
   * @returns {object[]}
   */
  findByDepartment(department) {
    return this.findByColumn('department', department);
  }
}

const userRepository_ = new UserRepository();

function getUserRepository() {
  return userRepository_;
}
