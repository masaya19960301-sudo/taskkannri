/**
 * Constants.js
 * アプリケーション全体の定数定義
 */

const APP_CONFIG = Object.freeze({
  APP_NAME: 'TaskKanri',
  VERSION: '1.0.0',
  MAX_TASKS: 5000,
  MAX_DISPLAY: 200,
  MAX_ATTACHMENTS: 3,
  MAX_ATTACHMENT_TOTAL_SIZE: 20 * 1024 * 1024, // 20MB
  CACHE_TTL: 300, // 5 minutes
  LOG_RETENTION_DAYS: 365,
  TASK_RETENTION_DAYS: 365,
  INDEX_SHEET_NAME: '_Index',
  CLAIM_SHEET_ID: '', // クレーム情報スプレッドシートID（管理者が設定画面から指定）
});

const SHEET_NAMES = Object.freeze({
  USERS: 'Users',
  TASKS: 'Tasks',
  RECURRENCES: 'Recurrences',
  EXTERNAL_LINKS: 'ExternalLinks',
  ATTACHMENTS: 'Attachments',
  LOGS: 'Logs',
  CATEGORIES: 'Categories',
  INDEX: '_Index',
});

const TASK_STATUS = Object.freeze({
  NOT_STARTED: '未着手',
  IN_PROGRESS: '進行中',
  COMPLETED: '完了',
});

const TASK_PRIORITY = Object.freeze({
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
});

const USER_ROLE = Object.freeze({
  ADMIN: 'admin',
  USER: 'user',
});

const ASSIGNEE_ALL = '__ALL__';

const RECURRENCE_TYPE = Object.freeze({
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
  MONTH_END: 'monthEnd',
});

const LOG_ACTION = Object.freeze({
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  STATUS_CHANGE: 'STATUS_CHANGE',
  ASSIGN: 'ASSIGN',
  SYNC: 'SYNC',
  CALENDAR_SYNC: 'CALENDAR_SYNC',
  ATTACHMENT_ADD: 'ATTACHMENT_ADD',
  ATTACHMENT_DELETE: 'ATTACHMENT_DELETE',
});

const ERROR_CODES = Object.freeze({
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  RATE_LIMIT: 'RATE_LIMIT',
  MAX_TASKS_REACHED: 'MAX_TASKS_REACHED',
  MAX_ATTACHMENTS_REACHED: 'MAX_ATTACHMENTS_REACHED',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  LOCK_TIMEOUT: 'LOCK_TIMEOUT',
  INVALID_CSRF: 'INVALID_CSRF',
});

const CACHE_KEYS = Object.freeze({
  TASKS_PREFIX: 'tasks_',
  USERS_PREFIX: 'users_',
  CATEGORIES: 'categories_all',
  CURRENT_USER: 'current_user_',
  CSRF_PREFIX: 'csrf_',
  INDEX: 'index_data',
});

const COLUMNS = Object.freeze({
  USERS: ['userId', 'email', 'displayName', 'department', 'role', 'createdAt', 'updatedAt'],
  TASKS: [
    'taskId', 'title', 'description', 'dueDate', 'dueTime', 'priority',
    'status', 'assigneeId', 'categoryId', 'recurrenceId', 'externalUUID',
    'invoiceNo', 'sortOrder', 'calendarEventId', 'createdAt', 'updatedAt',
    'createdBy', 'updatedBy',
  ],
  RECURRENCES: ['recurrenceId', 'type', 'interval', 'weekdays', 'baseDate'],
  EXTERNAL_LINKS: [
    'linkId', 'taskId', 'invoiceNo', 'externalUUID',
    'sourceSheetId', 'sourceRowId', 'syncUpdatedAt',
  ],
  ATTACHMENTS: ['attachmentId', 'taskId', 'driveFileId', 'fileName', 'mimeType', 'size', 'uploadedBy', 'createdAt'],
  LOGS: ['logId', 'taskId', 'actionType', 'userId', 'detail', 'timestamp'],
  CATEGORIES: ['categoryId', 'name', 'color', 'sortOrder', 'createdAt'],
});
