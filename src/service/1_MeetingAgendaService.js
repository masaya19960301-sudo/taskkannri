/**
 * MeetingAgendaService.js
 * 定例会議案のビジネスロジック
 */

class MeetingAgendaService {
  constructor() {
    this._repo = getMeetingAgendaRepository();
  }

  /**
   * アクティブな議案一覧を取得（未回答）
   * @returns {object[]}
   */
  getActiveAgendas() {
    return this._repo.findActiveAgendas();
  }

  /**
   * 全議案を取得
   * @param {object} filters
   * @returns {object[]}
   */
  getAllAgendas(filters) {
    let agendas = this._repo.findAll();

    if (filters) {
      if (filters.status) {
        agendas = agendas.filter(a => a.status === filters.status);
      }
      if (filters.keyword) {
        const kw = filters.keyword.toLowerCase();
        agendas = agendas.filter(a =>
          (a.title && String(a.title).toLowerCase().includes(kw)) ||
          (a.details && String(a.details).toLowerCase().includes(kw)) ||
          (a.answer && String(a.answer).toLowerCase().includes(kw))
        );
      }
    }

    // 新しい順にソート
    agendas.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return agendas;
  }

  /**
   * 議案を作成
   * @param {object} data
   * @param {object} currentUser
   * @returns {object}
   */
  createAgenda(data, currentUser) {
    if (!data.title || String(data.title).trim().length === 0) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'タイトルは必須です');
    }

    const now = new Date().toISOString();
    const agenda = {
      agendaId: UUIDGenerator.generate(),
      title: Validator.sanitize(data.title),
      details: data.details ? Validator.sanitize(data.details) : '',
      answer: '',
      status: AGENDA_STATUS.OPEN,
      createdAt: now,
      updatedAt: now,
      createdBy: currentUser.userId,
      updatedBy: currentUser.userId,
    };

    return LockManager.executeWithLock(() => this._repo.create(agenda));
  }

  /**
   * 議案を更新（回答入力含む）
   * @param {string} agendaId
   * @param {object} updates
   * @param {object} currentUser
   * @returns {object}
   */
  updateAgenda(agendaId, updates, currentUser) {
    const existing = this._repo.findById(agendaId);
    if (!existing) {
      throw new AppError(ERROR_CODES.NOT_FOUND, '議案が見つかりません');
    }

    const now = new Date().toISOString();
    const updated = {
      ...existing,
      title: updates.title !== undefined ? Validator.sanitize(updates.title) : existing.title,
      details: updates.details !== undefined ? Validator.sanitize(updates.details) : existing.details,
      answer: updates.answer !== undefined ? Validator.sanitize(updates.answer) : existing.answer,
      status: updates.status !== undefined ? updates.status : existing.status,
      updatedAt: now,
      updatedBy: currentUser.userId,
    };

    // 回答が入力されたら自動的に回答済にする
    if (updates.answer && String(updates.answer).trim().length > 0) {
      updated.status = AGENDA_STATUS.ANSWERED;
    }

    return LockManager.executeWithLock(() => this._repo.update(agendaId, updated));
  }

  /**
   * 議案を削除
   * @param {string} agendaId
   * @param {object} currentUser
   * @returns {boolean}
   */
  deleteAgenda(agendaId, currentUser) {
    const existing = this._repo.findById(agendaId);
    if (!existing) {
      throw new AppError(ERROR_CODES.NOT_FOUND, '議案が見つかりません');
    }

    return LockManager.executeWithLock(() => this._repo.delete(agendaId));
  }
}

const meetingAgendaService_ = new MeetingAgendaService();

function getMeetingAgendaService() {
  return meetingAgendaService_;
}
