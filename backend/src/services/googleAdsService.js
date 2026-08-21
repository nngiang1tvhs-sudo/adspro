const { GoogleAdsApi, ResourceNames, enums, errors } = require('google-ads-api');
const logger = require('../utils/logger');
const { decryptCredentials } = require('../utils/encryption');

/**
 * Google Ads Service - tích hợp với Google Ads API
 *
 * Yêu cầu credentials:
 * - developer_token: Token nhà phát triển từ Google Ads Manager
 * - client_id: OAuth 2.0 Client ID
 * - client_secret: OAuth 2.0 Client Secret
 * - refresh_token: Refresh token từ flow OAuth
 * - customer_id: ID tài khoản Google Ads (định dạng XXX-XXX-XXXX hoặc XXXXXXXXXX)
 * - login_customer_id: (optional) ID MCC nếu dùng manager account
 */

const getClient = (credentials) => {
  const decrypted = decryptCredentials(credentials);
  return new GoogleAdsApi({
    client_id: decrypted.client_id,
    client_secret: decrypted.client_secret,
    developer_token: decrypted.developer_token,
  });
};

const getCustomer = (credentials) => {
  const decrypted = decryptCredentials(credentials);
  const client = getClient(credentials);
  const customerId = String(decrypted.customer_id).replace(/-/g, '');

  const config = {
    customer_id: customerId,
    refresh_token: decrypted.refresh_token,
  };

  if (decrypted.login_customer_id) {
    config.login_customer_id = String(decrypted.login_customer_id).replace(/-/g, '');
  }

  return client.Customer(config);
};

const getCustomerId = (credentials) => {
  const decrypted = decryptCredentials(credentials);
  return String(decrypted.customer_id).replace(/-/g, '');
};

/**
 * google-ads-api decode lỗi GAQL/API thành đối tượng GoogleAdsFailure { errors: [{ message, error_code }] }
 * thay vì ném Error thông thường, nên err.message luôn undefined. Hàm này lấy đúng message thật.
 */
const errorCodeName = (key, value) => {
  try {
    const pascal = key.replace(/(^|_)([a-z])/g, (_, __, c) => c.toUpperCase());
    return errors[`${pascal}Enum`]?.[pascal]?.[value] || value;
  } catch {
    return value;
  }
};

const extractGoogleAdsError = (err) => {
  if (err?.errors?.length) {
    return err.errors
      .map((e) => {
        const entry = e.error_code && Object.entries(e.error_code).find(([, v]) => v);
        const code = entry ? errorCodeName(entry[0], entry[1]) : null;
        return code ? `${e.message} [${code}]` : e.message;
      })
      .filter(Boolean)
      .join('; ');
  }
  return err?.message || String(err);
};

/**
 * customer.query() (REST) trả các trường enum (status, channel_type, ad_type...) dưới dạng
 * số nguyên thô (vd: campaign.status = 2) thay vì tên chuỗi ('ENABLED') như trước. Toàn bộ
 * app (DB, frontend, rules engine) đều so sánh theo chuỗi nên phải decode lại ngay khi đọc.
 */
const enumName = (enumObj, value) => {
  if (value === null || value === undefined) return value;
  return typeof value === 'number' ? (enumObj[value] ?? value) : value;
};

/**
 * Test kết nối tài khoản Google Ads
 */
const testConnection = async (credentials) => {
  try {
    const customer = getCustomer(credentials);
    const result = await customer.query(`
      SELECT customer.id, customer.descriptive_name, customer.currency_code
      FROM customer LIMIT 1
    `);

    if (!result || result.length === 0) {
      return { success: false, message: 'Không lấy được thông tin tài khoản' };
    }

    return {
      success: true,
      message: 'Kết nối thành công',
      data: {
        customerId: result[0].customer.id,
        name: result[0].customer.descriptive_name,
        currency: result[0].customer.currency_code,
      },
    };
  } catch (err) {
    const message = extractGoogleAdsError(err);
    logger.error('Google Ads test failed:', message);
    return {
      success: false,
      message: message || 'Không thể kết nối Google Ads',
    };
  }
};

/**
 * Lấy danh sách chiến dịch
 */
const getCampaigns = async (credentials, dateRange = { from: null, to: null }) => {
  try {
    const customer = getCustomer(credentials);

    let dateFilter = '';
    if (dateRange.from === 'ALL_TIME') {
      dateFilter = ''; // Không lọc ngày = toàn thời gian kể từ khi tạo chiến dịch
    } else if (dateRange.from && dateRange.to) {
      dateFilter = `AND segments.date BETWEEN '${dateRange.from}' AND '${dateRange.to}'`;
    } else {
      dateFilter = `AND segments.date DURING LAST_30_DAYS`;
    }

    const query = `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        campaign.advertising_channel_sub_type,
        campaign.bidding_strategy_type,
        campaign_budget.amount_micros,
        campaign_budget.delivery_method,
        metrics.impressions,
        metrics.clicks,
        metrics.ctr,
        metrics.average_cpc,
        metrics.average_cpm,
        metrics.cost_micros,
        metrics.video_trueview_views,
        metrics.trueview_average_cpv,
        metrics.video_trueview_view_rate,
        metrics.engagements,
        metrics.engagement_rate,
        metrics.conversions,
        metrics.cost_per_conversion,
        metrics.conversions_value,
        metrics.search_impression_share,
        metrics.video_quartile_p25_rate,
        metrics.video_quartile_p50_rate,
        metrics.video_quartile_p75_rate,
        metrics.video_quartile_p100_rate
      FROM campaign
      WHERE campaign.status != 'REMOVED'
      ${dateFilter}
    `;

    const results = await customer.query(query);

    return results.map(row => ({
      external_id: String(row.campaign.id),
      name: row.campaign.name,
      status: enumName(enums.CampaignStatus, row.campaign.status),
      channel_type: enumName(enums.AdvertisingChannelType, row.campaign.advertising_channel_type),
      sub_type: enumName(enums.AdvertisingChannelSubType, row.campaign.advertising_channel_sub_type),
      bidding_strategy: enumName(enums.BiddingStrategyType, row.campaign.bidding_strategy_type),
      budget_micros: row.campaign_budget?.amount_micros,
      budget: row.campaign_budget?.amount_micros ? Number(row.campaign_budget.amount_micros) / 1000000 : 0,
      delivery_method: enumName(enums.BudgetDeliveryMethod, row.campaign_budget?.delivery_method),
      objective: mapGoogleObjective(
        enumName(enums.AdvertisingChannelType, row.campaign.advertising_channel_type),
        enumName(enums.AdvertisingChannelSubType, row.campaign.advertising_channel_sub_type)
      ),
      metrics: {
        impressions: Number(row.metrics?.impressions || 0),
        clicks: Number(row.metrics?.clicks || 0),
        ctr: Number(row.metrics?.ctr || 0),
        cpc: row.metrics?.average_cpc ? Number(row.metrics.average_cpc) / 1000000 : 0,
        cpm: row.metrics?.average_cpm ? Number(row.metrics.average_cpm) / 1000000 : 0,
        spend: row.metrics?.cost_micros ? Number(row.metrics.cost_micros) / 1000000 : 0,
        video_views: Number(row.metrics?.video_trueview_views || 0),
        cpv: row.metrics?.trueview_average_cpv ? Number(row.metrics.trueview_average_cpv) / 1000000 : 0,
        view_rate: Number(row.metrics?.video_trueview_view_rate || 0),
        engagements: Number(row.metrics?.engagements || 0),
        engagement_rate: Number(row.metrics?.engagement_rate || 0),
        conversions: Number(row.metrics?.conversions || 0),
        result: Number(row.metrics?.video_trueview_views || row.metrics?.conversions || 0),
        cost_per_result: row.metrics?.trueview_average_cpv
          ? Number(row.metrics.trueview_average_cpv) / 1000000
          : (Number(row.metrics?.cost_per_conversion || 0) / 1000000),
        cpa: Number(row.metrics?.cost_per_conversion || 0) / 1000000,
        revenue: Number(row.metrics?.conversions_value || 0),
        roas: row.metrics?.cost_micros && row.metrics?.conversions_value
          ? Number(row.metrics.conversions_value) / (Number(row.metrics.cost_micros) / 1000000)
          : 0,
        impression_share: Number(row.metrics?.search_impression_share || 0),
        video_p25: Number(row.metrics?.video_quartile_p25_rate || 0),
        video_p50: Number(row.metrics?.video_quartile_p50_rate || 0),
        video_p75: Number(row.metrics?.video_quartile_p75_rate || 0),
        video_p100: Number(row.metrics?.video_quartile_p100_rate || 0),
      },
      raw_data: row,
    }));
  } catch (err) {
    const message = extractGoogleAdsError(err);
    logger.error('Google Ads getCampaigns error:', message);
    throw new Error(`Lỗi lấy chiến dịch Google Ads: ${message}`);
  }
};

/**
 * Lấy danh sách nhóm quảng cáo
 */
const getAdGroups = async (credentials, campaignExternalId, dateRange = {}) => {
  try {
    const customer = getCustomer(credentials);

    let dateFilter = `AND segments.date DURING LAST_30_DAYS`;
    if (dateRange.from === 'ALL_TIME') {
      dateFilter = '';
    } else if (dateRange.from && dateRange.to) {
      dateFilter = `AND segments.date BETWEEN '${dateRange.from}' AND '${dateRange.to}'`;
    }

    const query = `
      SELECT
        ad_group.id,
        ad_group.name,
        ad_group.status,
        ad_group.type,
        ad_group.cpc_bid_micros,
        ad_group.cpv_bid_micros,
        ad_group.cpm_bid_micros,
        ad_group.target_cpa_micros,
        campaign.id,
        metrics.impressions,
        metrics.clicks,
        metrics.ctr,
        metrics.average_cpc,
        metrics.cost_micros,
        metrics.video_trueview_views,
        metrics.trueview_average_cpv,
        metrics.conversions,
        metrics.cost_per_conversion
      FROM ad_group
      WHERE ad_group.status != 'REMOVED'
        AND campaign.id = ${campaignExternalId}
      ${dateFilter}
    `;

    const results = await customer.query(query);

    return results.map(row => ({
      external_id: String(row.ad_group.id),
      campaign_external_id: String(row.campaign.id),
      name: row.ad_group.name,
      status: enumName(enums.AdGroupStatus, row.ad_group.status),
      type: enumName(enums.AdGroupType, row.ad_group.type),
      bid_amount: row.ad_group?.cpc_bid_micros ? Number(row.ad_group.cpc_bid_micros) / 1000000 : 0,
      target_cpv: row.ad_group?.cpv_bid_micros ? Number(row.ad_group.cpv_bid_micros) / 1000000 : 0,
      target_cpm: row.ad_group?.cpm_bid_micros ? Number(row.ad_group.cpm_bid_micros) / 1000000 : 0,
      target_cpa: row.ad_group?.target_cpa_micros ? Number(row.ad_group.target_cpa_micros) / 1000000 : 0,
      metrics: {
        impressions: Number(row.metrics?.impressions || 0),
        clicks: Number(row.metrics?.clicks || 0),
        ctr: Number(row.metrics?.ctr || 0),
        cpc: row.metrics?.average_cpc ? Number(row.metrics.average_cpc) / 1000000 : 0,
        spend: row.metrics?.cost_micros ? Number(row.metrics.cost_micros) / 1000000 : 0,
        video_views: Number(row.metrics?.video_trueview_views || 0),
        cpv: row.metrics?.trueview_average_cpv ? Number(row.metrics.trueview_average_cpv) / 1000000 : 0,
        conversions: Number(row.metrics?.conversions || 0),
        cpa: Number(row.metrics?.cost_per_conversion || 0) / 1000000,
      },
      raw_data: row,
    }));
  } catch (err) {
    const message = extractGoogleAdsError(err);
    logger.error('Google Ads getAdGroups error:', message);
    throw new Error(`Lỗi lấy nhóm quảng cáo: ${message}`);
  }
};

/**
 * Lấy danh sách quảng cáo
 */
const getAds = async (credentials, adGroupExternalId, dateRange = {}) => {
  try {
    const customer = getCustomer(credentials);

    let dateFilter = `AND segments.date DURING LAST_30_DAYS`;
    if (dateRange.from === 'ALL_TIME') {
      dateFilter = '';
    } else if (dateRange.from && dateRange.to) {
      dateFilter = `AND segments.date BETWEEN '${dateRange.from}' AND '${dateRange.to}'`;
    }

    const query = `
      SELECT
        ad_group_ad.ad.id,
        ad_group_ad.ad.name,
        ad_group_ad.ad.type,
        ad_group_ad.ad.final_urls,
        ad_group_ad.status,
        metrics.impressions,
        metrics.clicks,
        metrics.ctr,
        metrics.average_cpc,
        metrics.cost_micros,
        metrics.video_trueview_views,
        metrics.trueview_average_cpv,
        metrics.conversions,
        metrics.cost_per_conversion
      FROM ad_group_ad
      WHERE ad_group_ad.status != 'REMOVED'
        AND ad_group.id = ${adGroupExternalId}
      ${dateFilter}
    `;

    const results = await customer.query(query);

    return results.map(row => ({
      external_id: String(row.ad_group_ad.ad.id),
      name: row.ad_group_ad.ad.name || `Ad ${row.ad_group_ad.ad.id}`,
      ad_type: enumName(enums.AdType, row.ad_group_ad.ad.type),
      status: enumName(enums.AdGroupAdStatus, row.ad_group_ad.status),
      landing_url: row.ad_group_ad.ad.final_urls?.[0] || '',
      metrics: {
        impressions: Number(row.metrics?.impressions || 0),
        clicks: Number(row.metrics?.clicks || 0),
        ctr: Number(row.metrics?.ctr || 0),
        cpc: row.metrics?.average_cpc ? Number(row.metrics.average_cpc) / 1000000 : 0,
        spend: row.metrics?.cost_micros ? Number(row.metrics.cost_micros) / 1000000 : 0,
        video_views: Number(row.metrics?.video_trueview_views || 0),
        cpv: row.metrics?.trueview_average_cpv ? Number(row.metrics.trueview_average_cpv) / 1000000 : 0,
        conversions: Number(row.metrics?.conversions || 0),
        cpa: row.metrics?.cost_per_conversion ? Number(row.metrics.cost_per_conversion) / 1000000 : 0,
      },
      raw_data: row,
    }));
  } catch (err) {
    const message = extractGoogleAdsError(err);
    logger.error('Google Ads getAds error:', message);
    throw new Error(`Lỗi lấy quảng cáo: ${message}`);
  }
};

/**
 * Bật/Tắt chiến dịch
 */
const toggleCampaignStatus = async (credentials, campaignExternalId, enable) => {
  try {
    const customer = getCustomer(credentials);
    const customerId = getCustomerId(credentials);
    const newStatus = enable ? 'ENABLED' : 'PAUSED';

    await customer.campaigns.update([{
      resource_name: ResourceNames.campaign(customerId, campaignExternalId),
      status: newStatus,
    }]);

    return { success: true, status: newStatus };
  } catch (err) {
    const message = extractGoogleAdsError(err);
    logger.error('Google Ads toggleCampaign error:', message);
    throw new Error(`Không thể ${enable ? 'bật' : 'tắt'} chiến dịch: ${message}`);
  }
};

/**
 * Bật/tắt đối tượng theo scope
 */
const toggleObjectStatus = async (credentials, externalId, scope, enable) => {
  const customer = getCustomer(credentials);
  const customerId = getCustomerId(credentials);
  const newStatus = enable ? 'ENABLED' : 'PAUSED';
  try {
    if (scope === 'ad_group') {
      await customer.adGroups.update([{
        resource_name: ResourceNames.adGroup(customerId, externalId),
        status: newStatus,
      }]);
    } else if (scope === 'ad') {
      // ad_group_ad resource requires composite key — look it up first
      const res = await customer.query(
        `SELECT ad_group_ad.resource_name FROM ad_group_ad WHERE ad_group_ad.ad.id = ${externalId} LIMIT 1`
      );
      if (res.length > 0) {
        await customer.adGroupAds.update([{
          resource_name: res[0].ad_group_ad.resource_name,
          status: newStatus,
        }]);
      }
    } else {
      await toggleCampaignStatus(credentials, externalId, enable);
    }
    return { success: true };
  } catch (err) {
    const message = extractGoogleAdsError(err);
    logger.error(`Google toggleObjectStatus (${scope}) error:`, message);
    throw new Error(`Không thể ${enable ? 'bật' : 'tắt'} Google ${scope}: ${message}`);
  }
};

/**
 * Google chặn mutate trực tiếp campaign/ad_group của các chiến dịch Video/TrueView
 * (MUTATE_NOT_ALLOWED) nhưng vẫn cho mutate từng ad_group_ad. Hàm này tắt/bật toàn bộ
 * quảng cáo con thuộc 1 chiến dịch hoặc 1 nhóm quảng cáo — dùng làm phương án thay thế
 * khi rules engine không tắt/bật được trực tiếp cấp chiến dịch/nhóm.
 *
 * Vì campaign.status/ad_group.status không bao giờ đổi thật (Google chặn), rules engine
 * không có cách nào biết "đã cascade rồi" ngoài hỏi lại đúng câu hỏi: hiện còn ad nào ở
 * trạng thái ngược lại (đang bật khi cần tắt, hoặc đang tắt khi cần bật) không? Nên chỉ
 * lấy đúng các ad_group_ad đang ở trạng thái đối lập — nếu không còn ad nào, trả về
 * count = 0 nghĩa là "đã xong từ lần cascade trước", không phải lỗi.
 */
const cascadeToggleChildAds = async (credentials, { campaignExternalId, adGroupExternalId }, enable) => {
  try {
    const customer = getCustomer(credentials);
    const newStatus = enable ? 'ENABLED' : 'PAUSED';
    const currentStatusFilter = enable ? 'PAUSED' : 'ENABLED';
    const whereClause = campaignExternalId
      ? `campaign.id = ${campaignExternalId}`
      : `ad_group.id = ${adGroupExternalId}`;

    const rows = await customer.query(
      `SELECT ad_group_ad.resource_name, ad_group_ad.ad.id
       FROM ad_group_ad
       WHERE ${whereClause} AND ad_group_ad.status = '${currentStatusFilter}'`
    );

    if (rows.length === 0) return { success: true, count: 0, adExternalIds: [] };

    const ops = rows.map(row => ({ resource_name: row.ad_group_ad.resource_name, status: newStatus }));
    await customer.adGroupAds.update(ops);

    return {
      success: true,
      count: ops.length,
      adExternalIds: rows.map(row => String(row.ad_group_ad.ad.id)),
    };
  } catch (err) {
    const message = extractGoogleAdsError(err);
    logger.error('Google cascadeToggleChildAds error:', message);
    return { success: false, count: 0, adExternalIds: [], message };
  }
};

/**
 * Lấy metrics theo scope cho toàn bộ tài khoản — dùng cho rules engine
 */
const getAllScopeMetrics = async (credentials, dateRange, scope) => {
  try {
    if (scope === 'campaign') {
      const campaigns = await getCampaigns(credentials, dateRange);
      const map = {};
      campaigns.forEach(c => { map[String(c.external_id)] = c.metrics; });
      map['__items__'] = campaigns.map(c => ({
        external_id: String(c.external_id),
        name: c.name,
        status: c.status,
        campaign_external_id: null,
      }));
      return map;
    }

    const customer = getCustomer(credentials);
    let dateFilter = 'AND segments.date DURING LAST_30_DAYS';
    if (dateRange.from === 'ALL_TIME') dateFilter = '';
    else if (dateRange.from && dateRange.to) dateFilter = `AND segments.date BETWEEN '${dateRange.from}' AND '${dateRange.to}'`;

    const buildM = (row) => ({
      impressions:      Number(row.metrics?.impressions || 0),
      clicks:           Number(row.metrics?.clicks || 0),
      ctr:              Number(row.metrics?.ctr || 0),
      cpc:              row.metrics?.average_cpc ? Number(row.metrics.average_cpc) / 1000000 : 0,
      spend:            row.metrics?.cost_micros  ? Number(row.metrics.cost_micros) / 1000000 : 0,
      video_views:      Number(row.metrics?.video_trueview_views || 0),
      cpv:              row.metrics?.trueview_average_cpv ? Number(row.metrics.trueview_average_cpv) / 1000000 : 0,
      conversions:      Number(row.metrics?.conversions || 0),
      cpa:              Number(row.metrics?.cost_per_conversion || 0) / 1000000,
      result:           Number(row.metrics?.video_trueview_views || row.metrics?.conversions || 0),
      cost_per_result:  row.metrics?.trueview_average_cpv
        ? Number(row.metrics.trueview_average_cpv) / 1000000
        : Number(row.metrics?.cost_per_conversion || 0) / 1000000,
      engagements:      Number(row.metrics?.engagements || 0),
      impression_share: Number(row.metrics?.search_impression_share || 0),
    });

    const map = {};
    if (scope === 'ad_group') {
      const results = await customer.query(
        `SELECT ad_group.id, ad_group.name, ad_group.status, campaign.id AS campaign_id,
                metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc,
                metrics.cost_micros, metrics.video_trueview_views, metrics.trueview_average_cpv, metrics.conversions,
                metrics.cost_per_conversion, metrics.engagements, metrics.search_impression_share
         FROM ad_group
         WHERE ad_group.status != 'REMOVED' ${dateFilter}`
      );
      const items = [];
      results.forEach(row => {
        map[String(row.ad_group.id)] = buildM(row);
        items.push({
          external_id: String(row.ad_group.id),
          name: row.ad_group.name,
          status: enumName(enums.AdGroupStatus, row.ad_group.status),
          campaign_external_id: row.campaign?.id ? String(row.campaign.id) : null,
        });
      });
      map['__items__'] = items;
    } else if (scope === 'ad') {
      const results = await customer.query(
        `SELECT ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.status, ad_group.campaign_id,
                metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc,
                metrics.cost_micros, metrics.video_trueview_views, metrics.trueview_average_cpv, metrics.conversions,
                metrics.cost_per_conversion, metrics.engagements
         FROM ad_group_ad
         WHERE ad_group_ad.status != 'REMOVED' ${dateFilter}`
      );
      const items = [];
      results.forEach(row => {
        map[String(row.ad_group_ad.ad.id)] = buildM(row);
        items.push({
          external_id: String(row.ad_group_ad.ad.id),
          name: row.ad_group_ad.ad.name || String(row.ad_group_ad.ad.id),
          status: enumName(enums.AdGroupAdStatus, row.ad_group_ad.status),
          campaign_external_id: row.ad_group?.campaign_id ? String(row.ad_group.campaign_id) : null,
        });
      });
      map['__items__'] = items;
    }
    return map;
  } catch (err) {
    logger.error(`Google getAllScopeMetrics (${scope}) error:`, extractGoogleAdsError(err));
    return {};
  }
};

/**
 * Map Google channel type sang objective hiển thị
 */
const mapGoogleObjective = (channelType, subType) => {
  if (channelType === 'VIDEO') return 'TrueView';
  if (channelType === 'SEARCH') return 'Tìm kiếm';
  if (channelType === 'DISPLAY') return 'Hiển thị';
  if (channelType === 'SHOPPING') return 'Mua sắm';
  if (channelType === 'PERFORMANCE_MAX') return 'Performance Max';
  if (channelType === 'MULTI_CHANNEL') return 'Đa kênh';
  return channelType || 'Khác';
};

/**
 * Lấy số liệu hằng ngày cho 1 chiến dịch (để vẽ biểu đồ)
 */
const getDailyMetrics = async (credentials, dateRange = {}) => {
  try {
    const customer = getCustomer(credentials);

    let dateFilter = `WHERE segments.date DURING LAST_30_DAYS`;
    if (dateRange.from && dateRange.to) {
      dateFilter = `WHERE segments.date BETWEEN '${dateRange.from}' AND '${dateRange.to}'`;
    }

    const query = `
      SELECT
        segments.date,
        campaign.id,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.video_trueview_views,
        metrics.conversions
      FROM campaign
      ${dateFilter}
      ORDER BY segments.date
    `;

    const results = await customer.query(query);

    return results.map(row => ({
      date: row.segments.date,
      campaign_external_id: String(row.campaign.id),
      impressions: Number(row.metrics?.impressions || 0),
      clicks: Number(row.metrics?.clicks || 0),
      spend: row.metrics?.cost_micros ? Number(row.metrics.cost_micros) / 1000000 : 0,
      video_views: Number(row.metrics?.video_trueview_views || 0),
      conversions: Number(row.metrics?.conversions || 0),
    }));
  } catch (err) {
    const message = extractGoogleAdsError(err);
    logger.error('Google Ads getDailyMetrics error:', message);
    throw new Error(`Lỗi lấy số liệu hằng ngày: ${message}`);
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
    logger.error('Google getLiveMetrics error:', extractGoogleAdsError(err));
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
  cascadeToggleChildAds,
  getAllScopeMetrics,
  getDailyMetrics,
  getLiveMetrics,
};
