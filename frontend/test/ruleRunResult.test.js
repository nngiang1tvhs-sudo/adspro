import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRuleRunResult, makeRuleRunError, getRuleRunSummary } from '../src/utils/ruleRunResult.js';

test('TikTok API failure without debug becomes a displayable result with its error message', () => {
  const result = makeRuleRunResult('TikTok 50K', { success: false, message: 'TikTok report unavailable' });
  assert.equal(result.ruleName, 'TikTok 50K');
  assert.equal(result.success, false);
  assert.equal(result.message, 'TikTok report unavailable');
  assert.deepEqual(result.debug, []);
  assert.equal(result.triggered, null);
});

test('empty successful run and locked rule both remain displayable', () => {
  const empty = makeRuleRunResult('Empty', { success: true, triggered: 0, duration: 10, debug: [] });
  assert.equal(empty.success, true);
  assert.equal(empty.triggered, 0);
  const locked = makeRuleRunResult('Locked', { success: true, skipped: true, message: 'Rule đang được thực thi bởi worker khác' });
  assert.equal(locked.skipped, true);
  assert.match(locked.message, /worker khác/);
  assert.deepEqual(locked.debug, []);
});

test('timeout does not falsely claim the server stopped or no ads were changed', () => {
  const result = makeRuleRunError('TikTok', { code: 'ECONNABORTED', message: 'timeout' });
  assert.equal(result.outcomeUnknown, true);
  assert.equal(result.triggered, null);
  assert.match(result.message, /60 giây/);
  assert.match(result.message, /vẫn đang chạy/);
  assert.match(result.message, /Lịch sử/);
});

test('HTTP or network failure is shown with unknown execution outcome', () => {
  const result = makeRuleRunError('TikTok', { message: 'Network Error' });
  assert.match(result.message, /Network Error/);
  assert.match(result.message, /Chưa xác nhận/);
  assert.deepEqual(result.debug, []);
});

test('normal Google/Facebook/TikTok debug evaluations and counts are preserved', () => {
  const debug = [{ target: '50K', passed: true, evaluations: [{ actualValue: 50000 }] }];
  const result = makeRuleRunResult('Rule', { success: true, triggered: 1, duration: 500, debug });
  assert.equal(result.debug, debug);
  assert.equal(result.triggered, 1);
  assert.equal(result.duration, 500);
});

 test('zero triggers distinguishes missing targets and skipped status from failed conditions', () => {
  const filtered = makeRuleRunResult('TikTok', { success: true, triggered: 0, debug: [{ noTargets: true, noTargetsReason: 'Thiếu trạng thái' }] });
  assert.equal(getRuleRunSummary(filtered), 'Thiếu trạng thái');
  const skipped = makeRuleRunResult('TikTok', { success: true, triggered: 0, debug: [{ skipped: 'Đã tắt' }] });
  assert.match(getRuleRunSummary(skipped), /bị bỏ qua/);
  const evaluated = makeRuleRunResult('TikTok', { success: true, triggered: 0, debug: [{ passed: false, evaluations: [{ actualValue: 500 }] }] });
  assert.match(getRuleRunSummary(evaluated), /Không có đối tượng nào thỏa/);
});
