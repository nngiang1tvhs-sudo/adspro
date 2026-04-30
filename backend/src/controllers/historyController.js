const { query } = require('../config/database');
const { success, asyncHandler } = require('../utils/response');

/**
 * GET /api/history/audit
 */
const getAuditLogs = asyncHandler(async (req, res) => {
  const { account_id, event_type, level, limit = 100, offset = 0 } = req.query;

  let sql = `
    SELECT al.*, a.account_name, a.platform
    FROM audit_logs al
    LEFT JOIN ad_accounts a ON al.account_id = a.id
    WHERE al.user_id = $1
  `;
  const params = [req.user.id];
  let idx = 2;

  if (account_id) {
    sql += ` AND al.account_id = $${idx++}`;
    params.push(account_id);
  }
  if (event_type) {
    sql += ` AND al.event_type = $${idx++}`;
    params.push(event_type);
  }
  if (level) {
    sql += ` AND al.level = $${idx++}`;
    params.push(level);
  }

  sql += ` ORDER BY al.created_at DESC LIMIT $${idx++} OFFSET $${idx}`;
  params.push(limit, offset);

  const result = await query(sql, params);

  return success(res, { logs: result.rows });
});

/**
 * GET /api/history/rules
 */
const getRuleHistory = asyncHandler(async (req, res) => {
  const { rule_id, account_id, status, limit = 100 } = req.query;

  let sql = `
    SELECT rh.*, r.name as rule_name, r.platform, a.account_name
    FROM rule_history rh
    JOIN rules r ON rh.rule_id = r.id
    LEFT JOIN ad_accounts a ON rh.account_id = a.id
    WHERE r.user_id = $1
  `;
  const params = [req.user.id];
  let idx = 2;

  if (rule_id) {
    sql += ` AND rh.rule_id = $${idx++}`;
    params.push(rule_id);
  }
  if (account_id) {
    sql += ` AND rh.account_id = $${idx++}`;
    params.push(account_id);
  }
  if (status) {
    sql += ` AND rh.status = $${idx++}`;
    params.push(status);
  }

  sql += ` ORDER BY rh.executed_at DESC LIMIT $${idx}`;
  params.push(limit);

  const result = await query(sql, params);
  return success(res, { history: result.rows });
});

/**
 * GET /api/history/sync
 */
const getSyncHistory = asyncHandler(async (req, res) => {
  const { account_id, status, limit = 100 } = req.query;

  let sql = `
    SELECT sl.*, a.account_name, a.platform
    FROM sync_logs sl
    JOIN ad_accounts a ON sl.account_id = a.id
    WHERE a.user_id = $1
  `;
  const params = [req.user.id];
  let idx = 2;

  if (account_id) {
    sql += ` AND sl.account_id = $${idx++}`;
    params.push(account_id);
  }
  if (status) {
    sql += ` AND sl.status = $${idx++}`;
    params.push(status);
  }

  sql += ` ORDER BY sl.started_at DESC LIMIT $${idx}`;
  params.push(limit);

  const result = await query(sql, params);
  return success(res, { logs: result.rows });
});

module.exports = { getAuditLogs, getRuleHistory, getSyncHistory };
