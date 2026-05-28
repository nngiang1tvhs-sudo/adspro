const axios = require('axios');
const logger = require('../utils/logger');
const { decryptCredentials, encryptCredentials } = require('../utils/encryption');
const { query } = require('../config/database');

/**
 * TikTok Marketing API Service
 *
 * Yêu cầu credentials:
 * - app_id: TikTok App ID
 * - app_secret: App Secret
 * - access_token: Access token (24h)
 * - refresh_token: Refresh token (1 năm)
 * - advertiser_id: ID tài khoản quảng cáo
 */

const BASE_URL = 'https://business-api.tiktok.com/open_api/v1.3';

const apiCall = async (endpoint, accessToken, params = {}, method = 'GET') => {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: {
        'Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    };

    if (method === 'GET') {
      config.params = params;
    } else {
      config.data = params;
    }

    const response = await axios(config);

    if (response.data.code !== 0) {
      throw new Error(`TikTok API: ${response.data.message} (code: ${response.data.code})`);
    }

    return response.data.data;
  } catch (err) {
    if (err.response?.data) {
      throw new Error(`TikTok API: ${err.response.data.message || err.message}`);
    }
    throw err;
  }
};

/**
 * Refresh access token
 */
const refreshAccessToken = async (accountId, credentials) => {
  try {
    const decrypted = decryptCredentials(credentials);

    const response = await axios.post(`${BASE_URL}/oauth2/refresh_token/`, {
      app_id: decrypted.app_id,
      secret: decrypted.app_secret,
      refresh_token: decrypted.refresh_token,
      grant_type: 'refresh_token',
    }, { timeout: 30000 });

    if (response.data.code !== 0) {
      throw new Error(response.data.message);
    }

    const newCreds = {
      ...decrypted,
      access_token: response.data.data.access_token,
      refresh_token: response.data.data.refresh_token,
    };

    const encrypted = encryptCredentials(newCreds);
    const expiresAt = new Date(Date.now() + (response.data.data.access_token_expire_in || 86400) * 1000);

    await query(
      'UPDATE ad_accounts SET credentials = $1, token_expires_at = $2, status = $3 WHERE id = $4',
      [JSON.stringify(encrypted), expiresAt, 'active', accountId]
    );

    return { success: true, access_token: newCreds.access_token, credentials: encrypted };
  } catch (err) {
    logger.error('TikTok refresh token error:', err.message);
    return { success: false, message: err.message };
  }
};

/**
 * Test kết nối
 */
const testConnection = async (credentials) => {
  try {
    const decrypted = decryptCredentials(credentials);

    const data = await apiCall('/advertiser/info/', decrypted.access_token, {
      advertiser_ids: JSON.stringify([decrypted.advertiser_id]),
    });

    if (!data.list || data.list.length === 0) {
      return { success: false, message: 'Không tìm thấy thông tin advertiser' };
    }

    const advertiser = data.list[0];
    return {
      success: true,
      message: 'Kết nối TikTok Ads thành công',
      data: {
        advertiserId: advertiser.advertiser_id,
        name: advertiser.name,
        status: advertiser.status,
        currency: advertiser.currency,
        timezone: advertiser.timezone,
      },
    };
  } catch (err) {
    logger.error('TikTok test failed:', err.message);
    return { success: false, message: err.message || 'Không thể kết nối TikTok Ads' };
  }
};

/**
 * Lấy chiến dịch + insight gộp
 */
const getCampaigns = async (credentials, dateRange = {}) => {
  try {
    const decrypted = decryptCredentials(credentials);

    // Bước 1: Lấy danh sách campaigns
    const campaignsData = await apiCall('/campaign/get/', decrypted.access_token, {
      advertiser_id: decrypted.advertiser_id,
      page_size: 200,
      fields: JSON.stringify([
        'campaign_id', 'campaign_name', 'campaign_type', 'objective_type',
        'operation_status', 'budget', 'budget_mode',
        'create_time', 'modify_time', 'roas_bid'
      ]),
    });

    const campaigns = campaignsData.list || [];
    if (campaigns.length === 0) return [];

    // Bước 2: Lấy insights cho tất cả campaigns
    const today = new Date();
    const TIKTOK_EPOCH = '2018-01-01';
    const startDate = dateRange.from === 'ALL_TIME' ? TIKTOK_EPOCH : (dateRange.from || new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    const endDate = dateRange.to === 'ALL_TIME' ? today.toISOString().split('T')[0] : (dateRange.to || today.toISOString().split('T')[0]);

    const campaignIds = campaigns.map(c => c.campaign_id);
    const insightsData = await apiCall('/report/integrated/get/', decrypted.access_token, {
      advertiser_id: decrypted.advertiser_id,
      report_type: 'BASIC',
      data_level: 'AUCTION_CAMPAIGN',
      dimensions: JSON.stringify(['campaign_id']),
      metrics: JSON.stringify([
        'spend', 'impressions', 'clicks', 'ctr', 'cpc', 'cpm', 'reach', 'frequency',
        'conversion', 'conversion_rate', 'cost_per_conversion',
        'video_play_actions', 'video_views_p25', 'video_views_p50', 'video_views_p75', 'video_views_p100',
        'profile_visits', 'follows', 'likes', 'comments', 'shares',
        'result', 'cost_per_result', 'result_rate',
      ]),
      start_date: startDate,
      end_date: endDate,
      page_size: 200,
      filters: JSON.stringify([{
        field_name: 'campaign_ids',
        filter_type: 'IN',
        filter_value: JSON.stringify(campaignIds),
      }]),
    });

    // Map insights vào campaigns
    const insightsMap = {};
    (insightsData.list || []).forEach(item => {
      insightsMap[item.dimensions.campaign_id] = item.metrics;
    });

    return campaigns.map(camp => {
      const m = insightsMap[camp.campaign_id] || {};
      return {
        external_id: camp.campaign_id,
        name: camp.campaign_name,
        status: camp.operation_status,
        objective: mapTikTokObjective(camp.objective_type),
        original_objective: camp.objective_type,
        campaign_type: camp.campaign_type,
        budget: Number(camp.budget || 0),
        budget_type: camp.budget_mode,
        metrics: {
          spend: Number(m.spend || 0),
          impressions: Number(m.impressions || 0),
          clicks: Number(m.clicks || 0),
          ctr: Number(m.ctr || 0),
          cpc: Number(m.cpc || 0),
          cpm: Number(m.cpm || 0),
          reach: Number(m.reach || 0),
          frequency: Number(m.frequency || 0),
          conversions: Number(m.conversion || 0),
          conversion_rate: Number(m.conversion_rate || 0),
          cpa: Number(m.cost_per_conversion || 0),
          video_views: Number(m.video_play_actions || 0),
          video_p25: Number(m.video_views_p25 || 0),
          video_p50: Number(m.video_views_p50 || 0),
          video_p75: Number(m.video_views_p75 || 0),
          video_p100: Number(m.video_views_p100 || 0),
          follows: Number(m.follows || 0),
          likes: Number(m.likes || 0),
          comments: Number(m.comments || 0),
          shares: Number(m.shares || 0),
          profile_visits: Number(m.profile_visits || 0),
          result: Number(m.result || 0),
          cost_per_result: Number(m.cost_per_result || 0),
          result_rate: Number(m.result_rate || 0),
        },
        raw_data: { ...camp, insights: m },
      };
    });
  } catch (err) {
    logger.error('TikTok getCampaigns error:', err.message);
    throw new Error(`Lỗi lấy chiến dịch TikTok: ${err.message}`);
  }
};

/**
 * Map TikTok objective sang tiếng Việt
 */
const mapTikTokObjective = (objective) => {
  const map = {
    'REACH': 'Tiếp cận',
    'TRAFFIC': 'Lưu lượng',
    'APP_INSTALL': 'Cài app',
    'APP_PROMOTION': 'Quảng bá ứng dụng',
    'CONVERSIONS': 'Đơn hàng',
    'VIDEO_VIEWS': 'Lượt xem',
    'LEAD_GENERATION': 'Đơn hàng',
    'ENGAGEMENT': 'Follow',
    'PRODUCT_SALES': 'Đơn hàng',
    'CATALOG_SALES': 'Đơn hàng',
    'WEB_CONVERSIONS': 'Đơn hàng',
  };
  return map[objective] || objective || 'Khác';
};

/**
 * Lấy ad groups
 */
const getAdGroups = async (credentials, campaignExternalId, dateRange = {}) => {
  try {
    const decrypted = decryptCredentials(credentials);

    const data = await apiCall('/adgroup/get/', decrypted.access_token, {
      advertiser_id: decrypted.advertiser_id,
      filtering: JSON.stringify({ campaign_ids: [campaignExternalId] }),
      page_size: 200,
    });

    const adGroups = data.list || [];
    if (adGroups.length === 0) return [];

    // Lấy insights cho các ad groups
    const today = new Date();
    const TIKTOK_EPOCH = '2018-01-01';
    const startDate = dateRange.from === 'ALL_TIME' ? TIKTOK_EPOCH : (dateRange.from || new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    const endDate = dateRange.to === 'ALL_TIME' ? today.toISOString().split('T')[0] : (dateRange.to || today.toISOString().split('T')[0]);

    const adGroupIds = adGroups.map(ag => ag.adgroup_id);
    let insightsMap = {};

    try {
      const insightsData = await apiCall('/report/integrated/get/', decrypted.access_token, {
        advertiser_id: decrypted.advertiser_id,
        report_type: 'BASIC',
        data_level: 'AUCTION_ADGROUP',
        dimensions: JSON.stringify(['adgroup_id']),
        metrics: JSON.stringify([
          'spend', 'impressions', 'clicks', 'ctr', 'cpc', 'cpm', 'reach', 'frequency',
          'conversion', 'conversion_rate', 'cost_per_conversion',
          'video_play_actions', 'result', 'cost_per_result', 'result_rate',
        ]),
        start_date: startDate,
        end_date: endDate,
        page_size: 200,
        filters: JSON.stringify([{
          field_name: 'adgroup_ids',
          filter_type: 'IN',
          filter_value: JSON.stringify(adGroupIds),
        }]),
      });
      (insightsData.list || []).forEach(item => {
        insightsMap[item.dimensions.adgroup_id] = item.metrics;
      });
    } catch (insightErr) {
      logger.warn('TikTok adgroup insights warning:', insightErr.message);
    }

    return adGroups.map(ag => {
      const m = insightsMap[ag.adgroup_id] || {};
      return {
        external_id: ag.adgroup_id,
        campaign_external_id: ag.campaign_id,
        name: ag.adgroup_name,
        status: ag.operation_status,
        bid_type: ag.bid_type,
        bid_amount: Number(ag.bid_price || 0),
        target_cpa: Number(ag.conversion_bid_price || 0),
        budget: Number(ag.budget || 0),
        metrics: {
          spend: Number(m.spend || 0),
          impressions: Number(m.impressions || 0),
          clicks: Number(m.clicks || 0),
          ctr: Number(m.ctr || 0),
          cpc: Number(m.cpc || 0),
          cpm: Number(m.cpm || 0),
          reach: Number(m.reach || 0),
          frequency: Number(m.frequency || 0),
          conversions: Number(m.result || m.conversion || 0),
          conversion_rate: Number(m.result_rate || m.conversion_rate || 0),
          cpa: Number(m.cost_per_result || m.cost_per_conversion || 0),
          video_views: Number(m.video_play_actions || 0),
          result: Number(m.result || 0),
          cost_per_result: Number(m.cost_per_result || 0),
          result_rate: Number(m.result_rate || 0),
        },
        raw_data: ag,
      };
    });
  } catch (err) {
    logger.error('TikTok getAdGroups error:', err.message);
    throw new Error(`Lỗi lấy nhóm quảng cáo: ${err.message}`);
  }
};

/**
 * Lấy ads
 */
const getAds = async (credentials, adGroupExternalId, dateRange = {}) => {
  try {
    const decrypted = decryptCredentials(credentials);

    const data = await apiCall('/ad/get/', decrypted.access_token, {
      advertiser_id: decrypted.advertiser_id,
      filtering: JSON.stringify({ adgroup_ids: [adGroupExternalId] }),
      page_size: 200,
    });

    const ads = data.list || [];
    if (ads.length === 0) return [];

    // Lấy insights cho các ads
    const today = new Date();
    const TIKTOK_EPOCH = '2018-01-01';
    const startDate = dateRange.from === 'ALL_TIME' ? TIKTOK_EPOCH : (dateRange.from || new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    const endDate = dateRange.to === 'ALL_TIME' ? today.toISOString().split('T')[0] : (dateRange.to || today.toISOString().split('T')[0]);

    const adIds = ads.map(ad => ad.ad_id);
    let insightsMap = {};

    try {
      const insightsData = await apiCall('/report/integrated/get/', decrypted.access_token, {
        advertiser_id: decrypted.advertiser_id,
        report_type: 'BASIC',
        data_level: 'AUCTION_AD',
        dimensions: JSON.stringify(['ad_id']),
        metrics: JSON.stringify([
          'spend', 'impressions', 'clicks', 'ctr', 'cpc', 'cpm', 'reach', 'frequency',
          'conversion', 'conversion_rate', 'cost_per_conversion',
          'video_play_actions', 'result', 'cost_per_result', 'result_rate',
        ]),
        start_date: startDate,
        end_date: endDate,
        page_size: 200,
        filters: JSON.stringify([{
          field_name: 'ad_ids',
          filter_type: 'IN',
          filter_value: JSON.stringify(adIds),
        }]),
      });
      (insightsData.list || []).forEach(item => {
        insightsMap[item.dimensions.ad_id] = item.metrics;
      });
    } catch (insightErr) {
      logger.warn('TikTok ad insights warning:', insightErr.message);
    }

    return ads.map(ad => {
      const m = insightsMap[ad.ad_id] || {};
      return {
        external_id: ad.ad_id,
        name: ad.ad_name,
        status: ad.operation_status,
        ad_type: ad.ad_format,
        video_url: ad.video_id ? `https://www.tiktok.com/video/${ad.video_id}` : null,
        image_url: ad.image_ids?.[0] || null,
        headline: ad.ad_text,
        landing_url: ad.landing_page_url,
        metrics: {
          spend: Number(m.spend || 0),
          impressions: Number(m.impressions || 0),
          clicks: Number(m.clicks || 0),
          ctr: Number(m.ctr || 0),
          cpc: Number(m.cpc || 0),
          cpm: Number(m.cpm || 0),
          reach: Number(m.reach || 0),
          frequency: Number(m.frequency || 0),
          conversions: Number(m.result || m.conversion || 0),
          conversion_rate: Number(m.result_rate || m.conversion_rate || 0),
          cpa: Number(m.cost_per_result || m.cost_per_conversion || 0),
          video_views: Number(m.video_play_actions || 0),
          result: Number(m.result || 0),
          cost_per_result: Number(m.cost_per_result || 0),
          result_rate: Number(m.result_rate || 0),
        },
        raw_data: ad,
      };
    });
  } catch (err) {
    logger.error('TikTok getAds error:', err.message);
    throw new Error(`Lỗi lấy quảng cáo: ${err.message}`);
  }
};

/**
 * Bật/tắt chiến dịch
 */
const toggleCampaignStatus = async (credentials, campaignExternalId, enable) => {
  try {
    const decrypted = decryptCredentials(credentials);
    const operation = enable ? 'ENABLE' : 'DISABLE';

    await apiCall('/campaign/status/update/', decrypted.access_token, {
      advertiser_id: decrypted.advertiser_id,
      campaign_ids: [campaignExternalId],
      operation_status: operation,
    }, 'POST');

    return { success: true, status: enable ? 'ENABLE' : 'DISABLE' };
  } catch (err) {
    logger.error('TikTok toggleCampaign error:', err.message);
    throw new Error(`Không thể ${enable ? 'bật' : 'tắt'} chiến dịch TikTok: ${err.message}`);
  }
};

/**
 * Bật/tắt đối tượng theo scope (campaign / ad_group / ad)
 */
const toggleObjectStatus = async (credentials, externalId, scope, enable) => {
  const decrypted = decryptCredentials(credentials);
  const operation = enable ? 'ENABLE' : 'DISABLE';
  try {
    if (scope === 'ad_group') {
      await apiCall('/adgroup/status/update/', decrypted.access_token, {
        advertiser_id: decrypted.advertiser_id,
        adgroup_ids: [externalId],
        operation_status: operation,
      }, 'POST');
    } else if (scope === 'ad') {
      await apiCall('/ad/status/update/', decrypted.access_token, {
        advertiser_id: decrypted.advertiser_id,
        ad_ids: [externalId],
        operation_status: operation,
      }, 'POST');
    } else {
      await toggleCampaignStatus(credentials, externalId, enable);
    }
    return { success: true };
  } catch (err) {
    logger.error(`TikTok toggleObjectStatus (${scope}) error:`, err.message);
    throw new Error(`Không thể ${enable ? 'bật' : 'tắt'} TikTok ${scope}: ${err.message}`);
  }
};

/**
 * Lấy metrics theo scope (campaign/ad_group/ad) cho toàn bộ tài khoản — dùng cho rules engine
 * Trả về map { [externalId]: metrics }
 */
const getAllScopeMetrics = async (credentials, dateRange, scope) => {
  try {
    if (scope === 'campaign') {
      const campaigns = await getCampaigns(credentials, dateRange);
      const map = {};
      campaigns.forEach(c => { map[String(c.external_id)] = c.metrics; });
      return map;
    }

    const decrypted = decryptCredentials(credentials);
    const today = new Date();
    const TIKTOK_EPOCH = '2018-01-01';
    const startDate = dateRange.from === 'ALL_TIME' ? TIKTOK_EPOCH
      : (dateRange.from || new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    const endDate = dateRange.to === 'ALL_TIME' ? today.toISOString().split('T')[0]
      : (dateRange.to || today.toISOString().split('T')[0]);

    const dataLevel = scope === 'ad_group' ? 'AUCTION_ADGROUP' : 'AUCTION_AD';
    const dimension = scope === 'ad_group' ? 'adgroup_id' : 'ad_id';

    const data = await apiCall('/report/integrated/get/', decrypted.access_token, {
      advertiser_id: decrypted.advertiser_id,
      report_type: 'BASIC',
      data_level: dataLevel,
      dimensions: JSON.stringify([dimension]),
      metrics: JSON.stringify([
        'spend', 'impressions', 'clicks', 'ctr', 'cpc', 'cpm',
        'conversion', 'cost_per_conversion',
        'video_play_actions', 'result', 'cost_per_result', 'result_rate',
      ]),
      start_date: startDate,
      end_date: endDate,
      page_size: 1000,
    });

    const map = {};
    (data.list || []).forEach(item => {
      const id = String(item.dimensions[dimension]);
      const m = item.metrics || {};
      map[id] = {
        spend:           Number(m.spend || 0),
        impressions:     Number(m.impressions || 0),
        clicks:          Number(m.clicks || 0),
        ctr:             Number(m.ctr || 0),
        cpc:             Number(m.cpc || 0),
        cpm:             Number(m.cpm || 0),
        conversions:     Number(m.result || m.conversion || 0),
        cpa:             Number(m.cost_per_result || m.cost_per_conversion || 0),
        video_views:     Number(m.video_play_actions || 0),
        result:          Number(m.result || 0),
        cost_per_result: Number(m.cost_per_result || 0),
        follows:         0,
      };
    });
    return map;
  } catch (err) {
    logger.error(`TikTok getAllScopeMetrics (${scope}) error:`, err.message);
    return {};
  }
};
 */
const getDailyMetrics = async (credentials, dateRange = {}) => {
  try {
    const decrypted = decryptCredentials(credentials);

    const today = new Date();
    const startDate = dateRange.from || new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = dateRange.to || today.toISOString().split('T')[0];

    const data = await apiCall('/report/integrated/get/', decrypted.access_token, {
      advertiser_id: decrypted.advertiser_id,
      report_type: 'BASIC',
      data_level: 'AUCTION_CAMPAIGN',
      dimensions: JSON.stringify(['campaign_id', 'stat_time_day']),
      metrics: JSON.stringify(['spend', 'impressions', 'clicks', 'video_play_actions', 'follows', 'conversion']),
      start_date: startDate,
      end_date: endDate,
      page_size: 1000,
    });

    return (data.list || []).map(row => ({
      date: row.dimensions.stat_time_day?.split(' ')[0] || row.dimensions.stat_time_day,
      campaign_external_id: row.dimensions.campaign_id,
      spend: Number(row.metrics?.spend || 0),
      impressions: Number(row.metrics?.impressions || 0),
      clicks: Number(row.metrics?.clicks || 0),
      video_views: Number(row.metrics?.video_play_actions || 0),
      follows: Number(row.metrics?.follows || 0),
      conversions: Number(row.metrics?.conversion || 0),
    }));
  } catch (err) {
    logger.error('TikTok getDailyMetrics error:', err.message);
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
    logger.error('TikTok getLiveMetrics error:', err.message);
    return {};
  }
};

module.exports = {
  testConnection,
  getCampaigns,
  getAdGroups,
  getAds,
  toggleCampaignStatus,
  toggleObjectStatus,
  getAllScopeMetrics,
  getDailyMetrics,
  getLiveMetrics,
  refreshAccessToken,
  mapTikTokObjective,
};
