const { query } = require('../config/database');
const { success, error, asyncHandler } = require('../utils/response');
const { getService, PLATFORMS } = require('../services/platformService');
const { syncAccount } = require('../services/syncService');
const { logEvent, EVENT_TYPES } = require('../utils/audit');

/**
 * GET /api/campaigns
 * Lấy danh sách chiến dịch theo platform + filter
 */
const listCampaigns = asyncHandler(async (req, res) => {
  const { platform, account_id, status, objective, search, date_from, date_to } = req.query;

  if (!platform || !PLATFORMS.includes(platform)) {
    return error(res, 'Vui lòng chọn nền tảng', 400);
  }

  let sql = `
    SELECT
      c.id, c.external_id, c.name, c.status, c.objective, c.budget, c.budget_type,
      c.metrics, c.start_date, c.end_date, c.updated_at,
      c.account_id, a.account_name, a.platform, a.currency
    FROM campaigns c
    JOIN ad_accounts a ON c.account_id = a.id
    WHERE a.user_id = $1 AND a.platform = $2
  `;
  const params = [req.user.id, platform];
  let idx = 3;

  if (account_id) {
    sql += ` AND a.id = $${idx++}`;
    params.push(account_id);
  }
  if (status) {
    sql += ` AND c.status = $${idx++}`;
    params.push(status);
  }
  if (objective) {
    sql += ` AND c.objective = $${idx++}`;
    params.push(objective);
  }
  if (search) {
    sql += ` AND c.name ILIKE $${idx++}`;
    params.push(`%${search}%`);
  }

  sql += ' ORDER BY c.updated_at DESC';

  const result = await query(sql, params);

  // Tính summary
  const activeCount = result.rows.filter(r => ['ENABLED', 'ACTIVE', 'ENABLE'].includes(r.status)).length;
  let totalSpend = 0, totalResults = 0, totalBudget = 0;
  result.rows.forEach(r => {
    const m = r.metrics || {};
    totalSpend += Number(m.spend || 0);
    totalBudget += Number(r.budget || 0);
    totalResults += Number(m.video_views || m.conversions || m.engagements || m.messages || 0);
  });

  return success(res, {
    campaigns: result.rows,
    summary: {
      total: result.rowCount,
      active: activeCount,
      totalSpend,
      totalBudget,
      totalResults,
      avgCostPerResult: totalResults > 0 ? totalSpend / totalResults : 0,
    },
  });
});

/**
 * GET /api/campaigns/:id/ad-groups
 * Lấy nhóm quảng cáo của 1 chiến dịch
 */
const listAdGroups = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Lấy thông tin campaign + account
  const campResult = await query(
    `SELECT c.*, a.platform, a.credentials, a.account_name
     FROM campaigns c
     JOIN ad_accounts a ON c.account_id = a.id
     WHERE c.id = $1 AND a.user_id = $2`,
    [id, req.user.id]
  );

  if (campResult.rowCount === 0) {
    return error(res, 'Không tìm thấy chiến dịch', 404);
  }

  const campaign = campResult.rows[0];
  const service = getService(campaign.platform);

  // Lấy data trực tiếp từ API (real-time)
  const adGroups = await service.getAdGroups(campaign.credentials, campaign.external_id, {
    from: req.query.date_from,
    to: req.query.date_to,
  });

  return success(res, { adGroups, campaign: { id: campaign.id, name: campaign.name } });
});

/**
 * GET /api/campaigns/ad-groups/:adGroupId/ads
 * Lấy quảng cáo của 1 nhóm
 */
const listAds = asyncHandler(async (req, res) => {
  const { adGroupId } = req.params;
  const { campaign_id, account_id } = req.query;

  if (!campaign_id || !account_id) {
    return error(res, 'Thiếu tham số campaign_id, account_id', 400);
  }

  const accountResult = await query(
    'SELECT platform, credentials, account_name FROM ad_accounts WHERE id = $1 AND user_id = $2',
    [account_id, req.user.id]
  );

  if (accountResult.rowCount === 0) {
    return error(res, 'Không tìm thấy tài khoản', 404);
  }

  const account = accountResult.rows[0];
  const service = getService(account.platform);

  const ads = await service.getAds(account.credentials, adGroupId, {
    from: req.query.date_from,
    to: req.query.date_to,
  });

  return success(res, { ads });
});

/**
 * POST /api/campaigns/:id/toggle
 * Bật/tắt chiến dịch
 */
const toggleCampaign = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { enable } = req.body;

  const campResult = await query(
    `SELECT c.*, a.platform, a.credentials, a.account_name
     FROM campaigns c
     JOIN ad_accounts a ON c.account_id = a.id
     WHERE c.id = $1 AND a.user_id = $2`,
    [id, req.user.id]
  );

  if (campResult.rowCount === 0) {
    return error(res, 'Không tìm thấy chiến dịch', 404);
  }

  const campaign = campResult.rows[0];
  const service = getService(campaign.platform);

  const result = await service.toggleCampaignStatus(campaign.credentials, campaign.external_id, enable);

  // Cập nhật DB
  await query(
    'UPDATE campaigns SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
    [result.status, id]
  );

  await logEvent({
    userId: req.user.id,
    accountId: campaign.account_id,
    eventType: EVENT_TYPES.CAMPAIGN_TOGGLE,
    level: 'success',
    message: `${enable ? 'Bật' : 'Tắt'} chiến dịch: ${campaign.name}`,
    details: { campaign_id: id, new_status: result.status },
    ipAddress: req.ip,
  });

  return success(res, result, `${enable ? 'Đã bật' : 'Đã tắt'} chiến dịch`);
});

/**
 * POST /api/campaigns/sync
 * Đồng bộ data từ platform
 */
const syncCampaigns = asyncHandler(async (req, res) => {
  const { account_id } = req.body;

  if (account_id) {
    // Sync 1 account
    const accountCheck = await query(
      'SELECT id FROM ad_accounts WHERE id = $1 AND user_id = $2',
      [account_id, req.user.id]
    );
    if (accountCheck.rowCount === 0) {
      return error(res, 'Không tìm thấy tài khoản', 404);
    }
    const result = await syncAccount(account_id);
    return success(res, result, 'Đã đồng bộ tài khoản');
  }

  // Sync tất cả accounts của user
  const accounts = await query(
    `SELECT id FROM ad_accounts WHERE user_id = $1 AND status = 'active'`,
    [req.user.id]
  );

  const results = [];
  for (const acc of accounts.rows) {
    try {
      const r = await syncAccount(acc.id);
      results.push({ accountId: acc.id, ...r });
    } catch (err) {
      results.push({ accountId: acc.id, success: false, error: err.message });
    }
  }

  return success(res, { results }, `Đã đồng bộ ${results.length} tài khoản`);
});

module.exports = {
  listCampaigns,
  listAdGroups,
  listAds,
  toggleCampaign,
  syncCampaigns,
};
