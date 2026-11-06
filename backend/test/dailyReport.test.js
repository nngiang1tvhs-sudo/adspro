const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildDailyReportData, buildDailyReportHtml, getProjectCode } = require('../src/services/dailyReport');

const date = '2026-11-05';
const account = (id, platform, currency = 'VND', group_name = 'Metub') => ({ id, platform, currency, group_name });
const campaign = (id, account_id, name, metrics = {}) => ({ id, account_id, name, status: 'ACTIVE', ...metrics });
const report = (accounts, campaigns) => buildDailyReportData({ date, accounts, campaigns });
const section = (data, platform, type, currency = 'VND') => data.platforms[platform].groups.find(g => g.currency === currency).sections.find(s => s.type === type);

test('Google merges all campaigns by exact project prefix before ranking and computes CPV from totals', () => {
  const rows = [
    campaign(1, 1, '1.1.2026.54.9 | PHƯƠNG MỸ CHI | A', { spend: '300', video_views: '10' }),
    campaign(2, 1, '1.1.2026.54.9 | PHƯƠNG MỸ CHI | B', { spend: '600', video_views: '20' }),
    campaign(3, 1, '1.1.2026.54.9 | PHƯƠNG MỸ CHI | C', { spend: '100', video_views: '70' }),
    ...Array.from({ length: 6 }, (_, i) => campaign(i + 4, 1, `1.1.2026.54.${i + 10} | Other`, { spend: 5, video_views: 1 })),
  ];
  const data = report([account(1, 'google')], rows);
  const google = section(data, 'google', 'google');
  assert.equal(google.rows.length, 7); // No top-five cutoff before or after grouping.
  assert.equal(google.rows[0].name, '1.1.2026.54.9');
  assert.equal(google.rows[0].campaignCount, 3);
  assert.equal(google.rows[0].spend, 1000);
  assert.equal(google.rows[0].video_views, 100);
  assert.equal(google.rows[0].cpv, 10);
  assert.equal(data.activeCampaigns, 9);
  assert.match(buildDailyReportHtml(data), /TrueView/);
  assert.match(buildDailyReportHtml(data), /PHƯƠNG MỸ CHI/);
});

test('group codes support the screenshot pipe separator and preserve independent names without a numeric prefix', () => {
  assert.equal(getProjectCode('1.1.2026.54.9 | Artist - Song'), '1.1.2026.54.9');
  assert.equal(getProjectCode('1.1.2026.54.9 - Artist'), '1.1.2026.54.9');
  assert.equal(getProjectCode('Artist | Song'), null);
  const data = report([account(1, 'google')], [campaign(1, 1, 'Artist | A', { spend: 1 }), campaign(2, 1, 'Artist | B', { spend: 2 })]);
  assert.equal(section(data, 'google', 'google').rows.length, 2);
});

test('TikTok separates video views from follows even when project codes match', () => {
  const data = report([account(1, 'tiktok')], [
    campaign(1, 1, '1.1.2026.54.9 | Số lượt xem video', { spend: 120, video_views: 1000, impressions: 2000 }),
    campaign(2, 1, '1.1.2026.54.9 | Tăng Follow tiktok', { spend: 300, follows: 60, impressions: 1000 }),
  ]);
  assert.equal(section(data, 'tiktok', 'tiktok_views').rows[0].cpv, 0.12);
  assert.equal(section(data, 'tiktok', 'tiktok_follows').rows[0].cpf, 5);
  const html = buildDailyReportHtml(data);
  assert.match(html, /Tổng lượt xem/);
  assert.match(html, /CPF/);
  assert.match(html, /0,12/); // Small CPV is not rounded to zero.
});

test('Facebook JPY uses spend, impressions, CPC and CPM; VND uses engagement or page-like data', () => {
  const data = report([account(1, 'facebook', 'JPY'), account(2, 'facebook')], [
    campaign(1, 1, '1.1.2026.54.9 | Lượt tương tác bài viết', { spend: 1000, clicks: 40, impressions: 5000 }),
    campaign(2, 2, '1.1.2026.54.9 | Lượt tương tác bài viết', { spend: 600, engagements: 300, impressions: 1000 }),
    campaign(3, 2, '1.1.2026.54.9 | Lượt thích trang', { spend: 400, impressions: 2000, engagements: 999, daily_raw_metrics: { page_likes: 20 } }),
  ]);
  const jpy = section(data, 'facebook', 'facebook_jpy', 'JPY').rows[0];
  assert.equal(jpy.cpc, 25);
  assert.equal(jpy.cpm, 200);
  assert.equal(section(data, 'facebook', 'facebook_engagements').rows[0].cpe, 2);
  const likes = section(data, 'facebook', 'facebook_likes').rows[0];
  assert.equal(likes.page_likes, 20);
  assert.equal(likes.cpp_like, 20);
  assert.deepEqual(data.totalsByCurrency, { JPY: 1000, VND: 1000 });
  assert.equal(data.platforms.facebook.groups.length, 2);
  const html = buildDailyReportHtml(data);
  assert.match(html, /JPY/);
  assert.match(html, /Tổng chi tiêu/);
  assert.match(html, /CPC/);
  assert.match(html, /CPM/);
});

test('project groups never cross account groups or currencies; currencies are totaled separately', () => {
  const data = report([account(1, 'google', 'VND', 'A'), account(2, 'google', 'VND', 'B'), account(3, 'google', 'JPY', 'A')], [
    campaign(1, 1, '1.1.2026.54.9 | A', { spend: 100 }),
    campaign(2, 2, '1.1.2026.54.9 | B', { spend: 200 }),
    campaign(3, 3, '1.1.2026.54.9 | C', { spend: 300 }),
  ]);
  assert.equal(data.platforms.google.groups.length, 3);
  assert.deepEqual(data.totalsByCurrency, { VND: 300, JPY: 300 });
});

test('missing historical page likes remain unknown; actual zero and undefined ratios show no fabricated result', () => {
  const data = report([account(1, 'facebook')], [
    campaign(1, 1, '1.1.2026.54.9 | Lượt thích trang', { spend: 100, daily_raw_metrics: { page_likes: 10 } }),
    campaign(2, 1, '1.1.2026.54.9 | Lượt thích trang', { spend: 100 }),
    campaign(3, 1, '1.1.2026.54.10 | Lượt thích trang', { spend: 100, daily_raw_metrics: { page_likes: 0 } }),
  ]);
  const likes = section(data, 'facebook', 'facebook_likes');
  assert.equal(likes.rows[0].page_likes, null);
  assert.equal(likes.rows[0].cpp_like, null);
  assert.equal(likes.rows[1].page_likes, 0);
  assert.equal(likes.rows[1].cpp_like, null);
  assert.equal(likes.totals.page_likes, null);
  assert.match(buildDailyReportHtml(data), /—/);
});

test('empty data and unrecognized objectives retain explicit fallback; campaign and group names are HTML-escaped', () => {
  const data = report([account(1, 'tiktok', 'VND', '<Group>')], [
    campaign(1, 1, '<img src=x onerror=alert(1)>', { spend: 100, conversions: 5 }),
  ]);
  const html = buildDailyReportHtml(data);
  assert.match(html, /Chiến dịch khác/);
  assert.match(html, /&lt;Group&gt;/);
  assert.ok(!html.includes('<img src=x'));
  assert.match(html, /&lt;img/);
  assert.match(buildDailyReportHtml(report([account(1, 'google')], [])), /Không có chi tiêu/);
});

test('daily report delivery queries the requested date and all campaigns, then renders grouped data without live network', async () => {
  const sent = [], queries = [];
  const filename = path.join(__dirname, '../src/services/emailService.js');
  const context = { module: { exports: {} }, console,
    process: { env: { RESEND_API_KEY: 'test-placeholder', TIMEZONE: 'Asia/Ho_Chi_Minh' } },
    require: name => {
      if (name === 'resend') return { Resend: class { constructor() { this.emails = { send: async payload => { sent.push(payload); return { data: { id: 'fake' } }; } }; } } };
      if (name === '../config/database') return { query: async (sql, params) => {
        queries.push({ sql, params });
        if (sql.includes('FROM user_settings')) return { rowCount: 1, rows: [{ email_primary: 'test@example.invalid' }] };
        if (sql.includes('FROM ad_accounts')) return { rowCount: 1, rows: [account(1, 'google')] };
        if (sql.includes('FROM campaigns c')) return { rowCount: 2, rows: [
          campaign(1, 1, '1.1.2026.54.9 | A', { spend: 100, video_views: 10 }),
          campaign(2, 1, '1.1.2026.54.9 | B', { spend: 100, video_views: 30 }),
        ] };
        throw new Error('Unexpected query');
      } };
      if (name === '../utils/logger') return { warn() {}, info() {}, error() {} };
      if (name === '../utils/audit') return { logEvent: async () => {}, EVENT_TYPES: {} };
      if (name === './dailyReport') return require('../src/services/dailyReport');
      return require(name);
    },
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  const result = await context.module.exports.sendDailyReport(1);
  assert.equal(result.success, true);
  assert.equal(sent.length, 1);
  assert.match(sent[0].html, /2 chiến dịch<\/span>/);
  assert.match(sent[0].html, /CPV/);
  const dailyQuery = queries.find(q => q.sql.includes('FROM campaigns c'));
  assert.ok(!dailyQuery.sql.includes('LIMIT'));
  assert.match(dailyQuery.params[1], /^\d{4}-\d{2}-\d{2}$/);
  assert.match(dailyQuery.sql, /dm\.date = \$2/);
  assert.ok(sent[0].subject.includes(dailyQuery.params[1].split('-').reverse().join('/')));
});

test('Google is reported first regardless of account creation order', () => {
  const data = report([account(1, 'facebook'), account(2, 'tiktok'), account(3, 'google')], []);
  assert.deepEqual(Object.keys(data.platforms), ['google', 'tiktok', 'facebook']);
});

test('Facebook daily sync records page likes separately from post/page engagements', async () => {
  const filename = path.join(__dirname, '../src/services/facebookAdsService.js');
  const context = { module: { exports: {} }, console, Date,
    require: name => {
      if (name === 'axios') return { get: async (_url, { params }) => {
        assert.ok(params.fields.includes('actions'));
        return { data: { data: [{ campaign_id: 'fb', date_start: date, actions: [
          { action_type: 'like', value: '12' },
          { action_type: 'post_engagement', value: '300' },
          { action_type: 'page_engagement', value: '999' },
        ] }, { campaign_id: 'empty', date_start: date, actions: [{ action_type: 'page_engagement', value: '500' }] }] } };
      } };
      if (name === '../utils/logger') return { error() {} };
      if (name === '../utils/encryption') return { decryptCredentials: value => value };
      return require(name);
    },
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  const rows = await context.module.exports.getDailyMetrics({ ad_account_id: 'fixture', access_token: 'fake' }, { from: date, to: date });
  assert.equal(rows[0].page_likes, 12);
  assert.equal(rows[0].engagements, 300);
  assert.equal(rows[1].page_likes, 0);
});
