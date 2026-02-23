/**
 * Validator.js
 * 入力値バリデーション層
 */

class Validator {
  /**
   * 必須項目チェック
   * @param {object} data
   * @param {string[]} requiredFields
   * @returns {{ valid: boolean, errors: string[] }}
   */
  static validateRequired(data, requiredFields) {
    const errors = [];
    requiredFields.forEach(field => {
      if (data[field] === undefined || data[field] === null || data[field] === '') {
        errors.push(`${field} は必須です`);
      }
    });
    return { valid: errors.length === 0, errors };
  }

  /**
   * タスクデータのバリデーション
   * @param {object} task
   * @param {boolean} isUpdate
   * @returns {{ valid: boolean, errors: string[] }}
   */
  static validateTask(task, isUpdate) {
    const errors = [];

    if (!isUpdate) {
      const required = Validator.validateRequired(task, ['title', 'status']);
      if (!required.valid) errors.push(...required.errors);
    }

    if (task.title !== undefined) {
      if (typeof task.title !== 'string' || task.title.trim().length === 0) {
        errors.push('title は空にできません');
      }
      if (task.title.length > 200) {
        errors.push('title は200文字以内にしてください');
      }
    }

    if (task.description !== undefined && task.description.length > 5000) {
      errors.push('description は5000文字以内にしてください');
    }

    if (task.status !== undefined) {
      const validStatuses = Object.values(TASK_STATUS);
      if (!validStatuses.includes(task.status)) {
        errors.push(`status は ${validStatuses.join(', ')} のいずれかにしてください`);
      }
    }

    if (task.priority !== undefined) {
      const p = Number(task.priority);
      if (isNaN(p) || p < 1 || p > 3) {
        errors.push('priority は 1〜3 の数値にしてください');
      }
    }

    if (task.dueDate !== undefined && task.dueDate !== '' && task.dueDate !== null) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(task.dueDate)) {
        errors.push('dueDate は YYYY-MM-DD 形式にしてください');
      }
    }

    if (task.dueTime !== undefined && task.dueTime !== '' && task.dueTime !== null) {
      if (!/^\d{2}:\d{2}$/.test(task.dueTime)) {
        errors.push('dueTime は HH:MM 形式にしてください');
      }
    }

    if (task.sortOrder !== undefined) {
      const s = Number(task.sortOrder);
      if (isNaN(s) || s < 0) {
        errors.push('sortOrder は 0 以上の数値にしてください');
      }
    }

    // XSS対策: HTMLタグの検出
    const textFields = ['title', 'description'];
    textFields.forEach(field => {
      if (task[field] && /<script[\s>]/i.test(task[field])) {
        errors.push(`${field} にスクリプトタグは使用できません`);
      }
    });

    return { valid: errors.length === 0, errors };
  }

  /**
   * ユーザーデータのバリデーション
   * @param {object} user
   * @returns {{ valid: boolean, errors: string[] }}
   */
  static validateUser(user) {
    const errors = [];
    const required = Validator.validateRequired(user, ['email', 'displayName']);
    if (!required.valid) errors.push(...required.errors);

    if (user.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) {
      errors.push('email の形式が正しくありません');
    }

    if (user.displayName && user.displayName.length > 100) {
      errors.push('displayName は100文字以内にしてください');
    }

    if (user.department && user.department.length > 100) {
      errors.push('department は100文字以内にしてください');
    }

    if (user.role !== undefined) {
      const validRoles = Object.values(USER_ROLE);
      if (!validRoles.includes(user.role)) {
        errors.push(`role は ${validRoles.join(', ')} のいずれかにしてください`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * 繰り返し設定のバリデーション
   * @param {object} recurrence
   * @returns {{ valid: boolean, errors: string[] }}
   */
  static validateRecurrence(recurrence) {
    const errors = [];
    const required = Validator.validateRequired(recurrence, ['type', 'baseDate']);
    if (!required.valid) errors.push(...required.errors);

    if (recurrence.type !== undefined) {
      const validTypes = Object.values(RECURRENCE_TYPE);
      if (!validTypes.includes(recurrence.type)) {
        errors.push(`type は ${validTypes.join(', ')} のいずれかにしてください`);
      }
    }

    if (recurrence.type === RECURRENCE_TYPE.WEEKLY) {
      if (!recurrence.weekdays || !Array.isArray(recurrence.weekdays) || recurrence.weekdays.length === 0) {
        errors.push('weekly の場合 weekdays は必須です');
      }
    }

    if (recurrence.interval !== undefined) {
      const intv = Number(recurrence.interval);
      if (isNaN(intv) || intv < 1 || intv > 365) {
        errors.push('interval は 1〜365 の数値にしてください');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * テキストのサニタイズ
   * @param {string} text
   * @returns {string}
   */
  static sanitize(text) {
    if (typeof text !== 'string') return text;
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  /**
   * オブジェクトのテキストフィールドをサニタイズ
   * @param {object} data
   * @param {string[]} fields
   * @returns {object}
   */
  static sanitizeFields(data, fields) {
    const sanitized = { ...data };
    fields.forEach(field => {
      if (sanitized[field] && typeof sanitized[field] === 'string') {
        sanitized[field] = Validator.sanitize(sanitized[field]);
      }
    });
    return sanitized;
  }
}
