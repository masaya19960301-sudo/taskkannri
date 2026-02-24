/**
 * ClaimSyncService.js
 * クレーム情報スプレッドシートからタスクを自動生成するサービス
 *
 * クレームシートの構造（行11〜102）:
 *   C列: 入荷日  D列: 交換日  G列: 伝票No
 *   K列: 商品名  L列: 商品名称  M列: 内容  N列: 備考
 *   V列: 対応状況  W列: 対応期日  X列: 対応内容
 *   AA列: 検品済み（「済」なら検品完了）
 *
 * 生成タスクの種類:
 *   1. 検品タスク: 入荷日が確定 かつ 検品済み → 入荷日を期日としてタスク生成
 *   2. 対応タスク: 対応期日がある → 対応期日を期日としてタスク生成
 *
 * 重複禁止: 伝票No + タスク種別 で一意管理
 * 完了時書き戻し:
 *   - 検品タスク完了 → 元シートAA列に「済」
 *   - 対応タスク完了 → 元シートV列に「完了」
 */

class ClaimSyncService {
  constructor() {
    this._taskRepo = getTaskRepository();
    this._linkRepo = getExternalLinkRepository();
    this._logRepo = getLogRepository();
  }

  /**
   * クレーム情報からタスクを同期（日次実行）
   * @param {string} claimSheetId - クレーム情報スプレッドシートID
   * @returns {{ created: number, skipped: number, errors: string[] }}
   */
  syncClaimTasks(claimSheetId) {
    if (!claimSheetId) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'クレームシートIDが指定されていません');
    }

    const result = { created: 0, skipped: 0, errors: [] };

    try {
      const ss = SpreadsheetApp.openById(claimSheetId);
      const sheet = ss.getSheets()[0];

      // C11:AA102 の範囲を読み取り（行11〜102）
      const startRow = 11;
      const endRow = 102;
      const numRows = endRow - startRow + 1;
      // A〜AA = 27列
      const data = sheet.getRange(startRow, 1, numRows, 27).getValues();

      // 列インデックス（0始まり）
      const COL = {
        C: 2,   // 入荷日
        D: 3,   // 交換日
        G: 6,   // 伝票No
        K: 10,  // 商品名
        L: 11,  // 商品名称
        M: 12,  // 内容
        N: 13,  // 備考
        V: 21,  // 対応状況
        W: 22,  // 対応期日
        X: 23,  // 対応内容
        AA: 26, // 検品済み
      };

      const systemUser = { userId: 'SYSTEM_CLAIM', email: '' };

      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const rowNum = startRow + i;
        const slipNo = String(row[COL.G] || '').trim();

        if (!slipNo) continue; // 伝票Noなしはスキップ

        const arrivalDate = this._parseDate(row[COL.C]);
        const inspected = String(row[COL.AA] || '').trim();
        const responseDeadline = this._parseDate(row[COL.W]);
        const productName = String(row[COL.K] || '').trim();
        const productLabel = String(row[COL.L] || '').trim();
        const content = String(row[COL.M] || '').trim();
        const notes = String(row[COL.N] || '').trim();
        const responseContent = String(row[COL.X] || '').trim();

        const itemName = productLabel || productName || '不明';

        // --- 検品タスク ---
        // 入荷日が確定している かつ 検品済み（「済」）
        if (arrivalDate && inspected === '済') {
          try {
            const created = this._createClaimTask({
              slipNo,
              rowNum,
              claimSheetId,
              type: 'inspection',
              title: `【検品】伝票No.${slipNo} ${itemName}`,
              description: this._buildDescription('検品', {
                itemName, content, notes, responseContent,
              }),
              dueDate: arrivalDate,
            }, systemUser);

            if (created) {
              result.created++;
            } else {
              result.skipped++;
            }
          } catch (e) {
            result.errors.push(`行${rowNum} 検品タスク: ${e.message}`);
          }
        }

        // --- 対応タスク ---
        // 対応期日がある場合
        if (responseDeadline) {
          try {
            const created = this._createClaimTask({
              slipNo,
              rowNum,
              claimSheetId,
              type: 'response',
              title: `【対応】伝票No.${slipNo} ${itemName}`,
              description: this._buildDescription('対応', {
                itemName, content, notes, responseContent,
              }),
              dueDate: responseDeadline,
            }, systemUser);

            if (created) {
              result.created++;
            } else {
              result.skipped++;
            }
          } catch (e) {
            result.errors.push(`行${rowNum} 対応タスク: ${e.message}`);
          }
        }
      }
    } catch (e) {
      if (e instanceof AppError) throw e;
      result.errors.push(`シート読み込みエラー: ${e.message}`);
      Logger.log(`クレーム同期エラー: ${e.message}\n${e.stack}`);
    }

    this._writeLog('SYSTEM', LOG_ACTION.SYNC, 'SYSTEM_CLAIM',
      `クレーム同期: ${result.created}件作成, ${result.skipped}件スキップ, ${result.errors.length}件エラー`);

    Logger.log(`クレーム同期完了: ${JSON.stringify(result)}`);
    return result;
  }

  /**
   * クレームタスクを1件作成（重複チェック付き）
   * @param {object} params
   * @param {object} systemUser
   * @returns {boolean} 作成されたらtrue
   */
  _createClaimTask(params, systemUser) {
    const { slipNo, rowNum, claimSheetId, type, title, description, dueDate } = params;

    // 重複チェック: externalUUID = "claim_{type}_{slipNo}" で一意管理
    const externalUUID = `claim_${type}_${slipNo}`;

    const existing = this._taskRepo.findByExternalKey(slipNo, externalUUID);
    if (existing) {
      return false; // 既に存在する → スキップ
    }

    // タスク作成
    const now = new Date().toISOString();
    const task = {
      taskId: UUIDGenerator.generate(),
      title: title,
      description: description,
      dueDate: dueDate,
      dueTime: '',
      priority: TASK_PRIORITY.MEDIUM,
      status: TASK_STATUS.NOT_STARTED,
      assigneeId: ASSIGNEE_ALL,
      categoryId: '',
      recurrenceId: '',
      externalUUID: externalUUID,
      invoiceNo: String(slipNo),
      sortOrder: 0,
      calendarEventId: '',
      createdAt: now,
      updatedAt: now,
      createdBy: systemUser.userId,
      updatedBy: systemUser.userId,
    };

    LockManager.executeWithLock(() => {
      this._taskRepo.create(task);
      getIndexRepository().upsertTaskIndex(task);
    });

    // ExternalLinksに登録（書き戻し用）
    const link = {
      linkId: UUIDGenerator.generate(),
      taskId: task.taskId,
      invoiceNo: String(slipNo),
      externalUUID: externalUUID,
      sourceSheetId: claimSheetId,
      sourceRowId: String(rowNum),
      syncUpdatedAt: now,
    };
    this._linkRepo.create(link);

    this._writeLog(task.taskId, LOG_ACTION.CREATE, systemUser.userId,
      `クレーム${type === 'inspection' ? '検品' : '対応'}タスク自動生成`);

    return true;
  }

  /**
   * タスク完了時にクレームシートへ書き戻し
   * @param {object} task - 完了したタスク
   */
  writeBackOnComplete(task) {
    if (!task || !task.externalUUID) return;

    // クレームタスクかどうか判定
    const uuid = task.externalUUID;
    if (!uuid.startsWith('claim_')) return;

    const type = uuid.startsWith('claim_inspection_') ? 'inspection' :
                 uuid.startsWith('claim_response_') ? 'response' : null;
    if (!type) return;

    // ExternalLinksからシート情報を取得
    const links = this._linkRepo.findByTaskId(task.taskId);
    if (links.length === 0) return;

    const link = links[0];
    if (!link.sourceSheetId || !link.sourceRowId) return;

    try {
      const ss = SpreadsheetApp.openById(link.sourceSheetId);
      const sheet = ss.getSheets()[0];
      const rowIdx = Number(link.sourceRowId);

      if (isNaN(rowIdx) || rowIdx < 11) return;

      if (type === 'inspection') {
        // 検品タスク完了 → AA列（27列目）に「済」を書き込み
        sheet.getRange(rowIdx, 27).setValue('済');
      } else if (type === 'response') {
        // 対応タスク完了 → V列（22列目）に「完了」を書き込み
        sheet.getRange(rowIdx, 22).setValue('完了');
      }

      Logger.log(`クレーム書き戻し完了: 伝票No=${task.invoiceNo}, type=${type}, row=${rowIdx}`);
    } catch (e) {
      Logger.log(`クレーム書き戻しエラー: ${e.message}`);
    }
  }

  /**
   * 日付を解析してyyyy-MM-dd文字列を返す
   * @param {*} value
   * @returns {string|null}
   */
  _parseDate(value) {
    if (!value) return null;

    if (value instanceof Date) {
      if (isNaN(value.getTime())) return null;
      return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }

    const str = String(value).trim();
    if (!str) return null;

    // yyyy-MM-dd or yyyy/MM/dd 形式
    const match = str.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (match) {
      const y = match[1];
      const m = match[2].padStart(2, '0');
      const d = match[3].padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    return null;
  }

  /**
   * タスク説明文を組み立て
   * @param {string} type
   * @param {object} info
   * @returns {string}
   */
  _buildDescription(type, info) {
    const lines = [`【${type}タスク - クレーム情報より自動生成】`];
    if (info.itemName) lines.push(`商品: ${info.itemName}`);
    if (info.content) lines.push(`内容: ${info.content}`);
    if (info.notes) lines.push(`備考: ${info.notes}`);
    if (info.responseContent) lines.push(`対応内容: ${info.responseContent}`);
    return lines.join('\n');
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

const claimSyncService_ = new ClaimSyncService();

function getClaimSyncService() {
  return claimSyncService_;
}
