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
   * @param {string} taskId
   * @param {object} currentUser
   * @returns {object}
   */
  syncTaskToCalendar(taskId, currentUser) {
    const task = this._taskRepo.findById(taskId);
    if (!task) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'タスクが見つかりません');
    }

    // dueDateとdueTimeが両方必要
    if (!task.dueDate || !task.dueTime) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'カレンダー登録には期限日と時間の設定が必要です');
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

    // 新規イベント作成
    const startTime = new Date(`${task.dueDate}T${task.dueTime}:00`);
    const endTime = new Date(startTime.getTime() + 30 * 60 * 1000); // 30分後

    const event = calendar.createEvent(
      `[タスク] ${task.title}`,
      startTime,
      endTime,
      {
        description: task.description || '',
        location: '',
      }
    );

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

    this._writeLog(taskId, LOG_ACTION.CALENDAR_SYNC, currentUser.userId, 'カレンダー同期');

    return {
      eventId: event.getId(),
      title: event.getTitle(),
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
    };
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
    if (task.dueDate && task.dueTime) {
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
