const { query } = require('../config/database');
const { success, error, asyncHandler } = require('../utils/response');
const { PLATFORMS, getService } = require('../services/platformService');

/**
 * GET /api/dashboard/:platform
 * Stats dùng live API (cùng nguồn với trang Chiến dịch), charts dùng daily_metrics
 */
const getDashboard = asyncHandler(async (req, res) => {
  const { platform } = req.params;
  const { account_id, date_from, date_to } = req.query;

  if (!PLATFORMS.includes(platform)) {
    return error(res, 'Platform không hợp lệ', 400);
  }

  const dateFrom = date_from || new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().split('T')[0];
  const dateTo = date_to || new Date().toISOString().split('T')[0];

  // Lấy accounts
  let accountSql = `SELECT id, platform, credentials, account_name, currency
                    FROM ad_accounts WHERE user_id = $1 AND platform = $2`;
  const accountParams = [req.user.id, platform];
  if (account_id) {
    accountSql += ' AND id = $3';
    accountParams.push(account_id);
  }
  const accountsResult = await query(accountSql, accountParams);

  const defaultCurrency = accountsResult.rows[0]?.currency || 'VND';

  if (accountsResult.rowCount === 0) {
    return success(res, { platform, objectives: [], charts: {}, recentRules: [], currency: defaultCurrency });
  }

  // ===== 1. Stats từ live API (giống trang Chiến dịch) =====
  const groupedByObjective = {};

  await Promise.all(accountsResult.rows.map(async (account) => {
    try {
      const service = getService(account.platform);
      const campaigns = await service.getCampaigns(account.credentials, { from: dateFrom, to: dateTo });

      campaigns.forEach(camp => {
        const obj = camp.objective || 'Khác';
        if (!groupedByObjective[obj]) {
          groupedByObjective[obj] = {
            objective: obj,
            active_campaigns: 0,
            currency: account.currency || 'VND',
            spend: 0, results: 0, impressions: 0, clicks: 0, cost_per_result: 0,
          };
        }
        const grp = groupedByObjective[obj];
        if (['ENABLED', 'ACTIVE', 'ENABLE'].includes(camp.status)) grp.active_campaigns++;

        const m = camp.metrics || {};
        grp.spend       += Number(m.spend || 0);
        grp.impressions += Number(m.impressions || 0);
        grp.clicks      += Number(m.clicks || 0);

        if (platform === 'google') {
          grp.results += Number(m.video_views || m.conversions || 0);
        } else if (platform === 'facebook') {
          if (obj === 'Mess')                  grp.results += Number(m.messages    || m.conversions || 0);
          else if (obj === 'Đơn hàng')         grp.results += Number(m.conversions || 0);
          else if (obj === 'Lượt thích trang') grp.results += Number(m.engagements || m.conversions || 0);
          else if (obj === 'Tương tác bài viết') grp.results += Number(m.engagements || 0);
          else if (obj === 'Video 2s')         grp.results += Number(m.video_views  || 0);
          else grp.results += Number(m.conversions || m.engagements || 0);
        } else if (platform === 'tiktok') {
          if (obj === 'Lượt xem')   grp.results += Number(m.video_views || 0);
          else if (obj === 'Follow') grp.results += Number(m.follows     || 0);
          else grp.results += Number(m.conversions || 0);
        }
      });
    } catch (err) {
      console.error('Dashboard live API error for account', account.id, err.message);
    }
  }));

  Object.values(groupedByObjective).forEach(grp => {
    grp.cost_per_result = grp.results > 0 ? grp.spend / grp.results : 0;
  });

  // ===== 2. Charts từ daily_metrics (xu hướng theo ngày) =====
  const baseWhere = `a.user_id = $1 AND a.platform = $2`;
  const baseParams = [req.user.id, platform];
  let chartSql = `
    SELECT
      dm.date, c.objective,
      SUM(dm.spend)       as spend,
      SUM(dm.impressions) as impressions,
      SUM(dm.clicks)      as clicks,
      SUM(dm.video_views) as video_views,
      SUM(dm.conversions) as conversions,
      SUM(dm.follows)     as follows,
      SUM(dm.messages)    as messages,
      SUM(dm.engagements) as engagements
    FROM daily_metrics dm
    JOIN campaigns c ON dm.campaign_id = c.id
    JOIN ad_accounts a ON dm.account_id = a.id
    WHERE ${baseWhere} AND dm.date BETWEEN $3 AND $4
  `;
  const chartParams = [...baseParams, dateFrom, dateTo];
  if (account_id) {
    chartSql += ` AND a.id = $5`;
    chartParams.push(account_id);
  }
  chartSql += ' GROUP BY dm.date, c.objective ORDER BY dm.date';

  const chartData = await query(chartSql, chartParams);

  const charts = {};
  chartData.rows.forEach(row => {
    const obj = row.objective || 'Khác';
    if (!charts[obj]) charts[obj] = [];

    let result = 0;
    if (platform === 'google') {
      result = Number(row.video_views || row.conversions || 0);
    } else if (platform === 'facebook') {
      if (obj === 'Mess')                    result = Number(row.messages    || 0);
      else if (obj === 'Tương tác bài viết') result = Number(row.engagements || 0);
      else result = Number(row.conversions || 0);
    } else if (platform === 'tiktok') {
      if (obj === 'Lượt xem')   result = Number(row.video_views || 0);
      else if (obj === 'Follow') result = Number(row.follows     || 0);
      else result = Number(row.conversions || 0);
    }

    charts[obj].push({
      date: row.date,
      spend: Number(row.spend || 0),
      result,
      impressions: Number(row.impressions || 0),
      clicks: Number(row.clicks || 0),
    });
  });

  // ===== 3. Lịch sử Rules gần đây =====
  let rulesHistSql = `
    SELECT rh.id, rh.target_name, rh.status, rh.message, rh.executed_at,
           r.name as rule_name, r.platform
    FROM rule_history rh
    JOIN rules r ON rh.rule_id = r.id
    WHERE r.user_id = $1 AND r.platform = $2
  `;
  const rulesHistParams = [req.user.id, platform];
  if (account_id) {
    rulesHistSql += ` AND r.account_id = $3`;
    rulesHistParams.push(account_id);
  }
  rulesHistSql += ' ORDER BY rh.executed_at DESC LIMIT 5';

  const recentRules = await query(rulesHistSql, rulesHistParams);

  return success(res, {
    platform,
    dateRange: { from: dateFrom, to: dateTo },
    currency: defaultCurrency,
    objectives: Object.values(groupedByObjective),
    charts,
    recentRules: recentRules.rows,
  });
});

/**
 * GET /api/dashboard/:platform/accounts
 */
const getAccountsForPlatform = asyncHandler(async (req, res) => {
  const { platform } = req.params;

  const result = await query(
    `SELECT id, account_name, account_id, status, group_name, currency FROM ad_accounts
     WHERE user_id = $1 AND platform = $2
     ORDER BY group_name NULLS LAST, account_name`,
    [req.user.id, platform]
  );

  return success(res, { accounts: result.rows });
});

module.exports = { getDashboard, getAccountsForPlatform };
