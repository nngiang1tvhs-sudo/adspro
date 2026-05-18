const { Resend } = require('resend');
const { query } = require('../config/database');
const logger = require('../utils/logger');
const { logEvent, EVENT_TYPES } = require('../utils/audit');
const dayjs = require('dayjs');

const getResendClient = () => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === 're_your_resend_api_key_here') {
    return null;
  }
  return new Resend(apiKey);
};

/**
 * Lấy email từ user_settings
 */
const getRecipientEmails = async (userId) => {
  const result = await query(
    'SELECT email_primary, email_secondary FROM user_settings WHERE user_id = $1',
    [userId]
  );
  if (result.rowCount === 0) return [];

  const emails = [];
  if (result.rows[0].email_primary) emails.push(result.rows[0].email_primary);
  if (result.rows[0].email_secondary) emails.push(result.rows[0].email_secondary);
  return emails;
};

/**
 * Gửi email cơ bản
 * Gửi riêng từng recipient để tránh toàn bộ batch fail khi 1 địa chỉ bị lỗi.
 */
const sendEmail = async ({ to, subject, html, userId = null }) => {
  const resend = getResendClient();

  if (!resend) {
    logger.warn('Resend chưa được cấu hình - email không gửi được');
    if (userId) {
      await logEvent({
        userId,
        eventType: EVENT_TYPES.EMAIL_FAILED,
        level: 'warning',
        message: 'Email không gửi được: RESEND_API_KEY chưa được cấu hình',
      });
    }
    return { success: false, message: 'Email service chưa cấu hình' };
  }

  const recipients = Array.isArray(to) ? to : [to];
  const fromAddress = process.env.EMAIL_FROM || 'AdsPro <onboarding@resend.dev>';

  const results = [];
  for (const recipient of recipients) {
    try {
      const result = await resend.emails.send({
        from: fromAddress,
        to: [recipient],
        subject,
        html,
      });
      results.push({ email: recipient, success: true, id: result.data?.id });
    } catch (err) {
      logger.error(`Send email error to ${recipient}:`, err.message);
      results.push({ email: recipient, success: false, message: err.message });
    }
  }

  const anySuccess = results.some(r => r.success);
  const successList = results.filter(r => r.success).map(r => r.email);
  const failList = results.filter(r => !r.success).map(r => r.email);

  if (anySuccess && userId) {
    await logEvent({
      userId,
      eventType: EVENT_TYPES.EMAIL_SENT,
      level: failList.length > 0 ? 'warning' : 'success',
      message: `Email đã gửi đến ${successList.join(', ')}: ${subject}${failList.length > 0 ? ` | Thất bại: ${failList.join(', ')}` : ''}`,
    });
  } else if (!anySuccess && userId) {
    await logEvent({
      userId,
      eventType: EVENT_TYPES.EMAIL_FAILED,
      level: 'error',
      message: `Lỗi gửi email đến ${recipients.join(', ')}: ${results.map(r => r.message).join('; ')}`,
    });
  }

  if (!anySuccess) {
    return { success: false, message: results.map(r => r.message).join('; ') };
  }

  return { success: true, sent: successList, failed: failList, id: results.find(r => r.success)?.id };
};

/**
 * Tạo HTML báo cáo sáng
 */
const buildDailyReportHtml = (data) => {
  const { date, platforms } = data;

  const platformLabels = { google: 'Google Ads', facebook: 'Facebook Ads', tiktok: 'TikTok Ads' };
  const platformColors = { google: '#4285F4', facebook: '#1877F2', tiktok: '#FE2C55' };
  const platformIcons  = { google: '🔵', facebook: '🔷', tiktok: '🔴' };

  let totalSpendAll = 0;
  let totalCampaigns = 0;
  const platformEntries = Object.entries(platforms);

  for (const [, info] of platformEntries) {
    totalSpendAll += info.totalSpend || 0;
    totalCampaigns += info.activeCampaigns || 0;
  }

  // Xây platform cards
  let platformsHtml = '';
  for (const [platformKey, info] of platformEntries) {
    const color = platformColors[platformKey];
    const label = platformLabels[platformKey];
    const icon  = platformIcons[platformKey];
    const spend = info.totalSpend || 0;
    const pct   = totalSpendAll > 0 ? Math.round((spend / totalSpendAll) * 100) : 0;

    // Metrics row
    const metrics = [
      { label: 'Chi tiêu', value: `₫${formatCurrency(spend)}`, bold: true },
      ...(info.clicks > 0    ? [{ label: 'Clicks',     value: formatNumber(info.clicks) }] : []),
      ...(info.impressions > 0 ? [{ label: 'Impressions', value: formatNumber(info.impressions) }] : []),
      ...(info.cpc > 0       ? [{ label: 'CPC',        value: `₫${formatCurrency(info.cpc)}` }] : []),
      ...(info.ctr > 0       ? [{ label: 'CTR',        value: `${(info.ctr).toFixed(2)}%` }] : []),
    ];

    const metricCols = metrics.map(m => `
      <td style="padding:10px 12px;text-align:center;border-right:1px solid #F1F5F9;">
        <div style="font-size:11px;color:#94A3B8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">${m.label}</div>
        <div style="font-size:15px;font-weight:${m.bold ? '700' : '600'};color:${m.bold ? color : '#1E293B'};">${m.value}</div>
      </td>`).join('');

    // Alerts
    const hasAlerts = info.alerts && info.alerts.length > 0;
    let alertsHtml = '';
    if (hasAlerts) {
      alertsHtml = info.alerts.map(a => {
        const bg   = a.type === 'error' ? '#FEF2F2' : a.type === 'warning' ? '#FFFBEB' : '#EFF6FF';
        const tc   = a.type === 'error' ? '#B91C1C' : a.type === 'warning' ? '#B45309' : '#1D4ED8';
        const ico  = a.type === 'error' ? '🔴' : a.type === 'warning' ? '⚠️' : 'ℹ️';
        return `<div style="background:${bg};color:${tc};padding:7px 10px;border-radius:6px;font-size:12px;margin-bottom:5px;">${ico} ${a.message}</div>`;
      }).join('');
    } else {
      alertsHtml = `<div style="color:#16A34A;font-size:12px;">✅ Hoạt động bình thường</div>`;
    }

    platformsHtml += `
    <div style="background:#FFFFFF;border-radius:12px;margin-bottom:14px;overflow:hidden;border:1px solid #E2E8F0;">
      <!-- Platform header -->
      <div style="background:${color}12;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid ${color}22;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:4px;height:20px;background:${color};border-radius:2px;display:inline-block;vertical-align:middle;"></div>
          <span style="font-size:15px;font-weight:700;color:#1E293B;vertical-align:middle;">${label}</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:12px;color:#64748B;">${info.activeCampaigns || 0} chiến dịch</span>
          <span style="font-size:12px;font-weight:600;color:#FFFFFF;background:${color};padding:2px 8px;border-radius:20px;">${pct}%</span>
        </div>
      </div>
      <!-- Metrics -->
      <table style="width:100%;border-collapse:collapse;">
        <tr>${metricCols}</tr>
      </table>
      <!-- Alerts -->
      <div style="padding:10px 14px;background:#FAFAFA;border-top:1px solid #F1F5F9;">
        ${alertsHtml}
      </div>
    </div>`;
  }

  // Tóm tắt alerts toàn hệ thống
  const allAlerts = platformEntries.flatMap(([, info]) => info.alerts || []);
  const warnCount = allAlerts.filter(a => a.type === 'warning' || a.type === 'error').length;
  const statusBadge = warnCount > 0
    ? `<span style="background:#FEF3C7;color:#92400E;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:600;">⚠️ ${warnCount} cảnh báo</span>`
    : `<span style="background:#DCFCE7;color:#15803D;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:600;">✅ Tất cả ổn định</span>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Báo cáo AdsPro</title></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:20px 16px;">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#4F46E5 0%,#7C3AED 100%);color:#FFFFFF;padding:20px 24px;border-radius:14px 14px 0 0;">
    <div style="display:flex;align-items:center;justify-content:space-between;">
      <div>
        <div style="font-size:11px;opacity:0.75;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">AdsPro</div>
        <div style="font-size:20px;font-weight:700;">Báo cáo hàng ngày</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:11px;opacity:0.75;">Ngày</div>
        <div style="font-size:16px;font-weight:600;">${dayjs(date).format('DD/MM/YYYY')}</div>
      </div>
    </div>
  </div>

  <!-- Summary -->
  <div style="background:#FFFFFF;padding:20px 24px;border-bottom:1px solid #E2E8F0;">
    <div style="display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:12px;">
      <div>
        <div style="font-size:11px;color:#94A3B8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Tổng chi tiêu hôm qua</div>
        <div style="font-size:32px;font-weight:800;color:#4F46E5;line-height:1;">₫${formatCurrency(totalSpendAll)}</div>
        <div style="font-size:12px;color:#64748B;margin-top:6px;">${platformEntries.length} nền tảng &nbsp;·&nbsp; ${totalCampaigns} chiến dịch đang chạy</div>
      </div>
      <div style="text-align:right;">
        ${statusBadge}
      </div>
    </div>
  </div>

  <!-- Platform cards -->
  <div style="padding:16px 0;">
    ${platformsHtml}
  </div>

  <!-- Footer -->
  <div style="text-align:center;padding:12px;font-size:11px;color:#94A3B8;">
    Gửi lúc ${dayjs().format('HH:mm')} &nbsp;·&nbsp; AdsPro Tự động &nbsp;·&nbsp; ${dayjs().format('DD/MM/YYYY')}
  </div>

</div>
</body>
</html>`;
};

const formatCurrency = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(n));
const formatNumber  = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(n));

/**
 * Gửi báo cáo sáng cho 1 user
 */
const sendDailyReport = async (userId) => {
  try {
    // Lấy emails
    const emails = await getRecipientEmails(userId);
    if (emails.length === 0) {
      logger.warn(`User ${userId} chưa cài đặt email`);
      return { success: false, message: 'Chưa cài đặt email' };
    }

    // Lấy data tổng hợp cho từng platform
    const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
    const platforms = {};

    for (const platform of ['google', 'facebook', 'tiktok']) {
      const accounts = await query(
        `SELECT id FROM ad_accounts WHERE user_id = $1 AND platform = $2`,
        [userId, platform]
      );
      if (accounts.rowCount === 0) continue;

      const accountIds = accounts.rows.map(a => a.id);

      // Metrics hôm qua
      const metricsResult = await query(
        `SELECT
           COALESCE(SUM(spend), 0)       as total_spend,
           COALESCE(SUM(clicks), 0)      as total_clicks,
           COALESCE(SUM(impressions), 0) as total_impressions,
           COALESCE(AVG(NULLIF(cpc,0)), 0) as avg_cpc,
           COALESCE(AVG(NULLIF(ctr,0)), 0) as avg_ctr
         FROM daily_metrics
         WHERE account_id = ANY($1) AND date = $2`,
        [accountIds, yesterday]
      );

      // Số camp đang active
      const activeResult = await query(
        `SELECT COUNT(*) as count FROM campaigns
         WHERE account_id = ANY($1) AND status IN ('ENABLED', 'ACTIVE', 'ENABLE')`,
        [accountIds]
      );

      // Alerts: rules đã chạy hôm qua
      const alertsResult = await query(
        `SELECT rh.target_name, rh.status, rh.message, r.name as rule_name
         FROM rule_history rh
         JOIN rules r ON rh.rule_id = r.id
         WHERE r.user_id = $1 AND r.platform = $2
           AND rh.executed_at >= CURRENT_DATE - INTERVAL '1 day'
         ORDER BY rh.executed_at DESC LIMIT 10`,
        [userId, platform]
      );

      const alerts = alertsResult.rows.map(a => ({
        type: a.status === 'success' ? 'info' : 'warning',
        message: `${a.target_name}: ${a.message || a.rule_name}`,
      }));

      // Token expiring
      const expiringResult = await query(
        `SELECT account_name, token_expires_at FROM ad_accounts
         WHERE user_id = $1 AND platform = $2
           AND token_expires_at IS NOT NULL
           AND token_expires_at < CURRENT_TIMESTAMP + INTERVAL '7 days'`,
        [userId, platform]
      );
      expiringResult.rows.forEach(a => {
        alerts.push({
          type: 'warning',
          message: `Token ${a.account_name} sắp hết hạn`,
        });
      });

      const m = metricsResult.rows[0];
      platforms[platform] = {
        totalSpend:      Number(m.total_spend),
        clicks:          Number(m.total_clicks),
        impressions:     Number(m.total_impressions),
        cpc:             Number(m.avg_cpc),
        ctr:             Number(m.avg_ctr),
        activeCampaigns: Number(activeResult.rows[0].count),
        alerts,
      };
    }

    if (Object.keys(platforms).length === 0) {
      logger.info(`User ${userId} chưa kết nối tài khoản nào`);
      return { success: false, message: 'Chưa có tài khoản nào' };
    }

    const html = buildDailyReportHtml({ date: dayjs().format('YYYY-MM-DD'), platforms });

    return await sendEmail({
      to: emails,
      subject: `AdsPro — Báo cáo sáng ${dayjs().format('DD/MM/YYYY')}`,
      html,
      userId,
    });

  } catch (err) {
    logger.error('Daily report error:', err);
    return { success: false, message: err.message };
  }
};

/**
 * Thông báo khi rule kích hoạt
 */
const sendRuleNotification = async ({ ruleName, objectName, objectType, platform, accountName, actionMessage, conditions, alertType = 'info' }) => {
  try {
    // Lấy tất cả admin users (vì chỉ có 1 admin nên dùng query đơn giản)
    const userResult = await query(`SELECT id FROM users LIMIT 1`);
    if (userResult.rowCount === 0) return { success: false };

    const userId = userResult.rows[0].id;
    const emails = await getRecipientEmails(userId);
    if (emails.length === 0) return { success: false, message: 'Chưa cài đặt email' };

    const platformLabels = { google: 'Google Ads', facebook: 'Facebook Ads', tiktok: 'TikTok Ads' };
    const headerColor = alertType === 'warning' ? '#D97706' : alertType === 'error' ? '#DC2626' : '#2563EB';

    const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:${headerColor};color:#FFFFFF;padding:20px;border-radius:12px 12px 0 0;">
      <h1 style="margin:0;font-size:18px;">⚡ Rule kích hoạt</h1>
      <div style="font-size:13px;opacity:0.9;margin-top:4px;">${ruleName}</div>
    </div>
    <div style="background:#FFFFFF;padding:24px;border-radius:0 0 12px 12px;">
      <div style="margin-bottom:16px;">
        <div style="font-size:12px;color:#64748B;margin-bottom:4px;">Đối tượng</div>
        <div style="font-size:15px;font-weight:600;color:#1E293B;">${objectName}</div>
        <div style="font-size:12px;color:#94A3B8;margin-top:2px;">${platformLabels[platform]} · ${accountName}</div>
      </div>
      <div style="background:#F1F5F9;padding:14px;border-radius:8px;margin-bottom:16px;">
        <div style="font-size:13px;color:#1E293B;">${actionMessage}</div>
      </div>
      <div style="font-size:12px;color:#94A3B8;border-top:1px solid #E2E8F0;padding-top:12px;">
        Thời gian: ${dayjs().format('HH:mm DD/MM/YYYY')}
      </div>
    </div>
  </div>
</body>
</html>`;

    return await sendEmail({
      to: emails,
      subject: `[AdsPro] ${ruleName} → ${objectName}`,
      html,
      userId,
    });

  } catch (err) {
    logger.error('Rule notification error:', err);
    return { success: false, message: err.message };
  }
};

/**
 * Test email
 */
const sendTestEmail = async (userId, toEmail) => {
  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,sans-serif;">
  <div style="max-width:500px;margin:30px auto;padding:24px;background:#FFFFFF;border-radius:12px;">
    <h1 style="color:#2563EB;font-size:20px;margin:0 0 12px 0;">AdsPro — Email Test</h1>
    <p style="color:#1E293B;line-height:1.6;">Email test thành công!</p>
    <p style="color:#64748B;font-size:13px;">Hệ thống email của bạn đã được cấu hình đúng và sẵn sàng gửi báo cáo hằng ngày.</p>
    <div style="font-size:12px;color:#94A3B8;margin-top:20px;">${dayjs().format('HH:mm DD/MM/YYYY')}</div>
  </div>
</body>
</html>`;

  return await sendEmail({
    to: toEmail,
    subject: '[AdsPro] Email Test',
    html,
    userId,
  });
};

module.exports = {
  sendEmail,
  sendDailyReport,
  sendRuleNotification,
  sendTestEmail,
};
