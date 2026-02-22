/**
 * AttachmentService.js
 * 添付ファイル管理のビジネスロジック
 */

class AttachmentService {
  constructor() {
    this._attachmentRepo = getAttachmentRepository();
    this._taskRepo = getTaskRepository();
    this._logRepo = getLogRepository();
  }

  /**
   * 添付ファイルを追加
   * @param {string} taskId
   * @param {object} fileData - { name, mimeType, data (base64) }
   * @param {object} currentUser
   * @returns {object}
   */
  addAttachment(taskId, fileData, currentUser) {
    const task = this._taskRepo.findById(taskId);
    if (!task) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'タスクが見つかりません');
    }

    // 件数チェック
    const existing = this._attachmentRepo.findByTaskId(taskId);
    if (existing.length >= APP_CONFIG.MAX_ATTACHMENTS) {
      throw new AppError(ERROR_CODES.MAX_ATTACHMENTS_REACHED,
        `添付ファイルは最大${APP_CONFIG.MAX_ATTACHMENTS}件までです`);
    }

    // サイズチェック
    const decoded = Utilities.base64Decode(fileData.data);
    const fileSize = decoded.length;
    const currentTotal = this._attachmentRepo.getTotalSizeByTask(taskId);
    if (currentTotal + fileSize > APP_CONFIG.MAX_ATTACHMENT_TOTAL_SIZE) {
      throw new AppError(ERROR_CODES.FILE_TOO_LARGE,
        `添付ファイルの合計サイズが上限(${APP_CONFIG.MAX_ATTACHMENT_TOTAL_SIZE / 1024 / 1024}MB)を超えます`);
    }

    // Drive にファイルを保存
    const blob = Utilities.newBlob(decoded, fileData.mimeType, fileData.name);
    const folder = this._getOrCreateFolder();
    const driveFile = folder.createFile(blob);

    const now = new Date().toISOString();
    const attachment = {
      attachmentId: UUIDGenerator.generate(),
      taskId: taskId,
      driveFileId: driveFile.getId(),
      fileName: fileData.name,
      mimeType: fileData.mimeType,
      size: fileSize,
      uploadedBy: currentUser.userId,
      createdAt: now,
    };

    const result = LockManager.executeWithLock(() => this._attachmentRepo.create(attachment));

    this._writeLog(taskId, LOG_ACTION.ATTACHMENT_ADD, currentUser.userId,
      `添付ファイル追加: ${fileData.name}`);

    return result;
  }

  /**
   * 添付ファイルを削除
   * @param {string} attachmentId
   * @param {object} currentUser
   * @returns {boolean}
   */
  deleteAttachment(attachmentId, currentUser) {
    const attachment = this._attachmentRepo.findById(attachmentId);
    if (!attachment) {
      throw new AppError(ERROR_CODES.NOT_FOUND, '添付ファイルが見つかりません');
    }

    // Drive ファイルを削除
    try {
      DriveApp.getFileById(attachment.driveFileId).setTrashed(true);
    } catch (e) {
      Logger.log(`Driveファイル削除エラー: ${e.message}`);
    }

    const result = LockManager.executeWithLock(() => this._attachmentRepo.delete(attachmentId));

    this._writeLog(attachment.taskId, LOG_ACTION.ATTACHMENT_DELETE, currentUser.userId,
      `添付ファイル削除: ${attachment.fileName}`);

    return result;
  }

  /**
   * タスクの添付ファイル一覧を取得
   * @param {string} taskId
   * @returns {object[]}
   */
  getAttachments(taskId) {
    return this._attachmentRepo.findByTaskId(taskId);
  }

  /**
   * 添付ファイルのダウンロードURLを取得
   * @param {string} attachmentId
   * @returns {string}
   */
  getDownloadUrl(attachmentId) {
    const attachment = this._attachmentRepo.findById(attachmentId);
    if (!attachment) {
      throw new AppError(ERROR_CODES.NOT_FOUND, '添付ファイルが見つかりません');
    }
    return `https://drive.google.com/uc?id=${attachment.driveFileId}&export=download`;
  }

  /**
   * 添付ファイル保存フォルダを取得・作成
   * @returns {GoogleAppsScript.Drive.Folder}
   */
  _getOrCreateFolder() {
    const folderName = `${APP_CONFIG.APP_NAME}_Attachments`;
    const folders = DriveApp.getFoldersByName(folderName);
    if (folders.hasNext()) return folders.next();
    return DriveApp.createFolder(folderName);
  }

  /**
   * ログ書き込みヘルパー
   */
  _writeLog(taskId, actionType, userId, detail) {
    try {
      this._logRepo.create({
        logId: UUIDGenerator.generate(),
        taskId: taskId,
        actionType: actionType,
        userId: userId,
        detail: detail || '',
        timestamp: new Date().toISOString(),
      });
    } catch (e) {
      Logger.log(`ログ書き込みエラー: ${e.message}`);
    }
  }
}

const attachmentService_ = new AttachmentService();

function getAttachmentService() {
  return attachmentService_;
}
