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

  // Lấy danh sách accounts để gọi API trực tiếp
  let accountSql = 'SELECT id, platform, credentials, account_name, currency FROM ad_accounts WHERE user_id = $1 AND platform = $2';
  const accountParams = [req.user.id, platform];
  if (account_id) {
    accountSql += ' AND id = $3';
    accountParams.push(account_id);
  }
  const accountsResult = await query(accountSql, accountParams);

  if (accountsResult.rowCount === 0) {
    return success(res, { campaigns: [], summary: { total: 0, active: 0, totalSpend: 0, totalBudget: 0, totalResults: 0, avgCostPerResult: 0 } });
  }

  let allCampaigns = [];
  const dateRange = (date_from && date_to) ? { from: date_from, to: date_to } : {};

  for (const account of accountsResult.rows) {
    try {
      const service = getService(account.platform);
      const campaigns = await service.getCampaigns(account.credentials, dateRange);

      // Lấy DB id cho mỗi campaign
      const dbCamps = await query(
        'SELECT id, external_id FROM campaigns WHERE account_id = $1',
        [account.id]
      );
      const extToDbId = {};
      dbCamps.rows.forEach(c => { extToDbId[c.external_id] = c.id; });

      for (const camp of campaigns) {
        const dbId = extToDbId[camp.external_id];
        allCampaigns.push({
          id: dbId || camp.external_id,
          external_id: camp.external_id,
          name: camp.name,
          status: camp.status,
          objective: camp.objective,
          budget: camp.budget,
          budget_type: camp.budget_type,
          metrics: camp.metrics || {},
          account_id: account.id,
          account_name: account.account_name,
          platform: account.platform,
          currency: account.currency,
        });
      }
    } catch (err) {
      console.error('API fetch error for account', account.id, err.message);
    }
  }

  // Filter theo status, objective, search
  if (status) {
    allCampaigns = allCampaigns.filter(c => c.status === status);
  }
  if (objective) {
    allCampaigns = allCampaigns.filter(c => c.objective === objective);
  }
  if (search) {
    const s = search.toLowerCase();
    allCampaigns = allCampaigns.filter(c => c.name.toLowerCase().includes(s));
  }

// Tính summary
  const activeCount = allCampaigns.filter(r => ['ENABLED', 'ACTIVE', 'ENABLE'].includes(r.status)).length;
  let totalSpend = 0, totalResults = 0, totalBudget = 0;
  allCampaigns.forEach(r => {
    const m = r.metrics || {};
    totalSpend += Number(m.spend || 0);
    totalBudget += Number(r.budget || 0);
    totalResults += Number(m.video_views || m.conversions || m.engagements || m.messages || 0);
  });

  return success(res, {
    campaigns: allCampaigns,
    summary: {
      total: allCampaigns.length,
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
 * Lấy nhóm quảng cáo của 1 chiến dịch.
 * Hỗ trợ 2 cách:
 * - DB mode: id là integer DB id → JOIN campaigns + ad_accounts
 * - Direct mode: id là external_id, kèm query params external_id + account_id
 */
const listAdGroups = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { external_id, account_id, date_from, date_to } = req.query;

  let campaignExternalId, credentials, platform, campaignName;

  // Thử tìm trong DB trước (chỉ khi id là integer hợp lệ trong range PostgreSQL)
  const numId = Number(id);
  const isDbId = Number.isInteger(numId) && numId > 0 && numId <= 2147483647;

  if (isDbId) {
    const campResult = await query(
      `SELECT c.external_id, c.name, a.platform, a.credentials, a.account_name
       FROM campaigns c
       JOIN ad_accounts a ON c.account_id = a.id
       WHERE c.id = $1 AND a.user_id = $2`,
      [id, req.user.id]
    );

    if (campResult.rowCount > 0) {
      const row = campResult.rows[0];
      campaignExternalId = row.external_id;
      credentials = row.credentials;
      platform = row.platform;
      campaignName = row.name;
    }
  }

  if (!campaignExternalId) {
    // Fallback: campaign chưa sync vào DB → dùng external_id + account_id từ query
    const resolvedExternalId = external_id || id;
    if (!account_id) {
      return error(res, 'Không tìm thấy chiến dịch. Hãy đồng bộ dữ liệu trước.', 404);
    }

    const accResult = await query(
      'SELECT platform, credentials, account_name FROM ad_accounts WHERE id = $1 AND user_id = $2',
      [account_id, req.user.id]
    );

    if (accResult.rowCount === 0) {
      return error(res, 'Không tìm thấy tài khoản', 404);
    }

    campaignExternalId = resolvedExternalId;
    credentials = accResult.rows[0].credentials;
    platform = accResult.rows[0].platform;
    campaignName = accResult.rows[0].account_name;
  }

  const service = getService(platform);
  const adGroups = await service.getAdGroups(credentials, campaignExternalId, {
    from: date_from,
    to: date_to,
  });

  return success(res, { adGroups, campaign: { id, name: campaignName } });
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

/**
 * GET /api/campaigns/targets
 * Lấy danh sách chiến dịch/nhóm/quảng cáo từ DB để chọn target cho rule
 */
const listTargets = asyncHandler(async (req, res) => {
  const { platform, account_id, scope } = req.query;

  if (!platform || !PLATFORMS.includes(platform)) {
    return error(res, 'Platform không hợp lệ', 400);
  }

  let sql, params;
  const baseParams = [req.user.id, platform];

  if (scope === 'ad_group') {
    sql = `
      SELECT ag.id, ag.name, ag.status, ag.external_id,
             c.name as parent_name
      FROM ad_groups ag
      JOIN campaigns c ON ag.campaign_id = c.id
      JOIN ad_accounts a ON ag.account_id = a.id
      WHERE a.user_id = $1 AND a.platform = $2
    `;
    params = [...baseParams];
    if (account_id) { sql += ` AND a.id = $3`; params.push(account_id); }
    sql += ` ORDER BY CASE WHEN ag.status IN ('ENABLED','ACTIVE','ENABLE') THEN 0 ELSE 1 END, c.name, ag.name LIMIT 500`;
  } else if (scope === 'ad') {
    sql = `
      SELECT ads.id, ads.name, ads.status, ads.external_id,
             c.name as parent_name
      FROM ads
      JOIN campaigns c ON ads.campaign_id = c.id
      JOIN ad_accounts a ON ads.account_id = a.id
      WHERE a.user_id = $1 AND a.platform = $2
    `;
    params = [...baseParams];
    if (account_id) { sql += ` AND a.id = $3`; params.push(account_id); }
    sql += ` ORDER BY CASE WHEN ads.status IN ('ENABLED','ACTIVE','ENABLE') THEN 0 ELSE 1 END, c.name, ads.name LIMIT 500`;
  } else {
    sql = `
      SELECT c.id, c.name, c.status, c.external_id,
             a.account_name as parent_name
      FROM campaigns c
      JOIN ad_accounts a ON c.account_id = a.id
      WHERE a.user_id = $1 AND a.platform = $2
    `;
    params = [...baseParams];
    if (account_id) { sql += ` AND a.id = $3`; params.push(account_id); }
    sql += ` ORDER BY CASE WHEN c.status IN ('ENABLED','ACTIVE','ENABLE') THEN 0 ELSE 1 END, a.account_name, c.name LIMIT 1000`;
  }

  const result = await query(sql, params);
  return success(res, { targets: result.rows });
});

/**
 * POST /api/campaigns/ad-groups/:externalId/toggle
 * Bật/tắt nhóm quảng cáo
 */
const toggleAdGroup = asyncHandler(async (req, res) => {
  const { externalId } = req.params;
  const { enable, account_id } = req.body;

  const accountResult = await query(
    'SELECT id, platform, credentials, account_name FROM ad_accounts WHERE id = $1 AND user_id = $2',
    [account_id, req.user.id]
  );

  if (accountResult.rowCount === 0) {
    return error(res, 'Không tìm thấy tài khoản', 404);
  }

  const account = accountResult.rows[0];
  const service = getService(account.platform);

  await service.toggleObjectStatus(account.credentials, externalId, 'ad_group', enable);

  await logEvent({
    userId: req.user.id,
    accountId: account_id,
    eventType: EVENT_TYPES.CAMPAIGN_TOGGLE,
    level: 'success',
    message: `${enable ? 'Bật' : 'Tắt'} nhóm quảng cáo: ${externalId}`,
    details: { external_id: externalId, scope: 'ad_group', enable },
    ipAddress: req.ip,
  });

  return success(res, { enable }, `${enable ? 'Đã bật' : 'Đã tắt'} nhóm quảng cáo`);
});

/**
 * POST /api/campaigns/ads/:externalId/toggle
 * Bật/tắt quảng cáo
 */
const toggleAd = asyncHandler(async (req, res) => {
  const { externalId } = req.params;
  const { enable, account_id } = req.body;

  const accountResult = await query(
    'SELECT id, platform, credentials, account_name FROM ad_accounts WHERE id = $1 AND user_id = $2',
    [account_id, req.user.id]
  );

  if (accountResult.rowCount === 0) {
    return error(res, 'Không tìm thấy tài khoản', 404);
  }

  const account = accountResult.rows[0];
  const service = getService(account.platform);

  await service.toggleObjectStatus(account.credentials, externalId, 'ad', enable);

  await logEvent({
    userId: req.user.id,
    accountId: account_id,
    eventType: EVENT_TYPES.CAMPAIGN_TOGGLE,
    level: 'success',
    message: `${enable ? 'Bật' : 'Tắt'} quảng cáo: ${externalId}`,
    details: { external_id: externalId, scope: 'ad', enable },
    ipAddress: req.ip,
  });

  return success(res, { enable }, `${enable ? 'Đã bật' : 'Đã tắt'} quảng cáo`);
});

module.exports = {
  listCampaigns,
  listAdGroups,
  listAds,
  toggleCampaign,
  toggleAdGroup,
  toggleAd,
  syncCampaigns,
  listTargets,
};
