/**
 * CalendarService.js
 * Googleカレンダー連携のビジネスロジック
 */

class CalendarService {
  constructor() {
    this._taskRepo = getTaskRepository();
    this._logRepo = getLogRepository();
  }

  /**
   * タスクのカレンダーイベントを作成・更新
   * 担当者全員をゲストとして招待する
   * @param {string} taskId
   * @param {object} currentUser
   * @returns {object}
   */
  syncTaskToCalendar(taskId, currentUser) {
    const task = this._taskRepo.findById(taskId);
    if (!task) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'タスクが見つかりません');
    }

    // dueDateは必須
    if (!task.dueDate) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'カレンダー登録には期限日の設定が必要です');
    }

    // 担当者のカレンダーに登録
    const calendar = CalendarApp.getDefaultCalendar();

    // 既存イベントの削除
    if (task.calendarEventId) {
      try {
        const existingEvent = calendar.getEventById(task.calendarEventId);
        if (existingEvent) {
          existingEvent.deleteEvent();
        }
      } catch (e) {
        Logger.log(`既存イベント削除エラー: ${e.message}`);
      }
    }

    // 担当者のメールアドレスを収集
    const guestEmails = this._resolveAssigneeEmails(task.assigneeId);

    // 新規イベント作成（終日 or 時間指定）
    const dateStr = String(task.dueDate).substring(0, 10);
    const tz = Session.getScriptTimeZone();
    let event;
    let startTime, endTime;

    // dueTimeを正規化（Date型がISO文字列に変換されている場合の対策）
    let normalizedTime = '';
    if (task.dueTime) {
      const timeMatch = String(task.dueTime).match(/(\d{2}):(\d{2})/);
      normalizedTime = timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : '';
    }

    if (normalizedTime) {
      // タイムゾーン安全な日時生成（new Date(string)のパース曖昧性を回避）
      startTime = this._createDateInTimeZone(dateStr, normalizedTime, tz);
      endTime = new Date(startTime.getTime() + 30 * 60 * 1000);
      const options = { description: task.description || '', sendInvites: false };
      if (guestEmails.length > 0) options.guests = guestEmails.join(',');
      event = calendar.createEvent(
        `[タスク] ${task.title}`,
        startTime,
        endTime,
        options
      );
    } else {
      // 終日イベント（タイムゾーン安全な日付生成）
      const eventDate = this._createDateInTimeZone(dateStr, '00:00', tz);
      const options = { description: task.description || '', sendInvites: false };
      if (guestEmails.length > 0) options.guests = guestEmails.join(',');
      event = calendar.createAllDayEvent(
        `[タスク] ${task.title}`,
        eventDate,
        options
      );
      startTime = eventDate;
      endTime = eventDate;
    }

    // タスクにイベントIDを保存
    const now = new Date().toISOString();
    const updated = {
      ...task,
      calendarEventId: event.getId(),
      updatedAt: now,
      updatedBy: currentUser.userId,
    };

    LockManager.executeWithLock(() => {
      this._taskRepo.update(taskId, updated);
    });

    this._writeLog(taskId, LOG_ACTION.CALENDAR_SYNC, currentUser.userId,
      normalizedTime ? 'カレンダー同期' : 'カレンダー同期（終日）');

    return {
      eventId: event.getId(),
      title: event.getTitle(),
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
    };
  }

  /**
   * 担当者IDからメールアドレスのリストを解決
   * @param {string} assigneeId - カンマ区切り or __ALL__
   * @returns {string[]}
   */
  _resolveAssigneeEmails(assigneeId) {
    if (!assigneeId) return [];

    const userRepo = getUserRepository();

    if (assigneeId === ASSIGNEE_ALL) {
      const allUsers = userRepo.findAll();
      return allUsers.map(u => u.email).filter(e => e);
    }

    const ids = assigneeId.split(',').filter(v => v && v !== ASSIGNEE_ALL);
    const emails = [];
    ids.forEach(id => {
      const user = userRepo.findById(id);
      if (user && user.email) {
        emails.push(user.email);
      }
    });
    return emails;
  }

  /**
   * 新規ユーザー追加時に__ALL__タスクのカレンダーイベントを再作成
   * addGuestではゲストのカレンダーに反映されない場合があるため、
   * イベントを再作成して新ユーザーを初期ゲストリストに含める
   * @param {object} newUser
   */
  syncAllTasksForNewUser(newUser) {
    if (!newUser || !newUser.email) return;

    const tasks = this._taskRepo.findByConditions({});
    const allTasks = tasks.filter(t =>
      t.assigneeId === ASSIGNEE_ALL &&
      t.dueDate &&
      t.status !== TASK_STATUS.COMPLETED
    );

    const systemUser = { userId: newUser.userId, email: newUser.email };

    allTasks.forEach(task => {
      try {
        this.syncTaskToCalendar(task.taskId, systemUser);
      } catch (e) {
        Logger.log(`新規ユーザーカレンダー同期エラー (task=${task.taskId}): ${e.message}`);
      }
    });
  }

  /**
   * 全ユーザーに対して__ALL__タスクのカレンダーイベントを再同期
   * 既に参加済みのユーザーがカレンダーに入っていない場合の一括修復用
   * @param {object} currentUser
   * @returns {{ synced: number, failed: number }}
   */
  rebuildAllCalendarEvents(currentUser) {
    const tasks = this._taskRepo.findByConditions({});
    const allTasks = tasks.filter(t =>
      t.assigneeId === ASSIGNEE_ALL &&
      t.dueDate &&
      t.status !== TASK_STATUS.COMPLETED
    );

    let synced = 0;
    let failed = 0;

    allTasks.forEach(task => {
      try {
        this.syncTaskToCalendar(task.taskId, currentUser);
        synced++;
      } catch (e) {
        Logger.log(`カレンダー再同期エラー (task=${task.taskId}): ${e.message}`);
        failed++;
      }
    });

    this._writeLog('SYSTEM', LOG_ACTION.CALENDAR_SYNC, currentUser.userId,
      `全員タスクカレンダー再同期: ${synced}件成功, ${failed}件失敗`);

    return { synced, failed };
  }

  /**
   * 担当者変更時のカレンダーイベント再作成
   * @param {string} taskId
   * @param {string} oldAssigneeId
   * @param {string} newAssigneeId
   * @param {object} currentUser
   */
  reassignCalendarEvent(taskId, oldAssigneeId, newAssigneeId, currentUser) {
    const task = this._taskRepo.findById(taskId);
    if (!task || !task.calendarEventId) return;

    // 旧担当者のイベントを削除
    if (task.calendarEventId) {
      try {
        const calendar = CalendarApp.getDefaultCalendar();
        const event = calendar.getEventById(task.calendarEventId);
        if (event) {
          event.deleteEvent();
        }
      } catch (e) {
        Logger.log(`イベント削除エラー: ${e.message}`);
      }
    }

    // 新担当者のカレンダーにイベント再作成
    if (task.dueDate) {
      this.syncTaskToCalendar(taskId, currentUser);
    }
  }

  /**
   * カレンダーイベントを削除
   * @param {string} taskId
   */
  deleteCalendarEvent(taskId) {
    const task = this._taskRepo.findById(taskId);
    if (!task || !task.calendarEventId) return;

    try {
      const calendar = CalendarApp.getDefaultCalendar();
      const event = calendar.getEventById(task.calendarEventId);
      if (event) {
        event.deleteEvent();
      }
    } catch (e) {
      Logger.log(`カレンダーイベント削除エラー: ${e.message}`);
    }

    // calendarEventIdをクリア
    const updated = { ...task, calendarEventId: '', updatedAt: new Date().toISOString() };
    this._taskRepo.update(taskId, updated);
  }

  /**
   * タイムゾーン安全なDate生成
   * new Date(string)のパース曖昧性を回避し、明示的にタイムゾーンを指定してDateを生成する
   * @param {string} dateStr - yyyy-MM-dd
   * @param {string} timeStr - HH:mm
   * @param {string} tz - タイムゾーン（例: "Asia/Tokyo"）
   * @returns {Date}
   */
  _createDateInTimeZone(dateStr, timeStr, tz) {
    // dateStr: "YYYY-MM-DD" 形式に正規化
    const datePart = String(dateStr).substring(0, 10);
    const parts = datePart.split('-');
    if (parts.length !== 3) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, '不正な日付形式: ' + dateStr);
    }

    // timeStr: "HH:mm" 形式に正規化（Date型文字列などが来ても対応）
    let hour = 0;
    let minute = 0;
    if (timeStr) {
      const timeMatch = String(timeStr).match(/(\d{2}):(\d{2})/);
      if (timeMatch) {
        hour = Number(timeMatch[1]);
        minute = Number(timeMatch[2]);
      }
    }

    const year = Number(parts[0]);
    const month = Number(parts[1]) - 1;
    const day = Number(parts[2]);

    // 不正な年（1900年以前など）をチェック
    if (year < 1970 || isNaN(year) || isNaN(month) || isNaN(day)) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, '不正な日付値: ' + dateStr);
    }

    const tempDate = new Date(year, month, day, hour, minute, 0, 0);
    return tempDate;
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

const calendarService_ = new CalendarService();

function getCalendarService() {
  return calendarService_;
}
