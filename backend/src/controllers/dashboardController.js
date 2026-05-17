const { query } = require('../config/database');
const { success, error, asyncHandler } = require('../utils/response');
const { PLATFORMS } = require('../services/platformService');

/**
 * GET /api/dashboard/:platform
 * Lấy dữ liệu tổng quan cho 1 nền tảng
 */
const getDashboard = asyncHandler(async (req, res) => {
  const { platform } = req.params;
  const { account_id, date_from, date_to } = req.query;

  if (!PLATFORMS.includes(platform)) {
    return error(res, 'Platform không hợp lệ', 400);
  }

  // Date range mặc định: 30 ngày qua
  const dateFrom = date_from || new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().split('T')[0];
  const dateTo = date_to || new Date().toISOString().split('T')[0];

  const baseWhere = `a.user_id = $1 AND a.platform = $2`;
  const baseParams = [req.user.id, platform];
  const accountFilter = account_id ? ` AND a.id = $3` : '';
  const allParams = account_id ? [...baseParams, account_id] : baseParams;

  // ===== 1. Lấy trạng thái chiến dịch hiện tại (không lọc theo ngày) =====
  const campSql = `
    SELECT c.objective, c.status, a.currency
    FROM campaigns c
    JOIN ad_accounts a ON c.account_id = a.id
    WHERE ${baseWhere}${accountFilter}
  `;
  const campaigns = await query(campSql, allParams);

  // Nhóm theo objective: active_campaigns, currency
  const groupedByObjective = {};
  campaigns.rows.forEach(c => {
    const obj = c.objective || 'Khác';
    if (!groupedByObjective[obj]) {
      groupedByObjective[obj] = {
        objective: obj,
        active_campaigns: 0,
        total_campaigns: 0,
        currency: c.currency || 'VND',
        spend: 0, results: 0, impressions: 0, clicks: 0, cost_per_result: 0,
      };
    }
    groupedByObjective[obj].total_campaigns++;
    if (['ENABLED', 'ACTIVE', 'ENABLE'].includes(c.status)) {
      groupedByObjective[obj].active_campaigns++;
    }
    // Lấy currency của account đầu tiên tìm được
    if (c.currency && groupedByObjective[obj].currency === 'VND') {
      groupedByObjective[obj].currency = c.currency;
    }
  });

  // ===== 2. Lấy metrics từ daily_metrics theo date range =====
  const p = account_id ? 5 : 4; // index param tiếp theo
  const metricsSql = `
    SELECT
      c.objective,
      SUM(dm.spend)       AS spend,
      SUM(dm.impressions) AS impressions,
      SUM(dm.clicks)      AS clicks,
      SUM(dm.video_views) AS video_views,
      SUM(dm.conversions) AS conversions,
      SUM(dm.follows)     AS follows,
      SUM(dm.messages)    AS messages,
      SUM(dm.engagements) AS engagements
    FROM daily_metrics dm
    JOIN campaigns c ON dm.campaign_id = c.id
    JOIN ad_accounts a ON dm.account_id = a.id
    WHERE ${baseWhere}${accountFilter}
      AND dm.date BETWEEN $${account_id ? 4 : 3} AND $${account_id ? 5 : 4}
    GROUP BY c.objective
  `;
  const metricsParams = [...allParams, dateFrom, dateTo];
  const metricsData = await query(metricsSql, metricsParams);

  // Merge metrics vào objective
  metricsData.rows.forEach(row => {
    const obj = row.objective || 'Khác';
    if (!groupedByObjective[obj]) {
      groupedByObjective[obj] = {
        objective: obj, active_campaigns: 0, total_campaigns: 0,
        currency: 'VND', spend: 0, results: 0, impressions: 0, clicks: 0, cost_per_result: 0,
      };
    }
    const grp = groupedByObjective[obj];
    grp.spend       = Number(row.spend || 0);
    grp.impressions = Number(row.impressions || 0);
    grp.clicks      = Number(row.clicks || 0);

    // Results tùy objective + platform
    if (platform === 'google') {
      grp.results = Number(row.video_views || row.conversions || 0);
    } else if (platform === 'facebook') {
      if (obj === 'Mess')                 grp.results = Number(row.messages   || row.conversions || 0);
      else if (obj === 'Đơn hàng')        grp.results = Number(row.conversions || 0);
      else if (obj === 'Lượt thích trang') grp.results = Number(row.engagements || row.conversions || 0);
      else if (obj === 'Tương tác bài viết') grp.results = Number(row.engagements || 0);
      else if (obj === 'Video 2s')        grp.results = Number(row.video_views || 0);
      else grp.results = Number(row.conversions || row.engagements || 0);
    } else if (platform === 'tiktok') {
      if (obj === 'Lượt xem')  grp.results = Number(row.video_views || 0);
      else if (obj === 'Follow') grp.results = Number(row.follows || 0);
      else grp.results = Number(row.conversions || 0);
    }

    grp.cost_per_result = grp.results > 0 ? grp.spend / grp.results : 0;
  });

  // ===== 2. Lấy daily metrics cho biểu đồ =====
  let chartSql = `
    SELECT
      dm.date,
      c.objective,
      SUM(dm.spend) as spend,
      SUM(dm.impressions) as impressions,
      SUM(dm.clicks) as clicks,
      SUM(dm.video_views) as video_views,
      SUM(dm.conversions) as conversions,
      SUM(dm.follows) as follows,
      SUM(dm.messages) as messages,
      SUM(dm.engagements) as engagements
    FROM daily_metrics dm
    JOIN campaigns c ON dm.campaign_id = c.id
    JOIN ad_accounts a ON dm.account_id = a.id
    WHERE a.user_id = $1 AND a.platform = $2
      AND dm.date BETWEEN $3 AND $4
  `;
  const chartParams = [req.user.id, platform, dateFrom, dateTo];
  if (account_id) {
    chartSql += ` AND a.id = $5`;
    chartParams.push(account_id);
  }
  chartSql += ' GROUP BY dm.date, c.objective ORDER BY dm.date';

  const chartData = await query(chartSql, chartParams);

  // Tổ chức data biểu đồ theo objective
  const charts = {};
  chartData.rows.forEach(row => {
    const obj = row.objective || 'Khác';
    if (!charts[obj]) charts[obj] = [];

    let result = 0;
    if (platform === 'google') {
      result = Number(row.video_views || row.conversions || 0);
    } else if (platform === 'facebook') {
      if (obj === 'Mess') result = Number(row.messages || 0);
      else if (obj === 'Tương tác bài viết') result = Number(row.engagements || 0);
      else result = Number(row.conversions || 0);
    } else if (platform === 'tiktok') {
      if (obj === 'Lượt xem') result = Number(row.video_views || 0);
      else if (obj === 'Follow') result = Number(row.follows || 0);
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

  // Lấy currency mặc định từ accounts
  const currencyRow = await query(
    `SELECT currency FROM ad_accounts WHERE user_id = $1 AND platform = $2${account_id ? ' AND id = $3' : ''} LIMIT 1`,
    allParams
  );
  const defaultCurrency = currencyRow.rows[0]?.currency || 'VND';

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
 * Lấy danh sách tài khoản cho dropdown filter
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
