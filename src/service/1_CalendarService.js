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
    let event;
    let startTime, endTime;

    if (task.dueTime) {
      startTime = new Date(`${dateStr}T${task.dueTime}:00`);
      endTime = new Date(startTime.getTime() + 30 * 60 * 1000);
      event = calendar.createEvent(
        `[タスク] ${task.title}`,
        startTime,
        endTime,
        {
          description: task.description || '',
          guests: guestEmails.join(','),
          sendInvites: false,
        }
      );
    } else {
      // 終日イベント
      const eventDate = new Date(`${dateStr}T00:00:00`);
      event = calendar.createAllDayEvent(
        `[タスク] ${task.title}`,
        eventDate,
        {
          description: task.description || '',
          guests: guestEmails.join(','),
          sendInvites: false,
        }
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
      task.dueTime ? 'カレンダー同期' : 'カレンダー同期（終日）');

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
   * 新規ユーザー追加時に__ALL__タスクのカレンダーイベントにゲスト追加
   * @param {object} newUser
   */
  syncAllTasksForNewUser(newUser) {
    if (!newUser || !newUser.email) return;

    const tasks = this._taskRepo.findByConditions({});
    const allTasks = tasks.filter(t =>
      t.assigneeId === ASSIGNEE_ALL &&
      t.calendarEventId &&
      t.status !== TASK_STATUS.COMPLETED
    );

    const calendar = CalendarApp.getDefaultCalendar();

    allTasks.forEach(task => {
      try {
        const event = calendar.getEventById(task.calendarEventId);
        if (event) {
          event.addGuest(newUser.email);
        }
      } catch (e) {
        Logger.log(`新規ユーザーカレンダー同期エラー (task=${task.taskId}): ${e.message}`);
      }
    });
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
