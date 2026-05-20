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
 * Tạo HTML báo cáo sáng - theo mockup
 */
const buildDailyReportHtml = (data) => {
  const { date, platforms } = data;

  const PLATFORM_CFG = {
    google: {
      label: 'Google Ads',
      iconBg: '#34A853', iconText: '▲',
      badgeBg: '#EBF4FF', badgeColor: '#3B82F6',
      columns: [
        { key: 'spend',       label: 'CHI TIÊU',  fmt: 'currency', color: null },
        { key: 'impressions', label: 'TRUEVIEW',   fmt: 'number',   color: null },
        { key: 'conversions', label: 'KẾT QUẢ',   fmt: 'number',   color: null },
      ],
    },
    tiktok: {
      label: 'TikTok Ads',
      iconBg: '#010101', iconText: '♪',
      badgeBg: '#FFF0F3', badgeColor: '#F43F5E',
      columns: [
        { key: 'spend',       label: 'CHI TIÊU', fmt: 'currency', color: null },
        { key: 'video_views', label: 'VIEWS',    fmt: 'number',   color: null },
        { key: 'follows',     label: 'FOLLOWS',  fmt: 'number',   color: '#F43F5E' },
        { key: 'conversions', label: 'KẾT QUẢ', fmt: 'number',   color: null },
      ],
    },
    facebook: {
      label: 'Facebook Ads',
      iconBg: '#1877F2', iconText: 'f',
      badgeBg: '#EBF4FF', badgeColor: '#3B82F6',
      columns: [
        { key: 'spend',       label: 'CHI TIÊU',  fmt: 'currency', color: null },
        { key: 'follows',     label: 'FOLLOW',     fmt: 'number',   color: '#3B82F6' },
        { key: 'video_views', label: 'VIEW 2S',    fmt: 'number',   color: null },
        { key: 'engagements', label: 'TƯƠNG TÁC',  fmt: 'number',   color: null },
        { key: 'conversions', label: 'KẾT QUẢ',   fmt: 'number',   color: null },
      ],
    },
  };

  let totalSpendAll = 0;
  let totalCampaigns = 0;
  const platformEntries = Object.entries(platforms);
  for (const [, info] of platformEntries) {
    totalSpendAll += info.totalSpend || 0;
    totalCampaigns += info.activeCampaigns || 0;
  }

  let platformsHtml = '';
  for (const [key, info] of platformEntries) {
    const cfg = PLATFORM_CFG[key];
    if (!cfg) continue;

    // Header columns
    const thCells = cfg.columns.map(c =>
      `<td style="padding:9px 12px;text-align:right;font-size:10px;font-weight:600;color:#94A3B8;letter-spacing:0.8px;white-space:nowrap;">${c.label}</td>`
    ).join('');

    // Campaign rows
    const rows = (info.topCampaigns || []).map((camp, i) => {
      const bg = i % 2 === 0 ? '#FFFFFF' : '#FAFBFC';
      const tds = cfg.columns.map(c => {
        const val = camp[c.key] || 0;
        const txt = c.fmt === 'currency' ? formatShort(val) : formatNumber(val);
        const color = c.color || (c.fmt === 'currency' ? '#1E293B' : '#374151');
        const fw = c.fmt === 'currency' ? '600' : '400';
        return `<td style="padding:10px 12px;text-align:right;font-size:13px;color:${color};font-weight:${fw};white-space:nowrap;">${txt}</td>`;
      }).join('');
      return `<tr style="background:${bg};border-bottom:1px solid #F1F5F9;">
        <td style="padding:10px 12px;font-size:13px;color:#1E293B;">${camp.name}</td>${tds}
      </tr>`;
    }).join('');

    const emptyRow = info.topCampaigns?.length === 0
      ? `<tr><td colspan="${cfg.columns.length + 1}" style="padding:20px;text-align:center;color:#94A3B8;font-size:13px;">Không có dữ liệu cho ngày hôm qua</td></tr>`
      : '';

    platformsHtml += `
    <div style="margin-bottom:28px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:36px;height:36px;border-radius:10px;background:${cfg.iconBg};text-align:center;line-height:36px;color:#FFF;font-weight:700;font-size:16px;flex-shrink:0;">${cfg.iconText}</div>
          <div>
            <div style="font-weight:700;color:#1E293B;font-size:15px;">${cfg.label}</div>
            <div style="color:#94A3B8;font-size:12px;margin-top:1px;">${info.activeCampaigns || 0} chiến dịch đang chạy</div>
          </div>
        </div>
        <div style="background:${cfg.badgeBg};color:${cfg.badgeColor};font-size:15px;font-weight:700;padding:6px 14px;border-radius:8px;white-space:nowrap;">${formatShort(info.totalSpend || 0)}</div>
      </div>
      <div style="border:1px solid #E8ECF0;border-radius:10px;overflow:hidden;">
        <table style="width:100%;border-collapse:collapse;">
          <tr style="background:#F8F9FB;border-bottom:1px solid #E8ECF0;">
            <td style="padding:9px 12px;font-size:10px;font-weight:600;color:#94A3B8;letter-spacing:0.8px;">CHIẾN DỊCH</td>
            ${thCells}
          </tr>
          ${rows}${emptyRow}
        </table>
      </div>
    </div>`;
  }

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Báo cáo Ads hàng ngày</title></head>
<body style="margin:0;padding:0;background:#F2F4F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
<div style="max-width:620px;margin:0 auto;padding:20px 16px;">
<div style="border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);">

  <!-- Dark header -->
  <div style="background:#1C2537;padding:24px;">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:20px;">
      <div>
        <div style="color:#9CA3AF;font-size:10px;font-weight:600;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">DAILY REPORT</div>
        <div style="color:#FFFFFF;font-size:22px;font-weight:700;">Báo cáo Ads hàng ngày</div>
      </div>
      <div style="background:#252F45;border-radius:10px;padding:10px 16px;text-align:center;min-width:90px;">
        <div style="color:#9CA3AF;font-size:10px;margin-bottom:4px;">Ngày</div>
        <div style="color:#FFFFFF;font-size:15px;font-weight:700;">${dayjs(date).format('DD/MM/YYYY')}</div>
      </div>
    </div>
    <div style="display:flex;gap:10px;">
      <div style="flex:1;background:#252F45;border-radius:10px;padding:14px 16px;">
        <div style="color:#9CA3AF;font-size:9px;font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">TỔNG CHI TIÊU</div>
        <div style="color:#4DD9C0;font-size:22px;font-weight:700;">${formatShort(totalSpendAll)}</div>
      </div>
      <div style="flex:1;background:#252F45;border-radius:10px;padding:14px 16px;">
        <div style="color:#9CA3AF;font-size:9px;font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">CHIẾN DỊCH</div>
        <div><span style="color:#FFFFFF;font-size:22px;font-weight:700;">${totalCampaigns}</span><span style="color:#9CA3AF;font-size:12px;margin-left:6px;">đang chạy</span></div>
      </div>
      <div style="flex:1;background:#252F45;border-radius:10px;padding:14px 16px;">
        <div style="color:#9CA3AF;font-size:9px;font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">NỀN TẢNG</div>
        <div><span style="color:#FFFFFF;font-size:22px;font-weight:700;">${platformEntries.length}</span><span style="color:#9CA3AF;font-size:12px;margin-left:6px;">kênh</span></div>
      </div>
    </div>
  </div>

  <!-- Content -->
  <div style="background:#FFFFFF;padding:24px;">
    ${platformsHtml}
  </div>

  <!-- Footer -->
  <div style="background:#F8FAFC;padding:16px;text-align:center;border-top:1px solid #E8ECF0;">
    <div style="color:#94A3B8;font-size:12px;">Báo cáo tự động · Dữ liệu cập nhật lúc 07:00 AM</div>
    <div style="color:#94A3B8;font-size:12px;margin-top:4px;">— Ads Team —</div>
  </div>

</div>
</div>
</body>
</html>`;
};

const formatShort = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(n));
const formatCurrency = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(n));
const formatNumber   = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(n));

/**
 * Gửi báo cáo sáng cho 1 user
 */
const sendDailyReport = async (userId) => {
  try {
    const emails = await getRecipientEmails(userId);
    if (emails.length === 0) {
      logger.warn(`User ${userId} chưa cài đặt email`);
      return { success: false, message: 'Chưa cài đặt email' };
    }

    const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
    const platforms = {};

    for (const platform of ['google', 'tiktok', 'facebook']) {
      const accounts = await query(
        `SELECT id FROM ad_accounts WHERE user_id = $1 AND platform = $2`,
        [userId, platform]
      );
      if (accounts.rowCount === 0) continue;

      const accountIds = accounts.rows.map(a => a.id);

      // Tổng metrics hôm qua
      const totalsResult = await query(
        `SELECT COALESCE(SUM(spend), 0) as total_spend
         FROM daily_metrics
         WHERE account_id = ANY($1) AND date = $2`,
        [accountIds, yesterday]
      );

      // Số chiến dịch đang active
      const activeResult = await query(
        `SELECT COUNT(*) as count FROM campaigns
         WHERE account_id = ANY($1) AND status IN ('ENABLED', 'ACTIVE', 'ENABLE')`,
        [accountIds]
      );

      // Top 5 chiến dịch chi tiêu nhiều nhất hôm qua
      const campaignsResult = await query(
        `SELECT c.name,
                COALESCE(dm.spend, 0)         AS spend,
                COALESCE(dm.impressions, 0)   AS impressions,
                COALESCE(dm.video_views, 0)   AS video_views,
                COALESCE(dm.follows, 0)       AS follows,
                COALESCE(dm.engagements, 0)   AS engagements,
                COALESCE(dm.conversions, 0)   AS conversions
         FROM campaigns c
         INNER JOIN daily_metrics dm ON dm.campaign_id = c.id AND dm.date = $2
         WHERE c.account_id = ANY($1) AND dm.spend > 0
         ORDER BY dm.spend DESC
         LIMIT 5`,
        [accountIds, yesterday]
      );

      platforms[platform] = {
        totalSpend:      Number(totalsResult.rows[0].total_spend),
        activeCampaigns: Number(activeResult.rows[0].count),
        topCampaigns:    campaignsResult.rows.map(r => ({
          name:        r.name,
          spend:       Number(r.spend),
          impressions: Number(r.impressions),
          video_views: Number(r.video_views),
          follows:     Number(r.follows),
          engagements: Number(r.engagements),
          conversions: Number(r.conversions),
        })),
      };
    }

    if (Object.keys(platforms).length === 0) {
      logger.info(`User ${userId} chưa kết nối tài khoản nào`);
      return { success: false, message: 'Chưa có tài khoản nào' };
    }

    const html = buildDailyReportHtml({ date: yesterday, platforms });

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
  conversions: { label: 'Conversions', unit: '',   fmt: 'number'   },
  cpa:         { label: 'CPA',         unit: '₫',  fmt: 'currency' },
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
  notify:         { label: 'Thông báo',       icon: '🔔', color: '#2563EB' },
  warn_complete:  { label: 'Sắp hoàn thành', icon: '⚠️', color: '#D97706' },
  warn_threshold: { label: 'Vượt ngưỡng',    icon: '⚠️', color: '#D97706' },
};

const TYPE_LABELS = { campaign: 'Chiến dịch', ad_group: 'Nhóm quảng cáo', ad: 'Quảng cáo' };
const PLATFORM_LABELS_MAP = { google: 'Google Ads', facebook: 'Facebook Ads', tiktok: 'TikTok Ads' };
const OP_LABELS = { '>': '>', '<': '<', '>=': '≥', '<=': '≤', '=': '=', '!=': '≠' };

const fmtMetricVal = (val, fmt, unit) => {
  if (val === null || val === undefined) return '—';
  if (fmt === 'currency') return unit + formatNumber(val);
  if (fmt === 'decimal')  return val.toFixed(2) + unit;
  return formatNumber(val) + (unit ? ' ' + unit : '');
};

/**
 * Thông báo khi rule kích hoạt
 */
const sendRuleNotification = async ({ ruleName, objectName, objectType, platform, accountName, actionType = 'notify', evaluations = [] }) => {
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
        const targetStr = fmtMetricVal(e.condition.value, mc.fmt, mc.unit);
        const actualStr = fmtMetricVal(e.actualValue,     mc.fmt, mc.unit);
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
