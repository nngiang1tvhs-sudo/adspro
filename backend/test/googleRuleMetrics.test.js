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
const fixture = ({ scope = 'ad', fail = false, empty = false } = {}) => {
  const queries = [];
  const service = load('services/googleAdsService.js', {
    'google-ads-api': {
      GoogleAdsApi: class {
        Customer() { return { query: async sql => {
          queries.push(sql);
          // GAQL SELECT accepts field names, not SQL aliases.
          if (/\bAS\b/i.test(sql)) throw { errors: [{ message: 'Unexpected input AS' }] };
          if (fail) throw { errors: [{ message: 'Google reporting unavailable' }] };
          if (empty) return [];
          return [{ campaign: { id: '12345678901' },
            ad_group: { id: '222', name: 'Group', status: 2 },
            ad_group_ad: { ad: { id: '333', name: 'Video' }, status: 2 },
            metrics: { video_trueview_views: '1901', cost_micros: '3000000' } }];
        } }; }
      },
      enums: { AdGroupStatus: { 2: 'ENABLED' }, AdGroupAdStatus: { 2: 'ENABLED' } },
      errors: {},
    },
    '../utils/logger': logger,
    '../utils/encryption': { decryptCredentials: value => value },
  });
  return { service, queries, scope };
};

for (const scope of ['ad', 'ad_group']) {
  test(`Google ${scope}: lifetime metrics retain parent campaign and decoded status`, async () => {
    const { service, queries } = fixture({ scope });
    const metrics = await service.getAllScopeMetrics({ customer_id: '123' }, { from: 'ALL_TIME', to: 'ALL_TIME' }, scope);
    assert.equal(metrics.__items__.length, 1);
    assert.equal(metrics.__items__[0].campaign_external_id, '12345678901');
    assert.equal(metrics.__items__[0].status, 'ENABLED');
    assert.equal(metrics[scope === 'ad' ? '333' : '222'].video_views, 1901);
    assert(!queries[0].includes('segments.date'));
  });

  test(`Google ${scope}: reporting errors stay errors, not empty metrics`, async () => {
    const { service } = fixture({ scope, fail: true });
    await assert.rejects(service.getAllScopeMetrics({}, { from: 'ALL_TIME' }, scope), /Google reporting unavailable/);
  });
}

const runRule = async ({ fail = false, empty = false } = {}) => {
  const { service, queries } = fixture({ fail, empty });
  const notifications = [];
  const toggles = [];
  service.toggleObjectStatus = async (_credentials, id, type, status) => {
    toggles.push({ type, id, status });
    return { success: true };
  };
  const engine = load('services/rulesEngine.js', {
    '../config/database': { query: async sql => {
      if (sql.includes('RETURNING id')) return { rowCount: 1, rows: [{ id: 1 }] };
      if (sql.includes('FROM ad_accounts')) return { rowCount: 1, rows: [{ id: 7, platform: 'google', credentials: {} }] };
      if (sql.includes('SELECT external_id FROM campaigns')) return { rows: [{ external_id: '12345678901' }] };
      return { rowCount: 0, rows: [] };
    } },
    './platformService': { getService: () => service }, '../utils/logger': logger,
    '../utils/audit': { logEvent: async () => {}, EVENT_TYPES: {} },
    './emailService': { sendRuleNotification: async value => notifications.push(value) },
  });
  const result = await engine.executeRule({
    id: 1, account_id: 7, platform: 'google', scope: 'ad', name: 'Mass',
    target_mode: 'specific', target_ids: [10], target_status_filter: 'all', cooldown_minutes: 60, email_notify: true,
    conditions_logic: 'AND',
    conditions: [{ metric: 'video_views', operator: '>', value: 1800, timeRange: 'all_time' }],
    actions: [{ type: 'pause' }],
  }, { bypassCooldown: true });
  return { result, notifications, queries, toggles };
};

test('screenshot targeting and lifetime TrueView threshold evaluate the selected campaign ad', async () => {
  const { result, notifications, toggles } = await runRule();
  assert.equal(result.success, true);
  assert.equal(result.triggered, 1);
  assert.equal(result.debug[0].evaluations[0].actualValue, 1901);
  assert.equal(notifications.length, 1);
  assert.deepEqual(toggles, [{ type: 'ad', id: '333', status: false }]);
});

test('Google rule exposes report errors instead of the misleading no-target message', async () => {
  const { result, notifications, toggles } = await runRule({ fail: true });
  assert.equal(result.success, false);
  assert.match(result.message, /Google reporting unavailable/);
  assert.equal(toggles.length, 0);
  assert.equal(notifications.length, 0);
});

test('successful empty Google report remains a no-target result', async () => {
  const { result, notifications } = await runRule({ empty: true });
  assert.equal(result.success, true);
  assert.equal(result.triggered, 0);
  assert(result.debug.some(item => item.noTargets));
  assert.equal(notifications.length, 0);
});
