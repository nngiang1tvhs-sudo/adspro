const { Resend } = require('resend');
const { query } = require('../config/database');
const logger = require('../utils/logger');
const { logEvent, EVENT_TYPES } = require('../utils/audit');
const dayjs = require('dayjs');
dayjs.extend(require('dayjs/plugin/utc'));
dayjs.extend(require('dayjs/plugin/timezone'));
const { buildDailyReportData, buildDailyReportHtml } = require('./dailyReport');

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

const formatNumber   = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(n));

const CURRENCY_SYMBOLS = {
  VND: '₫', USD: '$', JPY: '¥', EUR: '€', GBP: '£',
  KRW: '₩', THB: '฿', SGD: 'S$', MYR: 'RM', IDR: 'Rp',
  PHP: '₱', TWD: 'NT$', HKD: 'HK$', AUD: 'A$', CAD: 'CA$',
};
const getCurrencySymbol = (currency) => CURRENCY_SYMBOLS[currency?.toUpperCase()] || (currency || '₫');

/**
 * Gửi báo cáo sáng cho 1 user
 * Phân cấp: platform → nhóm tài khoản/tiền tệ → mục tiêu → mã dự án
 */
const sendDailyReport = async (userId) => {
  try {
    const emails = await getRecipientEmails(userId);
    if (emails.length === 0) {
      logger.warn(`User ${userId} chưa cài đặt email`);
      return { success: false, message: 'Chưa cài đặt email' };
    }

    const yesterday = dayjs().tz(process.env.TIMEZONE || 'Asia/Ho_Chi_Minh').subtract(1, 'day').format('YYYY-MM-DD');
    const accountsResult = await query(
      'SELECT id, platform, group_name, currency FROM ad_accounts WHERE user_id = $1 ORDER BY id',
      [userId]
    );
    if (!accountsResult.rowCount) {
      return { success: false, message: 'Chưa có tài khoản nào' };
    }
    // All campaigns must reach aggregation before any ranking or grouping.
    // Keep missing historical page likes in raw_metrics distinct from a real zero.
    const campaignsResult = await query(
      `SELECT c.id, c.account_id, c.name, c.status, c.objective,
              dm.spend, dm.impressions, dm.clicks, dm.video_views,
              dm.follows, dm.engagements, dm.conversions,
              dm.raw_metrics AS daily_raw_metrics
       FROM campaigns c
       LEFT JOIN daily_metrics dm ON dm.campaign_id = c.id
         AND dm.account_id = c.account_id AND dm.date = $2
       WHERE c.account_id = ANY($1)
       ORDER BY c.id`,
      [accountsResult.rows.map(account => account.id), yesterday]
    );
    const data = buildDailyReportData({ date: yesterday, accounts: accountsResult.rows, campaigns: campaignsResult.rows });
    const html = buildDailyReportHtml(data);

    return await sendEmail({
      to: emails,
      subject: `AdsPro — Báo cáo ngày ${dayjs(yesterday).format('DD/MM/YYYY')}`,
      html,
      userId,
    });

  } catch (err) {
    logger.error('Daily report error:', err);
    return { success: false, message: err.message };
  }
};

const METRIC_CFG = {
  spend:       { label: 'Chi tiêu',    unit: '₫', fmt: 'currency' },
  impressions: { label: 'Impressions', unit: '',   fmt: 'number'   },
  clicks:      { label: 'Clicks',      unit: '',   fmt: 'number'   },
  ctr:         { label: 'CTR',         unit: '%',  fmt: 'decimal'  },
  cpc:         { label: 'CPC',         unit: '₫',  fmt: 'currency' },
  cpm:         { label: 'CPM',         unit: '₫',  fmt: 'currency' },
  result:          { label: 'Kết quả',   unit: '',   fmt: 'number'   },
  cost_per_result: { label: 'CP/KQ',    unit: '₫',  fmt: 'currency' },
  conversions:     { label: 'Conversions', unit: '', fmt: 'number'   },
  cpa:             { label: 'CPA',      unit: '₫',  fmt: 'currency' },
  revenue:     { label: 'Doanh thu',   unit: '₫',  fmt: 'currency' },
  roas:        { label: 'ROAS',        unit: 'x',  fmt: 'decimal'  },
  video_views: { label: 'Views',       unit: '',   fmt: 'number'   },
  cpv:         { label: 'CPV',         unit: '₫',  fmt: 'currency' },
  engagements: { label: 'Tương tác',   unit: '',   fmt: 'number'   },
  follows:     { label: 'Follows',     unit: '',   fmt: 'number'   },
  messages:    { label: 'Messages',    unit: '',   fmt: 'number'   },
  reach:       { label: 'Reach',       unit: '',   fmt: 'number'   },
};

const ACTION_CFG = {
  pause:          { label: 'Đã tắt',         icon: '⏸', color: '#EA580C' },
  enable:         { label: 'Đã bật',          icon: '▶',  color: '#16A34A' },
  pause_failed:   { label: 'Cần tắt thủ công', icon: '⚠️', color: '#DC2626' },
  enable_failed:  { label: 'Cần bật thủ công', icon: '⚠️', color: '#DC2626' },
  notify:         { label: 'Thông báo',       icon: '🔔', color: '#2563EB' },
  warn_complete:  { label: 'Sắp hoàn thành', icon: '⚠️', color: '#D97706' },
  warn_threshold: { label: 'Vượt ngưỡng',    icon: '⚠️', color: '#D97706' },
};

const TYPE_LABELS = { campaign: 'Chiến dịch', ad_group: 'Nhóm quảng cáo', ad: 'Quảng cáo' };
const PLATFORM_LABELS_MAP = { google: 'Google Ads', facebook: 'Facebook Ads', tiktok: 'TikTok Ads' };
const OP_LABELS = { '>': '>', '<': '<', '>=': '≥', '<=': '≤', '=': '=', '!=': '≠' };

const fmtMetricVal = (val, fmt, unit, currencyOverride) => {
  if (val === null || val === undefined) return '—';
  const displayUnit = (fmt === 'currency' && currencyOverride) ? getCurrencySymbol(currencyOverride) : unit;
  if (fmt === 'currency') return displayUnit + formatNumber(val);
  if (fmt === 'decimal')  return val.toFixed(2) + displayUnit;
  return formatNumber(val) + (displayUnit ? ' ' + displayUnit : '');
};

/**
 * Thông báo khi rule kích hoạt
 */
const sendRuleNotification = async ({ ruleName, objectName, objectType, platform, accountName, currency, actionType = 'notify', evaluations = [], failReason = null, note = null }) => {
  try {
    const userResult = await query(`SELECT id FROM users LIMIT 1`);
    if (userResult.rowCount === 0) return { success: false };

    const userId = userResult.rows[0].id;
    const emails = await getRecipientEmails(userId);
    if (emails.length === 0) return { success: false, message: 'Chưa cài đặt email' };

    const cfg         = ACTION_CFG[actionType] || ACTION_CFG.notify;
    const typeLabel   = TYPE_LABELS[objectType] || objectType;
    const platLabel   = PLATFORM_LABELS_MAP[platform] || platform;

    // Bảng điều kiện với giá trị thực tế
    const condRows = evaluations
      .filter(e => e.actualValue !== null && e.condition.metric !== 'time' && e.condition.metric !== 'name')
      .map(e => {
        const mc = METRIC_CFG[e.condition.metric] || { label: e.condition.metric, unit: '', fmt: 'number' };
        const opLbl     = OP_LABELS[e.condition.operator] || e.condition.operator;
        const targetStr = fmtMetricVal(e.condition.value, mc.fmt, mc.unit, currency);
        const actualStr = fmtMetricVal(e.actualValue,     mc.fmt, mc.unit, currency);
        return `<tr>
          <td style="padding:10px 14px;font-size:13px;color:#374151;border-bottom:1px solid #F1F5F9;">${mc.label}</td>
          <td style="padding:10px 14px;font-size:13px;color:#6B7280;text-align:center;border-bottom:1px solid #F1F5F9;">${opLbl} ${targetStr}</td>
          <td style="padding:10px 14px;font-size:13px;font-weight:700;color:${cfg.color};text-align:right;border-bottom:1px solid #F1F5F9;">${actualStr}</td>
        </tr>`;
      }).join('');

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Rule Notification</title></head>
<body style="margin:0;padding:0;background:#F2F4F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
<div style="max-width:520px;margin:0 auto;padding:24px 16px;">
<div style="border-radius:14px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">

  <div style="background:${cfg.color};padding:18px 22px;">
    <div style="font-size:10px;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:5px;">Rule kích hoạt</div>
    <div style="color:#FFFFFF;font-size:18px;font-weight:700;">${cfg.icon} ${cfg.label}: ${objectName}</div>
    <div style="color:rgba(255,255,255,0.8);font-size:13px;margin-top:4px;">${ruleName}</div>
  </div>

  <div style="background:#FFFFFF;padding:20px 22px;">
    <div style="background:#F8FAFC;border-radius:8px;padding:14px 16px;margin-bottom:18px;">
      <div style="font-size:10px;color:#94A3B8;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;">Đối tượng bị tác động</div>
      <div style="font-size:16px;font-weight:700;color:#1E293B;">${objectName}</div>
      <div style="font-size:12px;color:#64748B;margin-top:4px;">${typeLabel} &nbsp;·&nbsp; ${platLabel} &nbsp;·&nbsp; ${accountName}</div>
    </div>

    ${failReason ? `
    <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:12px 16px;margin-bottom:18px;">
      <div style="font-size:12px;color:#B91C1C;line-height:1.5;">${failReason}</div>
    </div>` : ''}

    ${note ? `
    <div style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:8px;padding:12px 16px;margin-bottom:18px;">
      <div style="font-size:12px;color:#075985;line-height:1.5;">${note}</div>
    </div>` : ''}

    ${condRows ? `
    <div style="font-size:10px;color:#94A3B8;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:8px;">Điều kiện kích hoạt</div>
    <div style="border:1px solid #E8ECF0;border-radius:8px;overflow:hidden;">
      <table style="width:100%;border-collapse:collapse;">
        <tr style="background:#F8F9FB;">
          <td style="padding:8px 14px;font-size:10px;font-weight:600;color:#94A3B8;letter-spacing:0.8px;">CHỈ SỐ</td>
          <td style="padding:8px 14px;font-size:10px;font-weight:600;color:#94A3B8;letter-spacing:0.8px;text-align:center;">MỤC TIÊU</td>
          <td style="padding:8px 14px;font-size:10px;font-weight:600;color:#94A3B8;letter-spacing:0.8px;text-align:right;">SỐ LÚC KÍCH HOẠT</td>
        </tr>
        ${condRows}
      </table>
    </div>` : ''}
  </div>

  <div style="background:#F8FAFC;padding:12px 22px;border-top:1px solid #E8ECF0;">
    <div style="font-size:12px;color:#94A3B8;">Thời gian: ${dayjs().format('HH:mm DD/MM/YYYY')} &nbsp;·&nbsp; AdsPro Tự động</div>
  </div>

</div>
</div>
</body>
</html>`;

    const actionLabel = cfg.label;
    return await sendEmail({
      to: emails,
      subject: `[AdsPro] ${actionLabel}: ${objectName} — ${ruleName}`,
      html,
      userId,
    });

  } catch (err) {
    logger.error('Rule notification error:', err);
    return { success: false, message: err.message };
  }
};

/**
 * Cảnh báo lỗi đồng bộ tài khoản
 */
const sendSyncErrorAlert = async ({ userId, accountName, platform, errorMessage, accountId }) => {
  try {
    // Kiểm tra user có bật cảnh báo lỗi đồng bộ không
    const settingsResult = await query(
      'SELECT sync_error_alert_enabled, email_primary, email_secondary FROM user_settings WHERE user_id = $1',
      [userId]
    );
    if (settingsResult.rowCount === 0) return { success: false };
    const settings = settingsResult.rows[0];
    if (!settings.sync_error_alert_enabled) return { success: false, message: 'Tắt cảnh báo lỗi đồng bộ' };

    const emails = [];
    if (settings.email_primary) emails.push(settings.email_primary);
    if (settings.email_secondary) emails.push(settings.email_secondary);
    if (emails.length === 0) return { success: false, message: 'Chưa cài đặt email' };

    const PLATFORM_CFG = {
      google:   { label: 'Google Ads',   color: '#34A853', icon: '▲' },
      facebook: { label: 'Facebook Ads', color: '#1877F2', icon: 'f' },
      tiktok:   { label: 'TikTok Ads',   color: '#010101', icon: '♪' },
    };
    const cfg = PLATFORM_CFG[platform] || { label: platform, color: '#6B7280', icon: '!' };

    const appUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const connectUrl = `${appUrl}/connect`;

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Lỗi đồng bộ tài khoản</title></head>
<body style="margin:0;padding:0;background:#F2F4F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
<div style="max-width:520px;margin:0 auto;padding:24px 16px;">
<div style="border-radius:14px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">

  <div style="background:#DC2626;padding:18px 22px;">
    <div style="font-size:10px;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:5px;">Cảnh báo hệ thống</div>
    <div style="color:#FFFFFF;font-size:18px;font-weight:700;">⚠️ Lỗi đồng bộ tài khoản</div>
    <div style="color:rgba(255,255,255,0.8);font-size:13px;margin-top:4px;">Rule tự động có thể bị ảnh hưởng</div>
  </div>

  <div style="background:#FFFFFF;padding:22px;">
    <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:14px 16px;margin-bottom:18px;">
      <div style="font-size:11px;color:#991B1B;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;">Chi tiết lỗi</div>
      <div style="font-size:13px;color:#7F1D1D;font-family:monospace;">${errorMessage}</div>
    </div>

    <div style="background:#F8FAFC;border-radius:8px;padding:14px 16px;margin-bottom:20px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:36px;height:36px;border-radius:8px;background:${cfg.color};text-align:center;line-height:36px;color:#FFF;font-weight:700;font-size:15px;flex-shrink:0;">${cfg.icon}</div>
        <div>
          <div style="font-size:15px;font-weight:700;color:#1E293B;">${accountName}</div>
          <div style="font-size:12px;color:#64748B;margin-top:2px;">${cfg.label}</div>
        </div>
      </div>
    </div>

    <div style="text-align:center;margin-bottom:8px;">
      <a href="${connectUrl}" style="display:inline-block;background:#2563EB;color:#FFFFFF;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">Kết nối lại tài khoản →</a>
    </div>
    <div style="text-align:center;font-size:11px;color:#94A3B8;">Nhấn vào nút trên để vào trang kết nối và test lại thủ công</div>
  </div>

  <div style="background:#F8FAFC;padding:12px 22px;border-top:1px solid #E8ECF0;">
    <div style="font-size:12px;color:#94A3B8;">Thời gian: ${dayjs().format('HH:mm DD/MM/YYYY')} &nbsp;·&nbsp; AdsPro Tự động</div>
  </div>

</div>
</div>
</body>
</html>`;

    return await sendEmail({
      to: emails,
      subject: `[AdsPro] ⚠️ Lỗi đồng bộ: ${accountName}`,
      html,
      userId,
    });
  } catch (err) {
    logger.error('sendSyncErrorAlert error:', err.message);
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
  sendSyncErrorAlert,
  sendTestEmail,
};
