const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const logger = { info() {}, warn() {}, error() {} };
const load = (file, mocks) => {
  const filename = path.join(__dirname, '../src', file);
  const context = { module: { exports: {} }, console, Date, process,
    require: name => name in mocks ? mocks[name] : require(name) };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  return context.module.exports;
};
const engine = load('services/rulesEngine.js', {
  '../config/database': {}, './platformService': {}, '../utils/logger': logger,
  '../utils/audit': {}, './emailService': {},
});
const dates = { from: '2026-11-01', to: '2026-11-05' };
const credentials = { ad_account_id: 'fixture', access_token: 'test-placeholder' };
const fixture = insights => load('services/facebookAdsService.js', {
  axios: { get: async (_url, { params }) => {
    assert.ok(params.fields.includes('impressions'));
    assert.ok(params.fields.includes('actions'));
    assert.ok(params.fields.includes(JSON.stringify({ since: dates.from, until: dates.to })));
    return { data: { data: [{ id: 'object', name: 'Ad', status: 'ACTIVE',
      campaign_id: 'campaign', insights: { data: [insights] } }] } };
  } },
  '../utils/logger': logger,
  '../utils/encryption': { decryptCredentials: value => value },
});

for (const scope of ['campaign', 'ad_group', 'ad']) {
  test(`Facebook ${scope}: saved Views rule uses ad displays, independently of 3s/2s video views and reach`, async () => {
    const service = fixture({ impressions: '1200', reach: '800',
      actions: [{ action_type: 'video_view', value: '120' }],
      video_continuous_2_sec_watched_actions: [{ action_type: 'video_view', value: '200' }] });
    const metrics = await service.getAllScopeMetrics(credentials, dates, scope);
    const result = engine.evaluateCondition(
      { metric: 'video_views', operator: '>', value: 1000, timeRange: 'today' },
      { external_id: 'object' }, {}, { today: metrics });
    assert.equal(result.passed, true);
    assert.equal(result.actualValue, 1200);
    const videoResult = engine.evaluateCondition(
      { metric: 'video_3s_views', operator: '>', value: 1000, timeRange: 'today' },
      { external_id: 'object' }, {}, { today: metrics });
    assert.equal(videoResult.passed, false);
    assert.equal(videoResult.actualValue, 120);
    assert.equal(metrics.object.video_2s_views, 200);
  });

  test(`Facebook ${scope}: image ads have Views without video actions`, async () => {
    const metrics = await fixture({ impressions: '600' }).getAllScopeMetrics(credentials, dates, scope);
    assert.equal(metrics.object.video_views, 600);
    assert.equal(metrics.object.video_3s_views, 0);
  });

  test(`Facebook ${scope}: zero Views never falls back to video actions`, async () => {
    const metrics = await fixture({ impressions: '0', actions: [{ action_type: 'video_view', value: '25' }] })
      .getAllScopeMetrics(credentials, dates, scope);
    assert.equal(metrics.object.video_views, 0);
    assert.equal(metrics.object.video_3s_views, 25);
  });
}

for (const method of ['getCampaigns', 'getAdSets', 'getAds']) {
  test(`Facebook ${method}: list metrics agree with rule Views`, async () => {
    const service = fixture({ impressions: '900', actions: [{ action_type: 'video_view', value: '30' }] });
    const items = method === 'getCampaigns'
      ? await service[method](credentials, dates)
      : await service[method](credentials, 'parent', dates);
    assert.equal(items[0].metrics.video_views, 900);
    assert.equal(items[0].metrics.video_3s_views, 30);
  });
}
