const { query } = require('../config/database');
const { success, error, asyncHandler } = require('../utils/response');
const { sendTestEmail, sendDailyReport } = require('../services/emailService');

/**
 * GET /api/settings
 */
const getSettings = asyncHandler(async (req, res) => {
  const result = await query(
    'SELECT * FROM user_settings WHERE user_id = $1',
    [req.user.id]
  );

  if (result.rowCount === 0) {
    // Tạo mới nếu chưa có
    const created = await query(
      'INSERT INTO user_settings (user_id) VALUES ($1) RETURNING *',
      [req.user.id]
    );
    return success(res, { settings: created.rows[0] });
  }

  return success(res, { settings: result.rows[0] });
});

/**
 * PUT /api/settings
 */
const updateSettings = asyncHandler(async (req, res) => {
  const allowedFields = [
    'email_primary', 'email_secondary',
    'daily_report_enabled', 'daily_report_time',
    'weekly_report_enabled', 'rule_notification_enabled',
    'token_expiry_alert_enabled', 'sync_error_alert_enabled',
    'timezone', 'email_template',
  ];

  const updates = [];
  const params = [];
  let idx = 1;

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = $${idx++}`);
      params.push(req.body[field]);
    }
  }

  if (updates.length === 0) {
    return error(res, 'Không có gì để cập nhật', 400);
  }

  // UPSERT
  await query(
    `INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
    [req.user.id]
  );

  params.push(req.user.id);
  await query(`UPDATE user_settings SET ${updates.join(', ')} WHERE user_id = $${idx}`, params);

  return success(res, null, 'Đã lưu cài đặt');
});

/**
 * POST /api/settings/test-email
 */
const testEmailSetting = asyncHandler(async (req, res) => {
  const { to } = req.body;

  if (!to) {
    return error(res, 'Vui lòng nhập email', 400);
  }

  const result = await sendTestEmail(req.user.id, to);

  if (!result.success) {
    return error(res, result.message || 'Gửi email thất bại', 500);
  }

  return success(res, result, 'Đã gửi email test');
});

/**
 * POST /api/settings/send-report
 */
const sendReportNow = asyncHandler(async (req, res) => {
  const result = await sendDailyReport(req.user.id);
  if (!result.success) {
    return error(res, result.message || 'Gửi báo cáo thất bại', 500);
  }
  return success(res, result, 'Đã gửi báo cáo thành công');
});

/**
 * GET /api/settings/column-presets
 */
const getColumnPresets = asyncHandler(async (req, res) => {
  const { platform } = req.query;

  let sql = 'SELECT * FROM column_presets WHERE user_id = $1';
  const params = [req.user.id];

  if (platform) {
    sql += ' AND platform = $2';
    params.push(platform);
  }

  sql += ' ORDER BY is_default DESC, preset_name';
  const result = await query(sql, params);

  return success(res, { presets: result.rows });
});

/**
 * POST /api/settings/column-presets
 */
const createColumnPreset = asyncHandler(async (req, res) => {
  const { platform, preset_name, columns, is_default } = req.body;

  if (!preset_name || !columns) {
    return error(res, 'Thiếu thông tin', 400);
  }

  // Bỏ default cũ nếu set default mới
  if (is_default) {
    await query(
      'UPDATE column_presets SET is_default = FALSE WHERE user_id = $1 AND platform = $2',
      [req.user.id, platform]
    );
  }

  const result = await query(
    `INSERT INTO column_presets (user_id, platform, preset_name, columns, is_default)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [req.user.id, platform || null, preset_name, JSON.stringify(columns), is_default || false]
  );

  return success(res, { preset: result.rows[0] }, 'Đã tạo nhóm cột', 201);
});

/**
 * PUT /api/settings/column-presets/:id
 */
const updateColumnPreset = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { preset_name, columns, is_default } = req.body;

  const updates = [];
  const params = [];
  let idx = 1;

  if (preset_name !== undefined) { updates.push(`preset_name = $${idx++}`); params.push(preset_name); }
  if (columns !== undefined) { updates.push(`columns = $${idx++}`); params.push(JSON.stringify(columns)); }
  if (is_default !== undefined) { updates.push(`is_default = $${idx++}`); params.push(is_default); }

  if (updates.length === 0) return error(res, 'Không có gì để cập nhật', 400);

  params.push(id, req.user.id);
  const result = await query(
    `UPDATE column_presets SET ${updates.join(', ')}
     WHERE id = $${idx++} AND user_id = $${idx} RETURNING *`,
    params
  );

  if (result.rowCount === 0) return error(res, 'Không tìm thấy', 404);

  return success(res, { preset: result.rows[0] }, 'Đã cập nhật');
});

/**
 * DELETE /api/settings/column-presets/:id
 */
const deleteColumnPreset = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await query(
    'DELETE FROM column_presets WHERE id = $1 AND user_id = $2',
    [id, req.user.id]
  );
  if (result.rowCount === 0) return error(res, 'Không tìm thấy', 404);
  return success(res, null, 'Đã xóa');
});

module.exports = {
  getSettings,
  updateSettings,
  testEmailSetting,
  sendReportNow,
  getColumnPresets,
  createColumnPreset,
  updateColumnPreset,
  deleteColumnPreset,
};
