// Report aggregation is independent of delivery so previews never send email.
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[ch]));
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
const formatNumber = value => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value);
const formatMoney = (value, currency, rate = false) => value == null ? '—' : new Intl.NumberFormat('vi-VN', {
  style: 'currency', currency, maximumFractionDigits: rate ? 4 : (currency === 'JPY' || currency === 'VND' ? 0 : 2),
}).format(value);
const ratio = (spend, count, multiplier = 1) => count > 0 ? spend / count * multiplier : null;

const REPORT_TYPES = {
  google: { label: 'Nhóm chiến dịch · TrueView', columns: [['spend', 'Chi tiêu', 'money'], ['cpv', 'CPV', 'rate'], ['video_views', 'TrueView']] },
  tiktok_views: { label: 'Lượt xem video', columns: [['spend', 'Chi tiêu', 'money'], ['video_views', 'Tổng lượt xem'], ['cpv', 'CPV', 'rate'], ['impressions', 'Hiển thị']] },
  tiktok_follows: { label: 'Tăng Follow TikTok', columns: [['spend', 'Chi tiêu', 'money'], ['follows', 'Follow'], ['cpf', 'CPF', 'rate'], ['impressions', 'Hiển thị']] },
  tiktok_other: { label: 'Chiến dịch khác', columns: [['spend', 'Chi tiêu', 'money'], ['video_views', 'Views'], ['follows', 'Follows'], ['conversions', 'Kết quả']] },
  facebook_jpy: { label: 'Tài khoản JPY', columns: [['spend', 'Tổng chi tiêu', 'money'], ['impressions', 'Lượt hiển thị'], ['cpc', 'CPC', 'rate'], ['cpm', 'CPM', 'rate']] },
  facebook_engagements: { label: 'Lượt tương tác bài viết', columns: [['spend', 'Chi tiêu', 'money'], ['engagements', 'Lượt tương tác'], ['cpe', 'CP/tương tác', 'rate'], ['impressions', 'Hiển thị']] },
  facebook_likes: { label: 'Lượt thích trang', columns: [['spend', 'Chi tiêu', 'money'], ['page_likes', 'Lượt thích trang'], ['cpp_like', 'CP/lượt thích', 'rate'], ['impressions', 'Hiển thị']] },
  other: { label: 'Chiến dịch khác', columns: [['spend', 'Chi tiêu', 'money'], ['impressions', 'Hiển thị'], ['conversions', 'Kết quả']] },
};

const getReportType = (platform, currency, campaign) => {
  if (platform === 'google') return 'google';
  if (platform === 'facebook' && currency === 'JPY') return 'facebook_jpy';
  const name = normalize(campaign.name);
  if (platform === 'tiktok') {
    if (/tang follow|tang nguoi theo doi/.test(name)) return 'tiktok_follows';
    if (/so luot xem video|luot xem video/.test(name)) return 'tiktok_views';
    return 'tiktok_other';
  }
  if (platform === 'facebook') {
    if (/luot thich trang|thich trang|page likes/.test(name) || campaign.objective === 'PAGE_LIKES') return 'facebook_likes';
    if (/luot tuong tac bai viet|tuong tac bai viet/.test(name)) return 'facebook_engagements';
  }
  return 'other';
};

const getProjectCode = name => String(name || '').trim().match(/^(\d+(?:\.\d+)+)\s*[|｜–—-]/u)?.[1] || null;
const withRates = row => ({ ...row,
  cpv: ratio(row.spend, row.video_views), cpf: ratio(row.spend, row.follows),
  cpc: ratio(row.spend, row.clicks), cpm: ratio(row.spend, row.impressions, 1000),
  cpe: ratio(row.spend, row.engagements), cpp_like: ratio(row.spend, row.page_likes),
});

const SUM_FIELDS = ['spend', 'impressions', 'clicks', 'video_views', 'follows', 'engagements', 'conversions'];
const emptyMetrics = () => Object.fromEntries(SUM_FIELDS.map(key => [key, 0]).concat([['page_likes', 0]]));
const addMetrics = (target, source) => {
  for (const key of SUM_FIELDS) target[key] += number(source[key]);
  // A missing historical metric is unknown, not zero.
  target.page_likes = target.page_likes == null || source.page_likes == null ? null : target.page_likes + number(source.page_likes);
};

const buildDailyReportData = ({ date, accounts, campaigns }) => {
  const accountMap = new Map(accounts.map(account => [String(account.id), account]));
  const groups = new Map();
  for (const account of accounts) {
    const platform = account.platform;
    const currency = (account.currency || 'VND').toUpperCase();
    const groupName = account.group_name || 'Chưa phân nhóm';
    const key = JSON.stringify([platform, groupName, currency]);
    if (!groups.has(key)) groups.set(key, { platform, currency, groupName, activeIds: new Set(), rows: new Map() });
  }
  for (const campaign of campaigns) {
    const account = accountMap.get(String(campaign.account_id));
    if (!account) continue;
    const currency = (account.currency || 'VND').toUpperCase();
    const group = groups.get(JSON.stringify([account.platform, account.group_name || 'Chưa phân nhóm', currency]));
    const identity = JSON.stringify([account.id, campaign.id]);
    if (['ENABLED', 'ACTIVE', 'ENABLE'].includes(campaign.status)) group.activeIds.add(identity);
    if (number(campaign.spend) <= 0) continue;
    const type = getReportType(account.platform, currency, campaign);
    const projectCode = getProjectCode(campaign.name);
    const key = JSON.stringify([type, projectCode || identity]);
    if (!group.rows.has(key)) group.rows.set(key, { ...emptyMetrics(), type, name: projectCode || campaign.name, campaignIds: new Set(), titles: new Set() });
    const row = group.rows.get(key);
    row.campaignIds.add(identity);
    if (projectCode) {
      const title = String(campaign.name).replace(/^\d+(?:\.\d+)+\s*[|｜–—-]\s*/u, '').split(/[|｜]/u)[0].trim();
      if (title) row.titles.add(title);
    }
    let dailyRaw = campaign.daily_raw_metrics || {};
    if (typeof dailyRaw === 'string') { try { dailyRaw = JSON.parse(dailyRaw); } catch { dailyRaw = {}; } }
    addMetrics(row, { ...campaign, page_likes: dailyRaw.page_likes ?? null });
  }
  const platforms = {};
  const totalsByCurrency = {};
  let activeCampaigns = 0;
  for (const group of groups.values()) {
    const types = new Map();
    for (const row of group.rows.values()) {
      if (!types.has(row.type)) types.set(row.type, []);
      const { campaignIds, titles, ...metrics } = row;
      types.get(row.type).push(withRates({ ...metrics, titles: [...titles], campaignCount: campaignIds.size }));
    }
    const sections = [...types].map(([type, rows]) => {
      rows.sort((a, b) => b.spend - a.spend);
      const totals = emptyMetrics();
      for (const row of rows) addMetrics(totals, row);
      return { type, rows, totals: withRates(totals) };
    });
    const spend = sections.reduce((sum, section) => sum + section.totals.spend, 0);
    activeCampaigns += group.activeIds.size;
    totalsByCurrency[group.currency] = (totalsByCurrency[group.currency] || 0) + spend;
    if (!platforms[group.platform]) platforms[group.platform] = { groups: [], totalsByCurrency: {} };
    const platform = platforms[group.platform];
    platform.totalsByCurrency[group.currency] = (platform.totalsByCurrency[group.currency] || 0) + spend;
    platform.groups.push({ groupName: group.groupName, currency: group.currency, activeCampaigns: group.activeIds.size, totalSpend: spend, sections });
  }
  for (const platform of Object.values(platforms)) platform.groups.sort((a, b) => a.currency.localeCompare(b.currency) || b.totalSpend - a.totalSpend);
  const orderedPlatforms = Object.fromEntries(['google', 'tiktok', 'facebook'].filter(key => platforms[key]).map(key => [key, platforms[key]]));
  return { date, platforms: orderedPlatforms, totalsByCurrency, activeCampaigns };
};

const buildDailyReportHtml = data => {
  const { date, platforms, totalsByCurrency, activeCampaigns } = data;
  const config = {
    google: { label: 'Google Ads', color: '#188653', tint: '#EDF8F1', icon: 'G', description: 'Hiệu suất TrueView theo dự án' },
    tiktok: { label: 'TikTok Ads', color: '#0F766E', tint: '#E9F8F6', icon: 'T', description: 'Lượt xem & tăng trưởng người theo dõi' },
    facebook: { label: 'Facebook Ads', color: '#2563EB', tint: '#EFF5FF', icon: 'f', description: 'Hiệu suất theo mục tiêu & tiền tệ' },
  };
  const moneyTotals = totals => Object.entries(totals).map(([currency, value]) =>
    `<span style="display:inline-block;white-space:nowrap;">${escapeHtml(formatMoney(value, currency))}<span style="font-size:10px;font-weight:500;color:#7C8CA3;margin-left:5px;">${escapeHtml(currency)}</span></span>`
  ).join('<span style="color:#CBD5E1;padding:0 8px;">/</span>');
  const renderCell = (row, [key, label, format], currency, total = false) => {
    const value = row[key];
    const text = value == null ? '—' : format === 'money' || format === 'rate'
      ? formatMoney(value, currency, format === 'rate') : formatNumber(value);
    return `<td class="metric-cell" style="padding:15px 10px;text-align:right;vertical-align:middle;white-space:nowrap;font-size:12px;font-weight:${format === 'money' || total ? '700' : '500'};color:${format === 'money' || total ? '#14243B' : '#475569'};font-variant-numeric:tabular-nums;border-bottom:1px solid #EDF1F6;"><span class="mobile-label" style="display:none;font-size:10px;font-weight:500;color:#7C8CA3;margin-bottom:5px;">${escapeHtml(label)}</span>${escapeHtml(text)}</td>`;
  };
  let projectCount = 0;
  for (const info of Object.values(platforms)) for (const group of info.groups) for (const section of group.sections) projectCount += section.rows.length;
  const content = Object.entries(platforms).map(([platform, info], platformIndex) => {
    const cfg = config[platform];
    const groups = info.groups.map(group => {
      const sections = group.sections.map(section => {
        const reportType = REPORT_TYPES[section.type];
        const rows = section.rows.map((row, index) => `<tr class="campaign-row" style="background:${index % 2 ? '#FAFCFE' : '#FFFFFF'};">
          <th scope="row" class="campaign-name" style="padding:15px 12px;text-align:left;vertical-align:middle;font-weight:600;color:#24354C;border-bottom:1px solid #EDF1F6;overflow-wrap:anywhere;">
            <span style="font-size:12px;line-height:1.6;">${escapeHtml(row.name)}</span>
            ${row.titles.length ? `<br><span style="font-size:11px;line-height:1.6;font-weight:400;color:#64748B;">${escapeHtml(row.titles.join(' / '))}</span>` : ''}
            <br><span style="display:inline-block;margin-top:5px;font-size:10px;line-height:1.6;font-weight:500;color:${cfg.color};background:${cfg.tint};padding:2px 7px;border-radius:4px;">${row.campaignCount} chiến dịch</span>
          </th>${reportType.columns.map(column => renderCell(row, column, group.currency)).join('')}</tr>`).join('');
        return `<div style="padding:18px 0 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:0 16px 12px;font-size:12px;font-weight:700;color:#475569;">${escapeHtml(reportType.label)}</td><td style="padding:0 16px 12px;text-align:right;font-size:10px;color:#94A3B8;white-space:nowrap;">${section.rows.length} nhóm</td></tr></table>
          <table class="metrics-table" role="table" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;table-layout:auto;font-size:12px;">
            <thead><tr style="background:#F5F8FC;"><th scope="col" style="padding:11px 12px;text-align:left;font-size:9px;font-weight:600;color:#7C8CA3;letter-spacing:0.6px;text-transform:uppercase;">Nhóm chiến dịch</th>${reportType.columns.map(([, label]) => `<th scope="col" style="padding:11px 10px;text-align:right;font-size:9px;font-weight:600;color:#7C8CA3;letter-spacing:0.4px;text-transform:uppercase;">${escapeHtml(label)}</th>`).join('')}</tr></thead>
            <tbody>${rows}<tr class="campaign-row total-row" style="background:${cfg.tint};"><th scope="row" class="campaign-name" style="padding:14px 12px;text-align:left;font-size:11px;font-weight:700;color:${cfg.color};">Tổng cộng</th>${reportType.columns.map(column => renderCell(section.totals, column, group.currency, true)).join('')}</tr></tbody>
          </table>
        </div>`;
      }).join('');
      return `<div style="margin-top:16px;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;background:#FFFFFF;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAFCFE;border-bottom:1px solid #E8EEF5;"><tr>
          <td style="padding:15px 16px;border-left:3px solid ${cfg.color};"><span style="font-size:13px;font-weight:700;color:#24354C;">${escapeHtml(group.groupName)}</span><br><span style="display:inline-block;margin-top:5px;font-size:10px;color:#8290A4;">${group.activeCampaigns} chiến dịch đang chạy &nbsp;·&nbsp; ${escapeHtml(group.currency)}</span></td>
          <td style="padding:15px 16px;text-align:right;vertical-align:top;"><span style="font-size:9px;color:#94A3B8;text-transform:uppercase;letter-spacing:0.7px;">Chi tiêu nhóm</span><br><span style="font-size:15px;font-weight:700;line-height:1.8;color:${cfg.color};white-space:nowrap;">${escapeHtml(formatMoney(group.totalSpend, group.currency))}</span></td>
        </tr></table>
        ${sections || '<p style="padding:8px 16px 16px;color:#8290A4;font-size:12px;">Không có chi tiêu trong ngày báo cáo.</p>'}
      </div>`;
    }).join('');
    return `<div style="margin-top:${platformIndex ? '34' : '0'}px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td width="48" style="vertical-align:top;"><div style="width:38px;height:38px;line-height:38px;text-align:center;font-size:21px;font-weight:800;border-radius:10px;background:${cfg.tint};color:${cfg.color};">${cfg.icon}</div></td>
        <td style="vertical-align:top;"><h2 style="margin:0;font-size:18px;line-height:1.3;color:#14243B;">${cfg.label}</h2><p style="margin:5px 0 0;font-size:10px;line-height:1.6;color:#8290A4;">${cfg.description}</p></td>
      </tr></table>
      <p style="margin:12px 0 0;padding-bottom:12px;border-bottom:1px solid #E8EEF5;font-size:13px;font-weight:700;color:#334155;">${moneyTotals(info.totalsByCurrency)}</p>
      ${groups}
    </div>`;
  }).join('');
  const displayDate = String(date).split('-').reverse().join('/');
  return `<!DOCTYPE html>
<html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Báo cáo Ads ${escapeHtml(displayDate)}</title>
<style>
@media only screen and (max-width:600px) {
  .outer-padding { padding:12px 8px !important; }
  .content-padding { padding:22px 12px !important; }
  .hero-padding { padding:24px 20px !important; }
  .hero-title { font-size:25px !important; }
  .metrics-table thead { display:none !important; }
  .metrics-table, .metrics-table tbody { display:block !important; width:100% !important; }
  .campaign-row { display:block !important; margin:0 10px 10px !important; border:1px solid #E8EEF5 !important; border-radius:8px !important; overflow:hidden !important; font-size:0 !important; }
  .campaign-name { display:block !important; width:auto !important; padding:12px !important; }
  .metric-cell { display:inline-block !important; width:50% !important; box-sizing:border-box !important; text-align:left !important; padding:11px 12px !important; border-bottom:0 !important; font-size:12px !important; }
  .mobile-label { display:block !important; }
  .total-row .campaign-name { padding-bottom:4px !important; border:0 !important; }
  .summary-stat { padding:12px 10px !important; }
}
</style></head>
<body style="margin:0;padding:0;background:#EEF2F7;font-family:Arial,Helvetica,sans-serif;color:#24354C;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Báo cáo ngày ${escapeHtml(displayDate)} · ${activeCampaigns} chiến dịch · ${projectCount} nhóm theo dự án.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF2F7;"><tr><td class="outer-padding" align="center" style="padding:32px 16px;">
<!--[if mso]><table role="presentation" width="820" align="center"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:820px;margin:0 auto;">
<tr><td style="padding:0 6px 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-size:18px;font-weight:800;letter-spacing:-0.5px;color:#14243B;">Ads<span style="color:#0D9488;">Pro</span><span style="font-size:10px;font-weight:400;letter-spacing:0;color:#8290A4;margin-left:10px;">BÁO CÁO HẰNG NGÀY</span></td><td style="text-align:right;font-size:10px;color:#94A3B8;">${escapeHtml(displayDate)}</td></tr></table></td></tr>
<tr><td class="hero-padding" style="padding:30px 32px;background:#14243B;border-top:4px solid #2DD4BF;border-radius:16px 16px 0 0;">
<p style="margin:0 0 12px;color:#5EEAD4;font-size:10px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;">TỔNG QUAN HIỆU SUẤT</p>
<h1 class="hero-title" style="margin:0;color:#FFFFFF;font-size:30px;font-weight:700;letter-spacing:-0.7px;line-height:1.3;">Báo cáo quảng cáo<br>hằng ngày.</h1>
<p style="margin:14px 0 0;color:#A5B4C8;font-size:12px;line-height:1.8;">Số liệu ngày <strong style="color:#E2E8F0;">${escapeHtml(displayDate)}</strong> · Tổng hợp theo nhóm chiến dịch</p>
</td></tr>
<tr><td style="background:#14243B;padding:0 20px 24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#20324B;border:1px solid #32445C;border-radius:10px;"><tr><td style="padding:16px 18px;border-bottom:1px solid #32445C;"><p style="margin:0 0 8px;font-size:9px;font-weight:600;color:#A5B4C8;letter-spacing:1px;">TỔNG CHI TIÊU</p><div style="font-size:23px;line-height:1.7;font-weight:700;color:#5EEAD4;">${moneyTotals(totalsByCurrency)}</div></td></tr>
<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td class="summary-stat" width="33%" style="padding:14px 18px;"><div style="font-size:21px;font-weight:700;color:#FFFFFF;">${activeCampaigns}</div><div style="margin-top:5px;font-size:10px;line-height:1.5;color:#A5B4C8;">Chiến dịch đang chạy</div></td>
<td class="summary-stat" width="34%" style="padding:14px 18px;border-left:1px solid #32445C;border-right:1px solid #32445C;"><div style="font-size:21px;font-weight:700;color:#FFFFFF;">${projectCount}</div><div style="margin-top:5px;font-size:10px;line-height:1.5;color:#A5B4C8;">Nhóm có chi tiêu</div></td>
<td class="summary-stat" width="33%" style="padding:14px 18px;"><div style="font-size:21px;font-weight:700;color:#FFFFFF;">${Object.keys(platforms).length}</div><div style="margin-top:5px;font-size:10px;line-height:1.5;color:#A5B4C8;">Nền tảng kết nối</div></td>
</tr></table></td></tr></table></td></tr>
<tr><td class="content-padding" style="padding:30px 24px;background:#FFFFFF;">${content}</td></tr>
<tr><td style="padding:20px 24px;background:#F8FAFD;border-top:1px solid #E8EEF5;border-radius:0 0 16px 16px;"><p style="margin:0 0 7px;font-size:11px;font-weight:700;color:#64748B;">Đọc báo cáo nhanh</p><p style="margin:0;font-size:10px;line-height:1.9;color:#8290A4;">Chiến dịch cùng mã dự án được gộp trong từng nhóm tài khoản, mục tiêu và tiền tệ. Các chi phí trên mỗi kết quả được tính từ số tổng.<br>Dấu “—” nghĩa là chưa đủ dữ liệu để tính. JPY và VND được tổng hợp riêng.<br>Dữ liệu ngày hôm trước từ lần đồng bộ gần nhất.</p></td></tr>
<tr><td style="padding:20px 12px 0;text-align:center;font-size:10px;line-height:1.8;color:#94A3B8;"><strong style="color:#64748B;">AdsPro</strong> · Quản lý quảng cáo tập trung<br>Tổng hợp Google Ads, TikTok Ads &amp; Facebook Ads.</td></tr>
</table><!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
};

module.exports = { buildDailyReportData, buildDailyReportHtml, getProjectCode };
