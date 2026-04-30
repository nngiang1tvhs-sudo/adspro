const googleAdsService = require('./googleAdsService');
const facebookAdsService = require('./facebookAdsService');
const tiktokAdsService = require('./tiktokAdsService');

/**
 * Trả về service phù hợp theo platform
 */
const getService = (platform) => {
  switch (platform) {
    case 'google':
      return googleAdsService;
    case 'facebook':
      return facebookAdsService;
    case 'tiktok':
      return tiktokAdsService;
    default:
      throw new Error(`Platform không hỗ trợ: ${platform}`);
  }
};

const PLATFORMS = ['google', 'facebook', 'tiktok'];

const PLATFORM_LABELS = {
  google: 'Google Ads',
  facebook: 'Facebook Ads',
  tiktok: 'TikTok Ads',
};

module.exports = { getService, PLATFORMS, PLATFORM_LABELS };
