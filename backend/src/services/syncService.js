const { query, transaction } = require('../config/database');
const { getService } = require('./platformService');
const logger = require('../utils/logger');
const { logEvent, EVENT_TYPES } = require('../utils/audit');

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
      campMap.rows.forEach(c => { externalToDbMap[c.external_id] = c.id; });

      // Xóa daily metrics cũ trong khoảng thời gian này
      if (options.dateRange?.from && options.dateRange?.to) {
        await query(
          'DELETE FROM daily_metrics WHERE account_id = $1 AND date BETWEEN $2 AND $3',
          [accountId, options.dateRange.from, options.dateRange.to]
        );
      }

      // Insert mới
      for (const dm of dailyMetrics) {
        const dbCampaignId = externalToDbMap[dm.campaign_external_id];
        if (!dbCampaignId) continue;

        await query(
          `INSERT INTO daily_metrics
           (account_id, campaign_id, date, spend, impressions, clicks, conversions, video_views, follows, messages, raw_metrics)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
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
  for (const account of accounts.rows) {
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

module.exports = { syncAccount, syncAllAccounts };
