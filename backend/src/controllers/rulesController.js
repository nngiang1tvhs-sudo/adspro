const { query } = require('../config/database');
const { success, error, asyncHandler } = require('../utils/response');
const { logEvent, EVENT_TYPES } = require('../utils/audit');
const { executeRule } = require('../services/rulesEngine');
const { PLATFORMS } = require('../services/platformService');

/**
 * GET /api/rules
 */
const listRules = asyncHandler(async (req, res) => {
  const { platform, account_id } = req.query;

  let sql = `
    SELECT r.*, a.account_name
    FROM rules r
    LEFT JOIN ad_accounts a ON r.account_id = a.id
    WHERE r.user_id = $1
  `;
  const params = [req.user.id];
  let idx = 2;

  if (platform && PLATFORMS.includes(platform)) {
    sql += ` AND r.platform = $${idx++}`;
    params.push(platform);
  }
  if (account_id) {
    sql += ` AND r.account_id = $${idx++}`;
    params.push(account_id);
  }

  sql += ` ORDER BY r.is_active DESC, r.created_at DESC`;

  const result = await query(sql, params);

  return success(res, {
    rules: result.rows,
    summary: {
      total: result.rowCount,
      active: result.rows.filter(r => r.is_active).length,
    },
  });
});

/**
 * GET /api/rules/:id
 */
const getRule = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await query(
    `SELECT r.*, a.account_name FROM rules r
     LEFT JOIN ad_accounts a ON r.account_id = a.id
     WHERE r.id = $1 AND r.user_id = $2`,
    [id, req.user.id]
  );

  if (result.rowCount === 0) {
    return error(res, 'Không tìm thấy rule', 404);
  }

  return success(res, { rule: result.rows[0] });
});

/**
 * POST /api/rules
 */
const createRule = asyncHandler(async (req, res) => {
  const {
    platform, account_id, name, description, scope,
    conditions, conditions_logic, actions,
    cooldown_minutes, is_active, email_notify,
    target_mode, target_ids,
  } = req.body;

  // Validate
  if (!platform || !PLATFORMS.includes(platform)) {
    return error(res, 'Vui lòng chọn nền tảng', 400);
  }
  if (!name) return error(res, 'Vui lòng nhập tên rule', 400);
  if (!scope || !['campaign', 'ad_group', 'ad'].includes(scope)) {
    return error(res, 'Phạm vi không hợp lệ', 400);
  }
  if (!Array.isArray(conditions) || conditions.length === 0) {
    return error(res, 'Vui lòng thêm ít nhất 1 điều kiện', 400);
  }
  if (!Array.isArray(actions) || actions.length === 0) {
    return error(res, 'Vui lòng thêm ít nhất 1 hành động', 400);
  }

  // Validate account thuộc user
  if (account_id) {
    const accCheck = await query(
      'SELECT id FROM ad_accounts WHERE id = $1 AND user_id = $2 AND platform = $3',
      [account_id, req.user.id, platform]
    );
    if (accCheck.rowCount === 0) {
      return error(res, 'Tài khoản không hợp lệ', 400);
    }
  }

  const result = await query(
    `INSERT INTO rules
     (user_id, platform, account_id, name, description, scope, conditions, conditions_logic, actions, cooldown_minutes, is_active, email_notify, target_mode, target_ids)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING *`,
    [
      req.user.id, platform, account_id || null, name, description || null,
      scope, JSON.stringify(conditions), conditions_logic || 'AND',
      JSON.stringify(actions), cooldown_minutes || 60,
      is_active !== false, email_notify !== false,
      target_mode || 'all', JSON.stringify(target_ids || []),
    ]
  );

  await logEvent({
    userId: req.user.id,
    eventType: EVENT_TYPES.RULE_CREATED,
    level: 'info',
    message: `Tạo rule: ${name}`,
    details: { rule_id: result.rows[0].id },
    ipAddress: req.ip,
  });

  return success(res, { rule: result.rows[0] }, 'Tạo rule thành công', 201);
});

/**
 * PUT /api/rules/:id
 */
const updateRule = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existing = await query(
    'SELECT * FROM rules WHERE id = $1 AND user_id = $2',
    [id, req.user.id]
  );

  if (existing.rowCount === 0) {
    return error(res, 'Không tìm thấy rule', 404);
  }

  const updates = [];
  const params = [];
  let idx = 1;

  const fields = ['name', 'description', 'scope', 'conditions_logic', 'cooldown_minutes', 'is_active', 'email_notify', 'account_id', 'target_mode'];
  for (const field of fields) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = $${idx++}`);
      params.push(req.body[field]);
    }
  }

  if (req.body.conditions !== undefined) {
    updates.push(`conditions = $${idx++}`);
    params.push(JSON.stringify(req.body.conditions));
  }
  if (req.body.actions !== undefined) {
    updates.push(`actions = $${idx++}`);
    params.push(JSON.stringify(req.body.actions));
  }
  if (req.body.target_ids !== undefined) {
    updates.push(`target_ids = $${idx++}`);
    params.push(JSON.stringify(req.body.target_ids));
  }

  if (updates.length === 0) {
    return error(res, 'Không có gì để cập nhật', 400);
  }

  params.push(id);
  await query(`UPDATE rules SET ${updates.join(', ')} WHERE id = $${idx}`, params);

  await logEvent({
    userId: req.user.id,
    eventType: EVENT_TYPES.RULE_UPDATED,
    level: 'info',
    message: `Cập nhật rule: ${existing.rows[0].name}`,
    details: { rule_id: id },
    ipAddress: req.ip,
  });

  return success(res, null, 'Cập nhật rule thành công');
});

/**
 * DELETE /api/rules/:id
 */
const deleteRule = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existing = await query(
    'SELECT name FROM rules WHERE id = $1 AND user_id = $2',
    [id, req.user.id]
  );

  if (existing.rowCount === 0) {
    return error(res, 'Không tìm thấy rule', 404);
  }

  await query('DELETE FROM rules WHERE id = $1', [id]);

  await logEvent({
    userId: req.user.id,
    eventType: EVENT_TYPES.RULE_DELETED,
    level: 'warning',
    message: `Xóa rule: ${existing.rows[0].name}`,
    ipAddress: req.ip,
  });

  return success(res, null, 'Đã xóa rule');
});

/**
 * POST /api/rules/:id/run
 * Chạy rule ngay
 */
const runRule = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await query(
    'SELECT * FROM rules WHERE id = $1 AND user_id = $2',
    [id, req.user.id]
  );

  if (result.rowCount === 0) {
    return error(res, 'Không tìm thấy rule', 404);
  }

  // Chạy thủ công: bypass cooldown để luôn đánh giá điều kiện thực tế
  const execResult = await executeRule(result.rows[0], { bypassCooldown: true });

  await logEvent({
    userId: req.user.id,
    eventType: EVENT_TYPES.RULE_EXEC,
    level: execResult.success ? 'success' : 'error',
    message: `Chạy rule thủ công: ${result.rows[0].name}`,
    details: execResult,
    ipAddress: req.ip,
  });

  return success(res, execResult, 'Đã chạy rule');
});

/**
 * POST /api/rules/:id/toggle
 */
const toggleRule = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { is_active } = req.body;

  const result = await query(
    'UPDATE rules SET is_active = $1 WHERE id = $2 AND user_id = $3 RETURNING name, is_active',
    [is_active, id, req.user.id]
  );

  if (result.rowCount === 0) {
    return error(res, 'Không tìm thấy rule', 404);
  }

  return success(res, { rule: result.rows[0] }, `Rule đã ${is_active ? 'bật' : 'tắt'}`);
});

module.exports = {
  listRules,
  getRule,
  createRule,
  updateRule,
  deleteRule,
  runRule,
  toggleRule,
};
