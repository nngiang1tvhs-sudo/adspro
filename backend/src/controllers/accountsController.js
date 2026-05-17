const facebookAdsService = require('../services/facebookAdsService');
const { query, transaction } = require('../config/database');
const { success, error, asyncHandler } = require('../utils/response');
const { encryptCredentials, decryptCredentials } = require('../utils/encryption');
const { logEvent, EVENT_TYPES } = require('../utils/audit');
const { getService, PLATFORMS } = require('../services/platformService');

const listAccounts = asyncHandler(async (req, res) => {
  const { platform } = req.query;

  let sql = `
    SELECT id, uuid, platform, account_name, account_id, currency, group_name, status, status_message,
           last_sync_at, token_expires_at, created_at, updated_at
    FROM ad_accounts
    WHERE user_id = $1
  `;
  const params = [req.user.id];

  if (platform && PLATFORMS.includes(platform)) {
    sql += ' AND platform = $2';
    params.push(platform);
  }

  sql += ' ORDER BY platform, group_name NULLS LAST, account_name';

  const result = await query(sql, params);
  return success(res, { accounts: result.rows });
});

const testConnection = asyncHandler(async (req, res) => {
  const { platform, credentials } = req.body;

  if (!platform || !PLATFORMS.includes(platform)) {
    return error(res, 'Platform không hợp lệ', 400);
  }
  if (!credentials || typeof credentials !== 'object') {
    return error(res, 'Thiếu thông tin credentials', 400);
  }

  const facebookRequired = credentials.bm_id
    ? ['access_token', 'bm_id']
    : ['access_token', 'ad_account_id'];
  const requiredFields = {
    google: ['developer_token', 'client_id', 'client_secret', 'refresh_token', 'customer_id'],
    facebook: facebookRequired,
    tiktok: ['app_id', 'app_secret', 'access_token', 'advertiser_id'],
  };

  const missing = requiredFields[platform].filter(f => !credentials[f]);
  if (missing.length > 0) {
    return error(res, `Thiếu các trường: ${missing.join(', ')}`, 400);
  }

  const service = getService(platform);
  const encrypted = encryptCredentials(credentials);
  const result = await service.testConnection(encrypted);

  await logEvent({
    userId: req.user.id,
    eventType: EVENT_TYPES.ACCOUNT_TEST,
    level: result.success ? 'success' : 'error',
    message: `Test kết nối ${platform}: ${result.message}`,
    details: { platform, success: result.success },
    ipAddress: req.ip,
  });

  return success(res, result);
});

const createAccount = asyncHandler(async (req, res) => {
  const { platform, account_name, credentials, account_id, refresh_token, group_name } = req.body;

  if (!platform || !PLATFORMS.includes(platform)) {
    return error(res, 'Platform không hợp lệ', 400);
  }
  if (!credentials || typeof credentials !== 'object') {
    return error(res, 'Thiếu thông tin credentials', 400);
  }

  // BM mode: tự động tìm và thêm tất cả tài khoản ads
  if (platform === 'facebook' && credentials.bm_id && !credentials.ad_account_id) {
    const bmEncrypted = encryptCredentials(credentials);
    const testResult = await facebookAdsService.testConnection(bmEncrypted);
    if (!testResult.success) return error(res, `Kết nối thất bại: ${testResult.message}`, 400);

    const accounts = await facebookAdsService.getAccessibleAdAccounts(bmEncrypted);
    if (accounts.length === 0) {
      return error(res, 'Không tìm thấy tài khoản ads nào trong BM.', 400);
    }

    const created = [], skipped = [];
    for (const acc of accounts) {
      const dup = await query(
        'SELECT id FROM ad_accounts WHERE platform=$1 AND account_id=$2 AND user_id=$3',
        ['facebook', acc.id, req.user.id]
      );
      if (dup.rowCount > 0) { skipped.push(acc.name); continue; }

      const perAccountEncrypted = encryptCredentials({ ...credentials, ad_account_id: acc.id });
      const r = await query(
        `INSERT INTO ad_accounts (user_id,platform,account_name,account_id,credentials,status,currency,group_name)
         VALUES ($1,$2,$3,$4,$5,'active',$6,$7)
         RETURNING id,uuid,platform,account_name,account_id,status,currency,group_name,created_at`,
        [req.user.id, 'facebook', acc.name, acc.id, JSON.stringify(perAccountEncrypted), acc.currency || null, group_name || null]
      );
      created.push(r.rows[0]);
    }
    return success(res, { accounts: created, skipped: skipped.length }, `Đã thêm ${created.length} tài khoản Facebook`, 201);
  }

  if (!account_name) {
    return error(res, 'Vui lòng nhập tên tài khoản', 400);
  }

  let extractedAccountId = account_id;
  if (!extractedAccountId) {
    if (platform === 'google') extractedAccountId = String(credentials.customer_id || '').replace(/-/g, '');
    if (platform === 'facebook') extractedAccountId = credentials.ad_account_id;
    if (platform === 'tiktok') extractedAccountId = credentials.advertiser_id;
  }

  if (!extractedAccountId) {
    return error(res, 'Không thể xác định ID tài khoản', 400);
  }

  const service = getService(platform);
  const encrypted = encryptCredentials(credentials);
  const testResult = await service.testConnection(encrypted);

  if (!testResult.success) {
    return error(res, `Kết nối thất bại: ${testResult.message}`, 400);
  }

  const currency = testResult.data?.currency || null;

  const existing = await query(
    'SELECT id FROM ad_accounts WHERE platform = $1 AND account_id = $2',
    [platform, extractedAccountId]
  );

  if (existing.rowCount > 0) {
    return error(res, 'Tài khoản này đã được kết nối trước đó', 409);
  }

  const tokenExpiresAt = platform === 'tiktok'
    ? new Date(Date.now() + 86400 * 1000)
    : null;

  const result = await query(
    `INSERT INTO ad_accounts
     (user_id, platform, account_name, account_id, credentials, status, currency, group_name, last_sync_at, token_expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, $9)
     RETURNING id, uuid, platform, account_name, account_id, status, currency, group_name, created_at`,
    [req.user.id, platform, account_name, extractedAccountId, JSON.stringify(encrypted), 'active', currency, group_name || null, tokenExpiresAt]
  );

  await logEvent({
    userId: req.user.id,
    accountId: result.rows[0].id,
    eventType: EVENT_TYPES.ACCOUNT_CONNECTED,
    level: 'success',
    message: `Đã kết nối tài khoản: ${account_name} (${platform})`,
    details: { platform, account_id: extractedAccountId },
    ipAddress: req.ip,
  });

  return success(res, { account: result.rows[0] }, 'Kết nối tài khoản thành công', 201);
});

const updateAccount = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { account_name, credentials, group_name } = req.body;

  const existing = await query(
    'SELECT * FROM ad_accounts WHERE id = $1 AND user_id = $2',
    [id, req.user.id]
  );

  if (existing.rowCount === 0) {
    return error(res, 'Không tìm thấy tài khoản', 404);
  }

  const account = existing.rows[0];
  const updates = [];
  const params = [];
  let idx = 1;

  if (account_name) {
    updates.push(`account_name = $${idx++}`);
    params.push(account_name);
  }

  if (group_name !== undefined) {
    updates.push(`group_name = $${idx++}`);
    params.push(group_name || null);
  }

  if (credentials && typeof credentials === 'object') {
    const service = getService(account.platform);
    const encrypted = encryptCredentials(credentials);
    const testResult = await service.testConnection(encrypted);

    if (!testResult.success) {
      return error(res, `Kết nối thất bại: ${testResult.message}`, 400);
    }

    updates.push(`credentials = $${idx++}`);
    params.push(JSON.stringify(encrypted));
    updates.push(`status = 'active'`);
    updates.push(`status_message = NULL`);
  }

  if (updates.length === 0) {
    return error(res, 'Không có gì để cập nhật', 400);
  }

  params.push(id);
  await query(`UPDATE ad_accounts SET ${updates.join(', ')} WHERE id = $${idx}`, params);

  await logEvent({
    userId: req.user.id,
    accountId: parseInt(id),
    eventType: EVENT_TYPES.ACCOUNT_UPDATED,
    level: 'info',
    message: `Cập nhật tài khoản: ${account.account_name}`,
    ipAddress: req.ip,
  });

  return success(res, null, 'Cập nhật thành công');
});

const deleteAccount = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existing = await query(
    'SELECT account_name FROM ad_accounts WHERE id = $1 AND user_id = $2',
    [id, req.user.id]
  );

  if (existing.rowCount === 0) {
    return error(res, 'Không tìm thấy tài khoản', 404);
  }

  await query('DELETE FROM ad_accounts WHERE id = $1', [id]);

  await logEvent({
    userId: req.user.id,
    eventType: EVENT_TYPES.ACCOUNT_DELETED,
    level: 'warning',
    message: `Đã xóa tài khoản: ${existing.rows[0].account_name}`,
    ipAddress: req.ip,
  });

  return success(res, null, 'Đã xóa tài khoản');
});

const testExistingAccount = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await query(
    'SELECT id, platform, account_name, credentials FROM ad_accounts WHERE id = $1 AND user_id = $2',
    [id, req.user.id]
  );

  if (result.rowCount === 0) {
    return error(res, 'Không tìm thấy tài khoản', 404);
  }

  const account = result.rows[0];
  const service = getService(account.platform);
  const testResult = await service.testConnection(account.credentials);

  await query(
    `UPDATE ad_accounts SET status = $1, status_message = $2,
     currency = COALESCE($3, currency) WHERE id = $4`,
    [testResult.success ? 'active' : 'error', testResult.message, testResult.data?.currency || null, id]
  );

  await logEvent({
    userId: req.user.id,
    accountId: parseInt(id),
    eventType: EVENT_TYPES.ACCOUNT_TEST,
    level: testResult.success ? 'success' : 'error',
    message: `Test kết nối ${account.account_name}: ${testResult.message}`,
    ipAddress: req.ip,
  });

  return success(res, testResult);
});

module.exports = {
  listAccounts,
  testConnection,
  createAccount,
  updateAccount,
  deleteAccount,
  testExistingAccount,
};
