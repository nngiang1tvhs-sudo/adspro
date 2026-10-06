const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const load = (file, mocks) => {
  const filename = path.join(__dirname, '../src', file);
  const context = { module: { exports: {} }, console, Date, process,
    require: name => name in mocks ? mocks[name] : require(name) };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  return context.module.exports;
};
const logger = { info() {}, warn() {}, error() {} };
const dates = { from: '2026-04-10', to: '2026-10-06' };
const fixture = ({ unknown = false, failReport = false, smartStatus = 'ENABLE', omitLastCampaign = true } = {}) => {
  const calls = [];
  const ads = Array.from({ length: 101 }, (_, i) => ({
    ad_id: String(9000000000000000000n + BigInt(i)),
    smart_plus_ad_id: String(9100000000000000000n + BigInt(i)),
    ad_name: i === 100 ? 'Video 50K' : 'Video khác', operation_status: 'ENABLE',
    // Last creative lacks campaign_id: use authoritative Smart+ metadata.
    ...(i === 100 && omitLastCampaign ? {} : { campaign_id: 'campaign' }),
  }));
  const axios = async config => {
    const endpoint = config.url.split('/v1.3')[1];
    const params = config.params || config.data;
    calls.push({ endpoint, params });
    let list;
    let data;
    if (endpoint === '/report/integrated/get/') {
      if (failReport) throw new Error('TikTok report unavailable');
      assert.equal(params.start_date, dates.from);
      assert.equal(params.end_date, dates.to);
      list = ads.map(ad => ({ dimensions: { ad_id: ad.ad_id }, metrics: { spend: '50000' } }));
    } else if (endpoint === '/ad/get/') {
      const filter = JSON.parse(params.filtering || '{}');
      list = filter.ad_ids ? ads.filter(ad => filter.ad_ids.includes(ad.ad_id)) : ads;
    } else if (endpoint === '/smart_plus/ad/get/') {
      const ids = JSON.parse(params.filtering).smart_plus_ad_ids;
      assert(ids.length <= 100);
      list = unknown ? [] : ads.filter(ad => ids.includes(ad.smart_plus_ad_id)).map(ad => ({
        smart_plus_ad_id: ad.smart_plus_ad_id, operation_status: smartStatus, campaign_id: 'campaign',
      }));
    } else if (endpoint === '/ad/status/update/') {
      return { data: { code: 40002, message: 'Changes cannot be made to auto-generated assets in a Smart+ campaign' } };
    } else if (endpoint === '/smart_plus/ad/status/update/') {
      assert.equal(params.operation_status, 'DISABLE');
      assert.deepEqual(Array.from(params.smart_plus_ad_ids), [ads[100].smart_plus_ad_id]);
      data = {};
    } else throw new Error('Unexpected endpoint ' + endpoint);
    if (list) {
      const page = params.page || 1, size = Math.min(params.page_size || 100, 100);
      assert(size <= (endpoint === '/smart_plus/ad/get/' ? 100 : 1000));
      data = { list: list.slice((page - 1) * size, page * size), page_info: { total_page: Math.max(1, Math.ceil(list.length / size)) } };
    }
    return { data: { code: 0, data } };
  };
  const service = load('services/tiktokAdsService.js', {
    axios, '../utils/logger': logger,
    '../utils/encryption': { decryptCredentials: x => x },
    '../config/database': { query: async () => ({ rows: [] }) },
  });
  const creds = { advertiser_id: 'account', access_token: 'test-placeholder' };
  return { service, creds, calls, ads };
};

test('101 Smart+ ads: paginate reports and metadata, bound status batches, preserve IDs and parent campaign', async () => {
  const { service, creds, calls, ads } = fixture();
  const result = await service.getAllScopeMetrics(creds, dates, 'ad');
  assert.equal(result.__items__.length, 101);
  assert.equal(result.__items__[100].external_id, ads[100].ad_id);
  assert.equal(result.__items__[100].status, 'ENABLE');
  assert.equal(result.__items__[100].campaign_external_id, 'campaign');
  assert.equal(result[ads[100].ad_id].spend, 50000);
  assert.equal(calls.filter(c => c.endpoint === '/smart_plus/ad/get/').length, 2);
  const displayed = await service.getAds(creds, 'group', dates);
  assert.equal(displayed[100].status, result.__items__[100].status);
});

test('missing Smart+ status stays unknown in both UI and rules, never creative ENABLE', async () => {
  const { service, creds } = fixture({ unknown: true });
  const result = await service.getAllScopeMetrics(creds, dates, 'ad');
  const displayed = await service.getAds(creds, 'group', dates);
  assert.equal(result.__items__[100].status, null);
  assert.equal(displayed[100].status, null);
});

test('report errors propagate instead of becoming an empty successful rules result', async () => {
  const { service, creds } = fixture({ failReport: true });
  await assert.rejects(service.getAllScopeMetrics(creds, dates, 'ad'), /report unavailable/);
});

const runRule = async ({ unknown = false, failReport = false, smartStatus = 'ENABLE', cachedStatus = null, matchedCampaign = true, locked = false, omitLastCampaign = true, notify = false } = {}) => {
  const { service, creds, calls } = fixture({ unknown, failReport, smartStatus, omitLastCampaign });
  // Keep the actual service's report query at the screenshot's 180-day interval.
  const actualGet = service.getAllScopeMetrics;
  service.getAllScopeMetrics = (credentials, range, scope) => {
    const duration = (new Date(range.to) - new Date(range.from)) / 86400000;
    assert.equal(duration, 179);
    return actualGet(credentials, dates, scope);
  };
  const queries = [];
  const notifications = [];
  const query = async (sql, params) => {
    queries.push(sql);
    if (sql.includes('RETURNING id')) return locked ? { rowCount: 0, rows: [] } : { rowCount: 1, rows: [{ id: 1 }] };
    if (sql.includes('FROM ad_accounts')) return { rowCount: 1, rows: [{ id: 1, platform: 'tiktok', credentials: creds }] };
    if (sql.includes('SELECT external_id FROM campaigns')) return { rows: matchedCampaign ? [{ external_id: 'campaign' }] : [] };
    if (sql.includes('SELECT external_id, status FROM ads')) return { rows: cachedStatus ? [{ external_id: '9000000000000000100', status: cachedStatus }] : [] };
    return { rowCount: 0, rows: [] };
  };
  const engine = load('services/rulesEngine.js', {
    '../config/database': { query }, './platformService': { getService: () => service },
    '../utils/logger': logger, '../utils/audit': { logEvent: async () => {}, EVENT_TYPES: {} },
    './emailService': { sendRuleNotification: async payload => { notifications.push(payload); } },
  });
  const result = await engine.executeRule({
    id: 1, account_id: 1, platform: 'tiktok', scope: 'ad', name: 'Tắt quảng cáo 50K',
    target_mode: 'specific', target_ids: [1], target_status_filter: 'active',
    conditions_logic: 'AND', cooldown_minutes: 8, email_notify: notify,
    conditions: notify ? [{ metric: 'spend', operator: '>', value: 1000, timeRange: '180d' }] : [{ metric: 'spend', operator: '>', value: 45000, timeRange: '180d' },
      { metric: 'name', operator: 'contains', value: '50K' }], actions: [{ type: notify ? 'notify' : 'pause' }],
  }, { bypassCooldown: true });
  return { result, calls, queries, notifications };
};

test('screenshot rule pauses only matching active ad in selected campaign using Smart+ ID', async () => {
  const { result, calls } = await runRule();
  assert.equal(result.success, true);
  assert.equal(result.triggered, 1);
  assert.equal(result.results[0].target, 'Video 50K');
  assert.equal(result.results[0].status, 'success');
  assert.equal(calls.filter(c => c.endpoint === '/smart_plus/ad/status/update/').length, 1);
});

test('unknown status without a DB fallback reports why and never acts', async () => {
  const { result, calls, queries } = await runRule({ unknown: true });
  assert.equal(result.triggered, 0);
  assert(result.debug.some(d => d.skipped?.includes('Chưa xác định')));
  assert(queries.some(sql => sql.includes('SELECT external_id, status FROM ads')));
  assert(!calls.some(c => c.endpoint.includes('status/update')));
});

test('failed report records rule failure without changing any ads', async () => {
  const { result, calls } = await runRule({ failReport: true });
  assert.equal(result.success, false);
  assert.match(result.message, /report unavailable/);
  assert(!calls.some(c => c.endpoint.includes('status/update')));
});

 test('paused Smart+ ad is not matched by active rule even when creative says ENABLE', async () => {
  const { result, calls } = await runRule({ smartStatus: 'DISABLE' });
  assert.equal(result.triggered, 0);
  assert(result.debug.some(d => d.noTargetsReason?.includes('trạng thái')));
  assert(!calls.some(c => c.endpoint.includes('status/update')));
});

 test('existing DB status fallback retains a matching active Smart+ target', async () => {
  const { result } = await runRule({ unknown: true, cachedStatus: 'ENABLE', omitLastCampaign: false });
  assert.equal(result.triggered, 1);
  const target = result.debug.find(d => d.target === 'Video 50K');
  assert.equal(target.status_source, 'db_fallback');
  assert.equal(target.passed, true);
});

 test('selected campaign not found reports parent lookup failure rather than unmet cost', async () => {
  const { result } = await runRule({ matchedCampaign: false });
  assert.equal(result.triggered, 0);
  const empty = result.debug.find(d => d.noTargets);
  assert.match(empty.noTargetsReason, /Không tìm thấy chiến dịch/);
  assert.equal(empty.diagnostics.matched_selected_campaigns, 0);
  assert.equal(empty.diagnostics.api_metadata_items, 101);
});

 test('worker lock skips the run before any TikTok read or action', async () => {
  const { result, calls } = await runRule({ locked: true });
  assert.equal(result.skipped, true);
  assert.equal(result.triggered, 0);
  assert.equal(calls.length, 0);
});

 test('notification screenshot: cost >1000 over 180 days sends matching notifications, not no-targets', async () => {
  const { result, notifications, calls } = await runRule({ notify: true });
  assert.equal(result.triggered, 101);
  assert.equal(notifications.length, 101);
  assert(!result.debug.some(d => d.noTargets));
  assert(!calls.some(c => c.endpoint.includes('status/update')));
});
