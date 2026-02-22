/**
 * AttachmentRepository.js
 * 添付ファイルのリポジトリ
 */

class AttachmentRepository extends BaseRepository {
  constructor() {
    super(SHEET_NAMES.ATTACHMENTS, 'attachmentId', COLUMNS.ATTACHMENTS);
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
   * タスクの添付ファイルの合計サイズを取得
   * @param {string} taskId
   * @returns {number}
   */
  getTotalSizeByTask(taskId) {
    const attachments = this.findByTaskId(taskId);
    return attachments.reduce((sum, a) => sum + (Number(a.size) || 0), 0);
  }
}

const attachmentRepository_ = new AttachmentRepository();

function getAttachmentRepository() {
  return attachmentRepository_;
}
