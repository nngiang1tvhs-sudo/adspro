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
  const platformColors = { google: '#4285F4', facebook: '#1877F2', tiktok: '#010101' };

  let platformsHtml = '';
  let totalSpendAll = 0;

  for (const [platformKey, info] of Object.entries(platforms)) {
    const color = platformColors[platformKey];
    const label = platformLabels[platformKey];
    totalSpendAll += info.totalSpend || 0;

    let alertsHtml = '';
    if (info.alerts && info.alerts.length > 0) {
      alertsHtml = info.alerts.map(a => {
        const icon = a.type === 'error' ? '🔴' : a.type === 'warning' ? '⚠️' : 'ℹ️';
        const bgColor = a.type === 'error' ? '#FEE2E2' : a.type === 'warning' ? '#FEF3C7' : '#DBEAFE';
        const textColor = a.type === 'error' ? '#991B1B' : a.type === 'warning' ? '#92400E' : '#1E40AF';
        return `<div style="background:${bgColor};color:${textColor};padding:8px 12px;border-radius:6px;margin-bottom:6px;font-size:13px;">${icon} ${a.message}</div>`;
      }).join('');
    } else {
      alertsHtml = `<div style="color:#16A34A;font-size:13px;padding:6px 0;">✅ Hoạt động bình thường</div>`;
    }

    platformsHtml += `
      <div style="margin-bottom:24px;padding:16px;background:#FFFFFF;border-radius:10px;border-left:4px solid ${color};">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <div style="font-size:16px;font-weight:600;color:#1E293B;">${label}</div>
          <div style="font-size:13px;color:#64748B;">${info.activeCampaigns || 0} chiến dịch đang chạy</div>
        </div>
        <div style="font-size:13px;color:#64748B;margin-bottom:10px;">Chi tiêu: <strong style="color:#1E293B;">${formatCurrency(info.totalSpend || 0)}</strong></div>
        ${alertsHtml}
      </div>
    `;
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Báo cáo sáng AdsPro</title>
</head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#FFFFFF;padding:24px;border-radius:12px 12px 0 0;">
      <h1 style="margin:0;font-size:22px;">AdsPro — Báo cáo sáng</h1>
      <div style="font-size:14px;opacity:0.9;margin-top:4px;">Ngày ${dayjs(date).format('DD/MM/YYYY')}</div>
    </div>

    <div style="background:#FFFFFF;padding:20px;">
      <div style="background:#EFF6FF;padding:16px;border-radius:8px;margin-bottom:20px;text-align:center;">
        <div style="font-size:13px;color:#64748B;margin-bottom:4px;">Tổng chi tiêu hôm qua</div>
        <div style="font-size:24px;font-weight:600;color:#2563EB;">${formatCurrency(totalSpendAll)}</div>
      </div>

      ${platformsHtml}
    </div>

    <div style="background:#F8FAFC;padding:16px;border-radius:0 0 12px 12px;text-align:center;font-size:12px;color:#94A3B8;">
      Email tự động từ AdsPro · ${dayjs().format('HH:mm DD/MM/YYYY')}
    </div>
  </div>
</body>
</html>`;
};

const formatCurrency = (n) => {
  return new Intl.NumberFormat('vi-VN').format(Math.round(n));
};

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

      // Tổng chi tiêu hôm qua
      const spendResult = await query(
        `SELECT COALESCE(SUM(spend), 0) as total FROM daily_metrics
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

      platforms[platform] = {
        totalSpend: Number(spendResult.rows[0].total),
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
