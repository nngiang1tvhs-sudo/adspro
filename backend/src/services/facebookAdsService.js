const axios = require('axios');
const logger = require('../utils/logger');
const { decryptCredentials } = require('../utils/encryption');

const API_VERSION = 'v19.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

const apiCall = async (endpoint, accessToken, params = {}) => {
  try {
    const response = await axios.get(`${BASE_URL}${endpoint}`, {
      params: { access_token: accessToken, ...params },
      timeout: 30000,
    });
    return response.data;
  } catch (err) {
    if (err.response?.data?.error) {
      const fbError = err.response.data.error;
      throw new Error(`Facebook API: ${fbError.message} (code: ${fbError.code})`);
    }
    throw err;
  }
};

const getAccessibleAdAccounts = async (credentials) => {
  const decrypted = decryptCredentials(credentials);
  const token = decrypted.access_token;
  const bmId = decrypted.bm_id;
  const accountMap = new Map();

  const fetchAll = async (endpoint, params = {}) => {
    const data = await apiCall(endpoint, token, { ...params, limit: 200 });
    for (const item of data.data || []) accountMap.set(item.id, item);
  };

  if (bmId) {
    try { await fetchAll(`/${bmId}/owned_ad_accounts`, { fields: 'id,name,account_status,currency,timezone_name' }); } catch (e) { logger.warn('getOwnedAdAccounts failed:', e.message); }
    try { await fetchAll(`/${bmId}/client_ad_accounts`, { fields: 'id,name,account_status,currency,timezone_name' }); } catch (e) { logger.warn('getClientAdAccounts failed:', e.message); }
  }
  try { await fetchAll('/me/adaccounts', { fields: 'id,name,account_status,currency,timezone_name' }); } catch (e) { logger.warn('/me/adaccounts failed:', e.message); }

  return Array.from(accountMap.values());
};

const testConnection = async (credentials) => {
  try {
    const decrypted = decryptCredentials(credentials);

    if (!decrypted.ad_account_id) {
      const me = await apiCall('/me', decrypted.access_token, { fields: 'id,name' });
      const accounts = await getAccessibleAdAccounts(credentials);
      return {
        success: true,
        message: `Kết nối thành công — tìm thấy ${accounts.length} tài khoản ads`,
        data: {
          userId: me.id,
          name: me.name,
          accountsFound: accounts.length,
          accounts: accounts.map(a => ({ id: a.id, name: a.name, status: a.account_status, currency: a.currency })),
        },
      };
    }

    const adAccountId = decrypted.ad_account_id.startsWith('act_')
      ? decrypted.ad_account_id
      : `act_${decrypted.ad_account_id}`;

    const data = await apiCall(`/${adAccountId}`, decrypted.access_token, {
      fields: 'id,name,account_status,currency,timezone_name,balance',
    });

    return {
      success: true,
      message: 'Kết nối Facebook Ads thành công',
      data: {
        accountId: data.id,
        name: data.name,
        status: data.account_status,
        currency: data.currency,
        timezone: data.timezone_name,
      },
    };
  } catch (err) {
    logger.error('Facebook test failed:', err.message);
    return { success: false, message: err.message || 'Không thể kết nối Facebook Ads' };
  }
};

const fmtD = (d) => d.toISOString().split('T')[0];

const buildInsightsTimeParam = (dateRange) => {
  if (dateRange.from === 'ALL_TIME') return 'date_preset(maximum)';
  const today = new Date();
  const last30 = new Date(today);
  last30.setDate(today.getDate() - 30);
  const since = (dateRange.from && dateRange.from !== 'ALL_TIME') ? dateRange.from : fmtD(last30);
  const until = (dateRange.to && dateRange.to !== 'ALL_TIME') ? dateRange.to : fmtD(today);
  return `time_range(${JSON.stringify({ since, until })})`;
};

const getCampaigns = async (credentials, dateRange = {}) => {
  try {
    const decrypted = decryptCredentials(credentials);
    const adAccountId = decrypted.ad_account_id.startsWith('act_')
      ? decrypted.ad_account_id
      : `act_${decrypted.ad_account_id}`;

    const insightsTimeParam = buildInsightsTimeParam(dateRange);

    const data = await apiCall(`/${adAccountId}/campaigns`, decrypted.access_token, {
      fields: [
        'id', 'name', 'status', 'effective_status', 'objective', 'buying_type',
        'daily_budget', 'lifetime_budget', 'budget_remaining', 'bid_strategy',
        'created_time', 'updated_time', 'start_time', 'stop_time',
        `insights.${insightsTimeParam}{spend,impressions,reach,frequency,clicks,ctr,cpc,cpm,conversions,cost_per_conversion,actions,action_values,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions,inline_link_clicks,cost_per_inline_link_click,quality_ranking,engagement_rate_ranking,conversion_rate_ranking,purchase_roas,website_purchase_roas,mobile_app_purchase_roas}`,
      ].join(','),
      limit: 200,
    });

    return (data.data || []).map(camp => {
      const insights = camp.insights?.data?.[0] || {};
      const actions = parseActions(insights.actions || []);
      const fbResult = computeFbResult(camp.objective, actions, insights);
      return {
        external_id: camp.id,
        name: camp.name,
        status: camp.status,
        effective_status: camp.effective_status,
        objective: mapFacebookObjective(camp.objective),
        original_objective: camp.objective,
        buying_type: camp.buying_type,
        budget: Number(camp.daily_budget || camp.lifetime_budget || 0) / 100,
        budget_type: camp.daily_budget ? 'daily' : 'lifetime',
        budget_remaining: Number(camp.budget_remaining || 0) / 100,
        bid_strategy: camp.bid_strategy,
        start_date: camp.start_time,
        end_date: camp.stop_time,
        metrics: {
          spend: Number(insights.spend || 0),
          impressions: Number(insights.impressions || 0),
          reach: Number(insights.reach || 0),
          frequency: Number(insights.frequency || 0),
          clicks: Number(insights.clicks || 0),
          ctr: Number(insights.ctr || 0),
          cpc: Number(insights.cpc || 0),
          cpm: Number(insights.cpm || 0),
          conversions: fbResult.result,
          cpa: fbResult.cost_per_result,
          inline_link_clicks: Number(insights.inline_link_clicks || 0),
          cost_per_inline_link_click: Number(insights.cost_per_inline_link_click || 0),
          messages: actions.onsite_conversion_messaging_first_reply || actions.messaging_conversation_started_7d || 0,
          page_likes: actions.like || actions.page_engagement || 0,
          post_engagements: actions.post_engagement || 0,
          video_2s_views: actions.video_view || 0,
          purchases: actions['offsite_conversion.fb_pixel_purchase'] || actions.purchase || 0,
          roas: getROAS(insights),
          quality_ranking: insights.quality_ranking,
          engagement_ranking: insights.engagement_rate_ranking,
          conversion_ranking: insights.conversion_rate_ranking,
        },
        raw_data: camp,
      };
    });
  } catch (err) {
    logger.error('Facebook getCampaigns error:', err.message);
    throw new Error(`Lỗi lấy chiến dịch Facebook: ${err.message}`);
  }
};

const parseActions = (actions) => {
  const map = {};
  for (const action of actions) map[action.action_type] = Number(action.value);
  return map;
};

// Tính kết quả theo optimization_goal (adset) hoặc objective (campaign) của Facebook
// Dùng exact match theo giá trị thực Facebook API trả về
const computeFbResult = (optimizationGoalOrObjective, actions, insights) => {
  const spend = Number(insights.spend || 0);
  let result = 0;

  switch (optimizationGoalOrObjective) {
    // --- Adset optimization_goal ---
    case 'LINK_CLICKS':
    case 'LANDING_PAGE_VIEWS':
      result = Number(insights.inline_link_clicks || actions.link_click || 0);
      return { result, cost_per_result: Number(insights.cost_per_inline_link_click || 0) || (result > 0 ? spend / result : 0) };

    case 'OFFSITE_CONVERSIONS':
    case 'CONVERSIONS':
      result = Number(insights.conversions || 0);
      return { result, cost_per_result: Number(insights.cost_per_conversion || 0) };

    case 'QUALITY_LEAD':
    case 'LEAD_GENERATION':
      result = actions['leadgen.other'] || actions.lead || Number(insights.conversions || 0);
      return { result, cost_per_result: result > 0 ? spend / result : 0 };

    case 'REPLIES':
    case 'CONVERSATIONS':
      result = actions['onsite_conversion.messaging_first_reply'] || 0;
      return { result, cost_per_result: result > 0 ? spend / result : 0 };

    case 'POST_ENGAGEMENT':
      result = actions.post_engagement || 0;
      return { result, cost_per_result: result > 0 ? spend / result : 0 };

    case 'THRUPLAY':
      result = actions.video_thruplay_watched || 0;
      return { result, cost_per_result: result > 0 ? spend / result : 0 };

    case 'VIDEO_VIEWS':
      result = actions.video_view || 0;
      return { result, cost_per_result: result > 0 ? spend / result : 0 };

    case 'PAGE_LIKES':
      result = actions.like || 0;
      return { result, cost_per_result: result > 0 ? spend / result : 0 };

    case 'APP_INSTALLS':
      result = actions.mobile_app_install || 0;
      return { result, cost_per_result: result > 0 ? spend / result : 0 };

    case 'REACH':
      result = Number(insights.reach || 0);
      return { result, cost_per_result: result > 0 ? spend / result : 0 };

    // --- Campaign objective (broad, dùng khi không có optimization_goal) ---
    case 'OUTCOME_TRAFFIC':
      result = Number(insights.inline_link_clicks || 0);
      return { result, cost_per_result: Number(insights.cost_per_inline_link_click || 0) };

    case 'OUTCOME_SALES':
      result = Number(insights.conversions || 0);
      return { result, cost_per_result: Number(insights.cost_per_conversion || 0) };

    case 'OUTCOME_LEADS':
      result = actions['leadgen.other'] || actions.lead || Number(insights.conversions || 0);
      return { result, cost_per_result: result > 0 ? spend / result : 0 };

    case 'OUTCOME_ENGAGEMENT':
      result = actions.post_engagement || 0;
      return { result, cost_per_result: result > 0 ? spend / result : 0 };

    case 'OUTCOME_AWARENESS':
      result = Number(insights.reach || 0);
      return { result, cost_per_result: result > 0 ? spend / result : 0 };

    case 'OUTCOME_APP_PROMOTION':
      result = actions.mobile_app_install || 0;
      return { result, cost_per_result: result > 0 ? spend / result : 0 };

    // Legacy objectives
    case 'MESSAGES':
      result = actions['onsite_conversion.messaging_first_reply'] || 0;
      return { result, cost_per_result: result > 0 ? spend / result : 0 };

    case 'PAGE_ENGAGEMENT':
      result = actions.post_engagement || 0;
      return { result, cost_per_result: result > 0 ? spend / result : 0 };

    default:
      result = Number(insights.conversions || 0);
      return { result, cost_per_result: Number(insights.cost_per_conversion || 0) };
  }
};

const getROAS = (insights) => {
  if (insights.purchase_roas?.[0]?.value) return Number(insights.purchase_roas[0].value);
  if (insights.website_purchase_roas?.[0]?.value) return Number(insights.website_purchase_roas[0].value);
  if (insights.mobile_app_purchase_roas?.[0]?.value) return Number(insights.mobile_app_purchase_roas[0].value);
  return 0;
};

const mapFacebookObjective = (objective) => {
  const map = {
    'OUTCOME_AWARENESS': 'Nhận thức',
    'OUTCOME_TRAFFIC': 'Lưu lượng',
    'OUTCOME_ENGAGEMENT': 'Tương tác bài viết',
    'OUTCOME_LEADS': 'Đơn hàng',
    'OUTCOME_APP_PROMOTION': 'Quảng bá ứng dụng',
    'OUTCOME_SALES': 'Đơn hàng',
    'MESSAGES': 'Mess',
    'POST_ENGAGEMENT': 'Tương tác bài viết',
    'PAGE_LIKES': 'Lượt thích trang',
    'VIDEO_VIEWS': 'Video 2s',
    'CONVERSIONS': 'Đơn hàng',
    'LINK_CLICKS': 'Lưu lượng',
    'REACH': 'Tiếp cận',
    'BRAND_AWARENESS': 'Nhận thức',
    'LEAD_GENERATION': 'Đơn hàng',
  };
  return map[objective] || objective || 'Khác';
};

const getAdSets = async (credentials, campaignExternalId, dateRange = {}) => {
  try {
    const decrypted = decryptCredentials(credentials);

    const insightsTimeParam = buildInsightsTimeParam(dateRange);

    const data = await apiCall(`/${campaignExternalId}/adsets`, decrypted.access_token, {
      fields: [
        'id', 'name', 'status', 'effective_status', 'campaign_id',
        'daily_budget', 'lifetime_budget', 'bid_amount', 'bid_strategy',
        'optimization_goal', 'targeting',
        `insights.${insightsTimeParam}{spend,impressions,reach,clicks,ctr,cpc,cpm,conversions,cost_per_conversion,inline_link_clicks,cost_per_inline_link_click,actions}`,
      ].join(','),
      limit: 200,
    });

    return (data.data || []).map(adset => {
      const insights = adset.insights?.data?.[0] || {};
      const actions = parseActions(insights.actions || []);
      const fbResult = computeFbResult(adset.optimization_goal, actions, insights);
      return {
        external_id: adset.id,
        campaign_external_id: adset.campaign_id,
        name: adset.name,
        status: adset.status,
        effective_status: adset.effective_status,
        budget: Number(adset.daily_budget || adset.lifetime_budget || 0) / 100,
        bid_amount: Number(adset.bid_amount || 0) / 100,
        bid_strategy: adset.bid_strategy,
        optimization_goal: adset.optimization_goal,
        metrics: {
          spend: Number(insights.spend || 0),
          impressions: Number(insights.impressions || 0),
          clicks: Number(insights.clicks || 0),
          ctr: Number(insights.ctr || 0),
          cpc: Number(insights.cpc || 0),
          cpm: Number(insights.cpm || 0),
          conversions: fbResult.result,
          cpa: fbResult.cost_per_result,
        },
        raw_data: adset,
      };
    });
  } catch (err) {
    logger.error('Facebook getAdSets error:', err.message);
    throw new Error(`Lỗi lấy nhóm quảng cáo: ${err.message}`);
  }
};

const getAds = async (credentials, adsetExternalId, dateRange = {}) => {
  try {
    const decrypted = decryptCredentials(credentials);

    const insightsTimeParam = buildInsightsTimeParam(dateRange);

    const data = await apiCall(`/${adsetExternalId}/ads`, decrypted.access_token, {
      fields: [
        'id', 'name', 'status', 'effective_status',
        'creative{thumbnail_url,video_id,image_url,title,body,call_to_action_type}',
        `insights.${insightsTimeParam}{spend,impressions,clicks,ctr,cpc,conversions,cost_per_conversion,actions,inline_link_clicks,cost_per_inline_link_click}`,
      ].join(','),
      limit: 200,
    });

    return (data.data || []).map(ad => {
      const insights = ad.insights?.data?.[0] || {};
      const actions = parseActions(insights.actions || []);
      return {
        external_id: ad.id,
        name: ad.name,
        status: ad.status,
        effective_status: ad.effective_status,
        ad_type: ad.creative?.video_id ? 'VIDEO' : 'IMAGE',
        headline: ad.creative?.title,
        description: ad.creative?.body,
        image_url: ad.creative?.thumbnail_url || ad.creative?.image_url,
        video_url: ad.creative?.video_id ? `https://facebook.com/${ad.creative.video_id}` : null,
        metrics: {
          spend: Number(insights.spend || 0),
          impressions: Number(insights.impressions || 0),
          clicks: Number(insights.clicks || 0),
          ctr: Number(insights.ctr || 0),
          cpc: Number(insights.cpc || 0),
          conversions: Number(insights.conversions || insights.inline_link_clicks || 0),
          cpa: Number(insights.cost_per_conversion || insights.cost_per_inline_link_click || 0),
        },
        raw_data: ad,
      };
    });
  } catch (err) {
    logger.error('Facebook getAds error:', err.message);
    throw new Error(`Lỗi lấy quảng cáo: ${err.message}`);
  }
};

const toggleCampaignStatus = async (credentials, campaignExternalId, enable) => {
  try {
    const decrypted = decryptCredentials(credentials);
    const newStatus = enable ? 'ACTIVE' : 'PAUSED';

    const response = await axios.post(`${BASE_URL}/${campaignExternalId}`, null, {
      params: { access_token: decrypted.access_token, status: newStatus },
      timeout: 30000,
    });

    return { success: true, status: newStatus, data: response.data };
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    logger.error('Facebook toggleCampaign error:', msg);
    throw new Error(`Không thể ${enable ? 'bật' : 'tắt'} chiến dịch Facebook: ${msg}`);
  }
};

const getDailyMetrics = async (credentials, dateRange = {}) => {
  try {
    const decrypted = decryptCredentials(credentials);
    const adAccountId = decrypted.ad_account_id.startsWith('act_')
      ? decrypted.ad_account_id
      : `act_${decrypted.ad_account_id}`;

    const today = new Date(); const last30 = new Date(today); last30.setDate(today.getDate() - 30); const fmtD = (d) => d.toISOString().split('T')[0]; let timeRange = JSON.stringify({ since: fmtD(last30), until: fmtD(today) });
    if (dateRange.from && dateRange.to) {
      timeRange = JSON.stringify({ since: dateRange.from, until: dateRange.to });
    }

    const data = await apiCall(`/${adAccountId}/insights`, decrypted.access_token, {
      time_range: timeRange,
      time_increment: '1',
      level: 'campaign',
      fields: 'campaign_id,date_start,spend,impressions,clicks,conversions,actions',
      limit: 500,
    });

    return (data.data || []).map(row => {
      const actions = parseActions(row.actions || []);
      return {
        date: row.date_start,
        campaign_external_id: row.campaign_id,
        spend: Number(row.spend || 0),
        impressions: Number(row.impressions || 0),
        clicks: Number(row.clicks || 0),
        conversions: Number(row.conversions || 0),
        messages: actions.onsite_conversion_messaging_first_reply || 0,
        engagements: actions.post_engagement || 0,
      };
    });
  } catch (err) {
    logger.error('Facebook getDailyMetrics error:', err.message);
    throw new Error(`Lỗi lấy số liệu hằng ngày: ${err.message}`);
  }
};

/**
 * Lấy metrics LIVE từ API cho ngày hôm nay (giờ Việt Nam UTC+7)
 */
const getLiveMetrics = async (credentials, scope = 'campaign') => {
  if (scope !== 'campaign') return {};
  try {
    const vnToday = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().split('T')[0];
    const campaigns = await getCampaigns(credentials, { from: vnToday, to: vnToday });
    const map = {};
    for (const c of campaigns) map[c.external_id] = c.metrics;
    return map;
  } catch (err) {
    logger.error('Facebook getLiveMetrics error:', err.message);
    return {};
  }
};

module.exports = {
  testConnection,
  getAccessibleAdAccounts,
  getCampaigns,
  getAdSets,
  getAdGroups: getAdSets,
  getAds,
  toggleCampaignStatus,
  getDailyMetrics,
  getLiveMetrics,
  mapFacebookObjective,
};
