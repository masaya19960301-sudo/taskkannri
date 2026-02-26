/**
 * ClaimSyncService.js
 * クレーム情報スプレッドシートとの双方向同期サービス
 *
 * クレームシートの構造（行11〜102）:
 *   C列: 入荷日  D列: 交換日  G列: 伝票No
 *   K列: 商品名  L列: 商品名称  M列: 内容  N列: 備考
 *   V列: 対応状況  W列: 対応期日  X列: 対応内容
 *   Z列: 検品完了マーク  AA列: 検品済み（「済」なら検品完了）
 *
 * 生成タスクの種類:
 *   1. 検品タスク: 入荷日あり AND 検品がまだ(AA≠「済」) → 入荷日を期日としてタスク生成
 *   2. 対応タスク: 対応期日あり AND 対応がまだ(V≠「対応完了」) → 対応期日を期日としてタスク生成
 *
 * 双方向同期（1日1回）:
 *   元シート→タスク: 日付・内容が変わったら既存タスクを更新
 *   タスク→元シート: タスク完了時にZ列+AA列/V列を書き戻し
 *
 * 重複禁止: 伝票No + タスク種別 で一意管理
 */

class ClaimSyncService {
  constructor() {
    this._taskRepo = getTaskRepository();
    this._linkRepo = getExternalLinkRepository();
    this._logRepo = getLogRepository();
  }

  /**
   * クレーム情報との双方向同期（日次実行）
   * @param {string} claimSheetId - クレーム情報スプレッドシートID
   * @returns {{ created: number, updated: number, skipped: number, writtenBack: number, errors: string[] }}
   */
  syncClaimTasks(claimSheetId) {
    if (!claimSheetId) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'クレームシートIDが指定されていません');
    }

    const result = { created: 0, updated: 0, skipped: 0, writtenBack: 0, errors: [] };

    let sheet;
    try {
      const ss = SpreadsheetApp.openById(claimSheetId);
      sheet = ss.getSheets()[0];
    } catch (e) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'クレームシートを開けません: ' + e.message);
    }

    // C11:AA102 の範囲を読み取り（行11〜102）
    const startRow = 11;
    const endRow = 102;
    const numRows = endRow - startRow + 1;
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

    // === STEP 1: タスク→元シート 書き戻し（完了タスク） ===
    this._writeBackCompletedTasks(sheet, claimSheetId, result);

    // === STEP 2: 元シート→タスク 同期（新規作成 or 更新） ===
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNum = startRow + i;
      const slipNo = String(row[COL.G] || '').trim();

      if (!slipNo) continue;

      const arrivalDate = this._parseDate(row[COL.C]);
      const inspected = String(row[COL.AA] || '').trim();
      const responseDeadline = this._parseDate(row[COL.W]);
      const responseStatus = String(row[COL.V] || '').trim();
      const productName = String(row[COL.K] || '').trim();
      const productLabel = String(row[COL.L] || '').trim();
      const content = String(row[COL.M] || '').trim();
      const notes = String(row[COL.N] || '').trim();
      const responseContent = String(row[COL.X] || '').trim();

      const itemName = productLabel || productName || '不明';

      // --- 検品タスク ---
      // 入荷日あり AND まだ検品されていない（AA列≠「済」）
      if (arrivalDate && inspected !== '済') {
        try {
          const r = this._syncOneTask({
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

          if (r === 'created') result.created++;
          else if (r === 'updated') result.updated++;
          else result.skipped++;
        } catch (e) {
          result.errors.push(`行${rowNum} 検品: ${e.message}`);
        }
      }

      // --- 対応タスク ---
      // 対応期日あり AND まだ対応完了していない（V列≠「対応完了」）
      if (responseDeadline && responseStatus !== '対応完了') {
        try {
          const r = this._syncOneTask({
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

          if (r === 'created') result.created++;
          else if (r === 'updated') result.updated++;
          else result.skipped++;
        } catch (e) {
          result.errors.push(`行${rowNum} 対応: ${e.message}`);
        }
      }
    }

    this._writeLog('SYSTEM', LOG_ACTION.SYNC, 'SYSTEM_CLAIM',
      `クレーム同期: ${result.created}件作成, ${result.updated}件更新, ${result.writtenBack}件書き戻し, ${result.errors.length}件エラー`);

    Logger.log(`クレーム同期完了: ${JSON.stringify(result)}`);
    return result;
  }

  /**
   * 1件のクレームタスクを同期（新規作成 or 既存更新）
   * @returns {'created'|'updated'|'skipped'}
   */
  _syncOneTask(params, systemUser) {
    const { slipNo, rowNum, claimSheetId, type, title, description, dueDate } = params;
    const externalUUID = `claim_${type}_${slipNo}`;
    const now = new Date().toISOString();

    const existing = this._taskRepo.findByExternalKey(String(slipNo), externalUUID);

    if (existing) {
      // 既に完了しているタスクは更新しない
      if (existing.status === TASK_STATUS.COMPLETED) {
        return 'skipped';
      }

      // 元シートの内容が変わっていたら更新
      let changed = false;
      const updates = { ...existing };

      if (existing.dueDate !== dueDate) {
        updates.dueDate = dueDate;
        changed = true;
      }
      if (existing.title !== title) {
        updates.title = title;
        changed = true;
      }
      if (existing.description !== description) {
        updates.description = description;
        changed = true;
      }

      if (!changed) return 'skipped';

      updates.updatedAt = now;
      updates.updatedBy = systemUser.userId;

      LockManager.executeWithLock(() => {
        this._taskRepo.update(existing.taskId, updates);
        getIndexRepository().upsertTaskIndex(updates);
      });

      // ExternalLinksの行番号も更新（行が変わっている場合）
      const links = this._linkRepo.findByTaskId(existing.taskId);
      if (links.length > 0 && links[0].sourceRowId !== String(rowNum)) {
        this._linkRepo.update(links[0].linkId, {
          ...links[0],
          sourceRowId: String(rowNum),
          syncUpdatedAt: now,
        });
      }

      return 'updated';
    }

    // カテゴリを名前で検索して自動設定（検品→「検品」、対応→「クレーム対応」）
    const categoryName = type === 'inspection' ? '検品' : 'クレーム対応';
    const category = getCategoryRepository().findByName(categoryName);
    const categoryId = category ? category.categoryId : '';

    // 新規作成
    const task = {
      taskId: UUIDGenerator.generate(),
      title: title,
      description: description,
      dueDate: dueDate,
      dueTime: '',
      priority: TASK_PRIORITY.MEDIUM,
      status: TASK_STATUS.NOT_STARTED,
      assigneeId: ASSIGNEE_ALL,
      categoryId: categoryId,
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

    // カレンダーへ自動同期（期限日があれば）
    if (task.dueDate) {
      try {
        getCalendarService().syncTaskToCalendar(task.taskId, systemUser);
      } catch (e) {
        Logger.log(`クレームタスクカレンダー自動同期エラー: ${e.message}`);
      }
    }

    return 'created';
  }

  /**
   * 完了済みタスクをクレームシートへ書き戻し
   * （日次同期のSTEP1で呼ばれる）
   */
  _writeBackCompletedTasks(sheet, claimSheetId, result) {
    // クレーム系ExternalLinksを全取得
    const allLinks = this._linkRepo.findBySourceSheet(claimSheetId);

    for (const link of allLinks) {
      if (!link.externalUUID || !link.externalUUID.startsWith('claim_')) continue;

      const task = this._taskRepo.findById(link.taskId);
      if (!task || task.status !== TASK_STATUS.COMPLETED) continue;

      const rowIdx = Number(link.sourceRowId);
      if (isNaN(rowIdx) || rowIdx < 11) continue;

      const type = link.externalUUID.startsWith('claim_inspection_') ? 'inspection' :
                   link.externalUUID.startsWith('claim_response_') ? 'response' : null;
      if (!type) continue;

      try {
        if (type === 'inspection') {
          // Z列(26)とAA列(27)の両方に「済」を書き込み
          const currentAA = sheet.getRange(rowIdx, 27).getValue();
          if (String(currentAA).trim() !== '済') {
            sheet.getRange(rowIdx, 26).setValue('済');  // Z列
            sheet.getRange(rowIdx, 27).setValue('済');  // AA列
            result.writtenBack++;
          }
        } else if (type === 'response') {
          // V列(22)に「対応完了」を書き込み
          const currentV = sheet.getRange(rowIdx, 22).getValue();
          if (String(currentV).trim() !== '対応完了') {
            sheet.getRange(rowIdx, 22).setValue('対応完了');
            result.writtenBack++;
          }
        }
      } catch (e) {
        result.errors.push(`書き戻し(行${rowIdx}): ${e.message}`);
      }
    }
  }

  /**
   * タスク完了時にクレームシートへ即時書き戻し
   * （TaskServiceのupdateTaskから呼ばれる）
   */
  writeBackOnComplete(task) {
    if (!task || !task.externalUUID) return;

    const uuid = task.externalUUID;
    if (!uuid.startsWith('claim_')) return;

    const type = uuid.startsWith('claim_inspection_') ? 'inspection' :
                 uuid.startsWith('claim_response_') ? 'response' : null;
    if (!type) return;

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
        // Z列(26)とAA列(27)の両方に「済」を書き込み
        sheet.getRange(rowIdx, 26).setValue('済');  // Z列
        sheet.getRange(rowIdx, 27).setValue('済');  // AA列
      } else if (type === 'response') {
        // V列(22)に「対応完了」を書き込み
        sheet.getRange(rowIdx, 22).setValue('対応完了');
      }

      Logger.log(`クレーム書き戻し完了: 伝票No=${task.invoiceNo}, type=${type}, row=${rowIdx}`);
    } catch (e) {
      Logger.log(`クレーム書き戻しエラー: ${e.message}`);
    }
  }

  /**
   * 日付を解析してyyyy-MM-dd文字列を返す
   */
  _parseDate(value) {
    if (!value) return null;

    if (value instanceof Date) {
      if (isNaN(value.getTime())) return null;
      return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }

    const str = String(value).trim();
    if (!str) return null;

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
