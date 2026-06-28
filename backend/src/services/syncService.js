const { query, transaction } = require('../config/database');
const { getService } = require('./platformService');
const logger = require('../utils/logger');
const { logEvent, EVENT_TYPES } = require('../utils/audit');
const { sendSyncErrorAlert } = require('./emailService');

/**
 * Đồng bộ data của 1 tài khoản
 */
const syncAccount = async (accountId, options = {}) => {
  const startTime = Date.now();

  // Lấy thông tin account
  const accountResult = await query(
    'SELECT id, platform, account_name, credentials FROM ad_accounts WHERE id = $1',
    [accountId]
  );

  if (accountResult.rowCount === 0) {
    throw new Error('Tài khoản không tồn tại');
  }

  const account = accountResult.rows[0];
  const service = getService(account.platform);

  // Tạo sync log
  const syncLog = await query(
    `INSERT INTO sync_logs (account_id, platform, sync_type, status, started_at)
     VALUES ($1, $2, $3, 'success', CURRENT_TIMESTAMP) RETURNING id`,
    [accountId, account.platform, options.fullSync ? 'full' : 'incremental']
  );
  const syncLogId = syncLog.rows[0].id;

  await logEvent({
    accountId,
    eventType: EVENT_TYPES.SYNC_START,
    level: 'info',
    message: `Bắt đầu đồng bộ ${account.account_name}`,
  });

  let stats = { campaigns: 0, ad_groups: 0, ads: 0 };
  let errorMsg = null;
  let success = true;

  try {
    // Sync campaigns
    const campaigns = await service.getCampaigns(account.credentials, options.dateRange || {});

    for (const camp of campaigns) {
      await query(
        `INSERT INTO campaigns
         (account_id, platform, external_id, name, status, objective, budget, budget_type, metrics, raw_data, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
         ON CONFLICT (account_id, external_id) DO UPDATE SET
           name = EXCLUDED.name,
           status = EXCLUDED.status,
           objective = EXCLUDED.objective,
           budget = EXCLUDED.budget,
           budget_type = EXCLUDED.budget_type,
           metrics = EXCLUDED.metrics,
           raw_data = EXCLUDED.raw_data,
           updated_at = CURRENT_TIMESTAMP`,
        [
          accountId,
          account.platform,
          camp.external_id,
          camp.name,
          camp.status,
          camp.objective,
          camp.budget || 0,
          camp.budget_type || 'daily',
          JSON.stringify(camp.metrics || {}),
          JSON.stringify(camp.raw_data || {}),
        ]
      );
      stats.campaigns++;
    }

    // Sync daily metrics for charts
    try {
      const dailyMetrics = await service.getDailyMetrics(account.credentials, options.dateRange || {});

      // Lấy map campaign_id (DB) từ external_id
      const campMap = await query(
        'SELECT id, external_id FROM campaigns WHERE account_id = $1',
        [accountId]
      );
      const externalToDbMap = {};
      campMap.rows.forEach(c => { externalToDbMap[String(c.external_id)] = c.id; });

      // Upsert daily metrics (tránh duplicate khi sync nhiều lần trong ngày)
      for (const dm of dailyMetrics) {
        const dbCampaignId = externalToDbMap[String(dm.campaign_external_id)];
        if (!dbCampaignId) continue;

        await query(
          `INSERT INTO daily_metrics
           (account_id, campaign_id, date, spend, impressions, clicks, conversions, video_views, follows, messages, engagements, reach, raw_metrics)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT (account_id, campaign_id, date) DO UPDATE SET
             spend        = EXCLUDED.spend,
             impressions  = EXCLUDED.impressions,
             clicks       = EXCLUDED.clicks,
             conversions  = EXCLUDED.conversions,
             video_views  = EXCLUDED.video_views,
             follows      = EXCLUDED.follows,
             messages     = EXCLUDED.messages,
             engagements  = EXCLUDED.engagements,
             reach        = EXCLUDED.reach,
             raw_metrics  = EXCLUDED.raw_metrics`,
          [
            accountId,
            dbCampaignId,
            dm.date,
            dm.spend || 0,
            dm.impressions || 0,
            dm.clicks || 0,
            dm.conversions || 0,
            dm.video_views || 0,
            dm.follows || 0,
            dm.messages || 0,
            dm.engagements || 0,
            dm.reach || 0,
            JSON.stringify(dm),
          ]
        );
      }
    } catch (dmErr) {
      logger.warn('Sync daily metrics warning:', dmErr.message);
    }

    // Cập nhật last_sync_at
    await query(
      'UPDATE ad_accounts SET last_sync_at = CURRENT_TIMESTAMP, status = $1, status_message = NULL WHERE id = $2',
      ['active', accountId]
    );

  } catch (err) {
    success = false;
    errorMsg = err.message;
    logger.error(`Sync failed for account ${accountId}:`, err);

    await query(
      'UPDATE ad_accounts SET status = $1, status_message = $2 WHERE id = $3',
      ['error', err.message, accountId]
    );

    await logEvent({
      accountId,
      eventType: EVENT_TYPES.SYNC_FAILED,
      level: 'error',
      message: `Đồng bộ thất bại: ${err.message}`,
      details: { error: err.message },
    });

    // Gửi email cảnh báo nếu user bật tính năng này
    try {
      const userResult = await query(
        'SELECT user_id FROM ad_accounts WHERE id = $1',
        [accountId]
      );
      if (userResult.rowCount > 0) {
        await sendSyncErrorAlert({
          userId: userResult.rows[0].user_id,
          accountName: account.account_name,
          platform: account.platform,
          errorMessage: err.message,
          accountId,
        });
      }
    } catch (emailErr) {
      logger.warn('Không gửi được email cảnh báo sync:', emailErr.message);
    }
  }

  const duration = Date.now() - startTime;

  // Update sync log
  await query(
    `UPDATE sync_logs SET status = $1, campaigns_synced = $2, ad_groups_synced = $3, ads_synced = $4,
       duration_ms = $5, error_message = $6, completed_at = CURRENT_TIMESTAMP
     WHERE id = $7`,
    [
      success ? 'success' : 'failed',
      stats.campaigns,
      stats.ad_groups,
      stats.ads,
      duration,
      errorMsg,
      syncLogId,
    ]
  );

  if (success) {
    await logEvent({
      accountId,
      eventType: EVENT_TYPES.SYNC_SUCCESS,
      level: 'success',
      message: `Đồng bộ thành công: ${stats.campaigns} chiến dịch (${duration}ms)`,
      details: stats,
    });
  }

  return { success, stats, duration, error: errorMsg };
};

/**
 * Đồng bộ tất cả accounts đang active
 */
const syncAllAccounts = async () => {
  const accounts = await query(
    `SELECT id, account_name, platform FROM ad_accounts WHERE status = 'active'`
  );

  logger.info(`Bắt đầu đồng bộ ${accounts.rowCount} tài khoản`);

  const results = [];
  for (let i = 0; i < accounts.rows.length; i++) {
    const account = accounts.rows[i];
    if (i > 0) await new Promise(r => setTimeout(r, 3000)); // 3s delay giữa các account
    try {
      const result = await syncAccount(account.id);
      results.push({ accountId: account.id, ...result });
    } catch (err) {
      logger.error(`Sync error for ${account.account_name}:`, err);
      results.push({ accountId: account.id, success: false, error: err.message });
    }
  }

  return results;
};

/**
 * Tự động reconnect các tài khoản đang lỗi
 */
const autoReconnectErrorAccounts = async () => {
  const errorAccounts = await query(
    `SELECT id, platform, account_name, credentials FROM ad_accounts WHERE status = 'error'`
  );

  if (errorAccounts.rowCount === 0) return [];

  logger.info(`🔄 Auto-reconnect: Tìm thấy ${errorAccounts.rowCount} tài khoản lỗi, đang thử kết nối lại...`);

  const results = [];
  for (const account of errorAccounts.rows) {
    try {
      const service = getService(account.platform);
      const testResult = await service.testConnection(account.credentials);

      if (testResult.success) {
        await query(
          `UPDATE ad_accounts SET status = 'active', status_message = NULL,
           currency = COALESCE($1, currency) WHERE id = $2`,
          [testResult.data?.currency || null, account.id]
        );

        await logEvent({
          accountId: account.id,
          eventType: EVENT_TYPES.SYNC_SUCCESS,
          level: 'success',
          message: `Auto-reconnect thành công: ${account.account_name}`,
        });

        logger.info(`✅ Auto-reconnect OK: ${account.account_name}`);
        results.push({ accountId: account.id, name: account.account_name, reconnected: true });
      } else {
        logger.warn(`❌ Auto-reconnect vẫn lỗi: ${account.account_name} - ${testResult.message}`);
        results.push({ accountId: account.id, name: account.account_name, reconnected: false, error: testResult.message });
      }
    } catch (err) {
      logger.warn(`❌ Auto-reconnect exception: ${account.account_name} - ${err.message}`);
      results.push({ accountId: account.id, name: account.account_name, reconnected: false, error: err.message });
    }

    await new Promise(r => setTimeout(r, 2000));
  }

  const reconnected = results.filter(r => r.reconnected).length;
  if (reconnected > 0) {
    logger.info(`🔄 Auto-reconnect: ${reconnected}/${results.length} tài khoản đã kết nối lại thành công`);
  }

  return results;
};

module.exports = { syncAccount, syncAllAccounts, autoReconnectErrorAccounts };
