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

  // ===== 1. Lấy chiến dịch + tổng hợp =====
  let campSql = `
    SELECT c.id, c.external_id, c.name, c.status, c.objective, c.budget, c.metrics
    FROM campaigns c
    JOIN ad_accounts a ON c.account_id = a.id
    WHERE a.user_id = $1 AND a.platform = $2
  `;
  const campParams = [req.user.id, platform];
  if (account_id) {
    campSql += ` AND a.id = $3`;
    campParams.push(account_id);
  }
  const campaigns = await query(campSql, campParams);

  // Phân loại theo objective
  const groupedByObjective = {};
  campaigns.rows.forEach(c => {
    const obj = c.objective || 'Khác';
    if (!groupedByObjective[obj]) {
      groupedByObjective[obj] = {
        objective: obj,
        campaigns: [],
        active_campaigns: 0,
        spend: 0,
        impressions: 0,
        clicks: 0,
        results: 0,
      };
    }
    const grp = groupedByObjective[obj];
    grp.campaigns.push(c);

    // Là active nếu status thuộc các giá trị bật
    if (['ENABLED', 'ACTIVE', 'ENABLE'].includes(c.status)) {
      grp.active_campaigns++;
    }

    const m = c.metrics || {};
    grp.spend += Number(m.spend || 0);
    grp.impressions += Number(m.impressions || 0);
    grp.clicks += Number(m.clicks || 0);

    // Result tùy objective
    if (platform === 'google') {
      grp.results += Number(m.video_views || m.conversions || 0);
    } else if (platform === 'facebook') {
      if (obj === 'Mess') grp.results += Number(m.messages || m.conversions || 0);
      else if (obj === 'Đơn hàng') grp.results += Number(m.purchases || m.conversions || 0);
      else if (obj === 'Lượt thích trang') grp.results += Number(m.page_likes || 0);
      else if (obj === 'Tương tác bài viết') grp.results += Number(m.post_engagements || 0);
      else if (obj === 'Video 2s') grp.results += Number(m.video_2s_views || 0);
      else grp.results += Number(m.conversions || m.engagements || 0);
    } else if (platform === 'tiktok') {
      if (obj === 'Lượt xem') grp.results += Number(m.video_views || 0);
      else if (obj === 'Follow') grp.results += Number(m.follows || 0);
      else if (obj === 'Đơn hàng') grp.results += Number(m.conversions || m.result || 0);
      else grp.results += Number(m.result || m.conversions || 0);
    }
  });

  // Tính cost per result
  Object.values(groupedByObjective).forEach(grp => {
    grp.cost_per_result = grp.results > 0 ? grp.spend / grp.results : 0;
    grp.total_campaigns = grp.campaigns.length;
    delete grp.campaigns;
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

  return success(res, {
    platform,
    dateRange: { from: dateFrom, to: dateTo },
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
    `SELECT id, account_name, account_id, status, group_name FROM ad_accounts
     WHERE user_id = $1 AND platform = $2
     ORDER BY group_name NULLS LAST, account_name`,
    [req.user.id, platform]
  );

  return success(res, { accounts: result.rows });
});

module.exports = { getDashboard, getAccountsForPlatform };
