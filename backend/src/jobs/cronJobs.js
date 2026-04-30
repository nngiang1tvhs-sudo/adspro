const cron = require('node-cron');
const logger = require('../utils/logger');
const { syncAllAccounts } = require('../services/syncService');
const { runAllActiveRules } = require('../services/rulesEngine');
const { sendDailyReport } = require('../services/emailService');
const { query } = require('../config/database');

const TIMEZONE = process.env.TIMEZONE || 'Asia/Ho_Chi_Minh';

/**
 * Cron 1: Đồng bộ data từ ad platforms (mỗi 15 phút)
 */
const startSyncCron = () => {
  const schedule = process.env.SYNC_CRON || '*/15 * * * *';
  cron.schedule(schedule, async () => {
    logger.info('🔄 Cron: Bắt đầu đồng bộ tất cả tài khoản');
    try {
      const results = await syncAllAccounts();
      const ok = results.filter(r => r.success).length;
      logger.info(`✅ Cron sync: ${ok}/${results.length} thành công`);
    } catch (err) {
      logger.error('❌ Cron sync error:', err);
    }
  }, { timezone: TIMEZONE });

  logger.info(`📅 Sync cron đã đăng ký: ${schedule} (${TIMEZONE})`);
};

/**
 * Cron 2: Chạy rules tự động (mỗi 5 phút)
 */
const startRulesCron = () => {
  const schedule = process.env.RULES_CRON || '*/5 * * * *';
  cron.schedule(schedule, async () => {
    logger.info('⚡ Cron: Chạy rules tự động');
    try {
      const results = await runAllActiveRules();
      const triggered = results.filter(r => r.triggered > 0);
      if (triggered.length > 0) {
        logger.info(`⚡ ${triggered.length} rules đã trigger`);
      }
    } catch (err) {
      logger.error('❌ Cron rules error:', err);
    }
  }, { timezone: TIMEZONE });

  logger.info(`📅 Rules cron đã đăng ký: ${schedule} (${TIMEZONE})`);
};

/**
 * Cron 3: Gửi báo cáo sáng (mặc định 7:00 sáng VN)
 */
const startDailyReportCron = () => {
  const schedule = process.env.DAILY_REPORT_CRON || '0 7 * * *';
  cron.schedule(schedule, async () => {
    logger.info('📧 Cron: Gửi báo cáo sáng');
    try {
      const users = await query('SELECT id, username FROM users');
      for (const user of users.rows) {
        // Kiểm tra user có bật báo cáo sáng không
        const settings = await query(
          'SELECT daily_report_enabled FROM user_settings WHERE user_id = $1',
          [user.id]
        );

        if (settings.rowCount > 0 && settings.rows[0].daily_report_enabled === false) {
          continue;
        }

        const result = await sendDailyReport(user.id);
        if (result.success) {
          logger.info(`📧 Báo cáo đã gửi cho ${user.username}`);
        } else {
          logger.warn(`📧 Không gửi được cho ${user.username}: ${result.message}`);
        }
      }
    } catch (err) {
      logger.error('❌ Cron daily report error:', err);
    }
  }, { timezone: TIMEZONE });

  logger.info(`📅 Daily report cron đã đăng ký: ${schedule} (${TIMEZONE})`);
};

/**
 * Cron 4: Refresh TikTok tokens (mỗi 12h)
 */
const startTokenRefreshCron = () => {
  cron.schedule('0 */12 * * *', async () => {
    logger.info('🔑 Cron: Refresh TikTok tokens');
    try {
      const accounts = await query(
        `SELECT id, account_name, credentials FROM ad_accounts
         WHERE platform = 'tiktok'
           AND (token_expires_at IS NULL OR token_expires_at < CURRENT_TIMESTAMP + INTERVAL '6 hours')`
      );

      const tiktokService = require('../services/tiktokAdsService');
      for (const account of accounts.rows) {
        try {
          await tiktokService.refreshAccessToken(account.id, account.credentials);
          logger.info(`🔑 Refreshed token: ${account.account_name}`);
        } catch (err) {
          logger.error(`Token refresh failed for ${account.account_name}:`, err.message);
        }
      }
    } catch (err) {
      logger.error('❌ Cron token refresh error:', err);
    }
  }, { timezone: TIMEZONE });

  logger.info(`📅 Token refresh cron đã đăng ký (mỗi 12h)`);
};

const startAllCrons = () => {
  if (process.env.NODE_ENV === 'test') {
    logger.info('🧪 Test mode - Cron jobs không chạy');
    return;
  }

  startSyncCron();
  startRulesCron();
  startDailyReportCron();
  startTokenRefreshCron();
  logger.info('✅ Tất cả cron jobs đã đăng ký');
};

module.exports = { startAllCrons };
