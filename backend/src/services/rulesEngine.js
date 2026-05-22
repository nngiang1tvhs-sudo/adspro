const { query } = require('../config/database');
const { getService } = require('./platformService');
const logger = require('../utils/logger');
const { logEvent, EVENT_TYPES } = require('../utils/audit');
const { sendRuleNotification } = require('./emailService');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Rules Engine - đánh giá và thực thi các rule tự động
 *
 * Cấu trúc 1 condition:
 * {
 *   metric: 'cpv',          // Chỉ số: cpv, cpc, spend, ctr, conversions, time...
 *   operator: '>',          // > < = >= <= !=
 *   value: 500,             // Giá trị so sánh
 *   timeRange: 'today',     // today | 3d | 5d | 7d | all
 *   timeStart: '06:00',     // (cho metric=time) khung giờ bắt đầu
 *   timeEnd: '22:00',       // (cho metric=time) khung giờ kết thúc
 * }
 *
 * Cấu trúc 1 action:
 * {
 *   type: 'pause' | 'enable' | 'notify' | 'warn_complete' | 'warn_threshold',
 *   message: 'Optional custom message',
 * }
 */

const OPERATORS = {
  '>': (a, b) => Number(a) > Number(b),
  '<': (a, b) => Number(a) < Number(b),
  '=': (a, b) => Number(a) === Number(b),
  '>=': (a, b) => Number(a) >= Number(b),
  '<=': (a, b) => Number(a) <= Number(b),
  '!=': (a, b) => Number(a) !== Number(b),
};

/**
 * Lấy giá trị metric của 1 đối tượng (campaign/adgroup/ad) cho khoảng thời gian
 */
const getMetricValue = async (object, metric, timeRange, account) => {
  if (metric === 'time') return null;

  const colMap = {
    spend: 'spend', impressions: 'impressions', clicks: 'clicks',
    ctr: 'ctr', cpc: 'cpc', cpm: 'cpm', conversions: 'conversions',
    cpa: 'cpa', revenue: 'revenue', roas: 'roas',
    video_views: 'video_views', cpv: 'cpv', engagements: 'engagements',
    follows: 'follows', messages: 'messages', reach: 'reach',
  };

  const column = colMap[metric];
  if (!column) return null;

  // "Hôm nay" → dùng campaigns.metrics (real-time từ lần sync gần nhất)
  // vì daily_metrics chỉ có dữ liệu ngày hôm qua trở về trước
  if (timeRange === 'today' || !timeRange) {
    const rawMetrics = object.metrics;
    if (rawMetrics) {
      const m = typeof rawMetrics === 'string' ? JSON.parse(rawMetrics) : rawMetrics;
      const val = m[metric] ?? m[column];
      if (val !== undefined && val !== null) return Number(val);
    }
    // Fallback: vẫn query daily_metrics nếu campaigns.metrics không có field này
    const today = dayjs().tz('Asia/Ho_Chi_Minh').format('YYYY-MM-DD');
    let sql, params;
    if (object.type === 'campaign') {
      sql = `SELECT SUM(${column}) as val FROM daily_metrics WHERE campaign_id = $1 AND date = $2`;
      params = [object.id, today];
    } else if (object.type === 'ad_group') {
      sql = `SELECT SUM(${column}) as val FROM daily_metrics WHERE ad_group_id = $1 AND date = $2`;
      params = [object.id, today];
    } else if (object.type === 'ad') {
      sql = `SELECT SUM(${column}) as val FROM daily_metrics WHERE ad_id = $1 AND date = $2`;
      params = [object.id, today];
    } else {
      return 0;
    }
    const result = await query(sql, params);
    return Number(result.rows[0]?.val || 0);
  }

  const today = dayjs().tz('Asia/Ho_Chi_Minh').format('YYYY-MM-DD');
  let fromDate;
  switch (timeRange) {
    case '3d': fromDate = dayjs().subtract(2, 'day').format('YYYY-MM-DD'); break;
    case '5d': fromDate = dayjs().subtract(4, 'day').format('YYYY-MM-DD'); break;
    case '7d': fromDate = dayjs().subtract(6, 'day').format('YYYY-MM-DD'); break;
    case 'all': fromDate = '2000-01-01'; break;
    default: fromDate = today;
  }

  const aggregator = ['ctr', 'cpc', 'cpm', 'cpa', 'cpv', 'roas'].includes(metric) ? 'AVG' : 'SUM';

  let sql, params;
  if (object.type === 'campaign') {
    sql = `SELECT ${aggregator}(${column}) as val FROM daily_metrics WHERE campaign_id = $1 AND date BETWEEN $2 AND $3`;
    params = [object.id, fromDate, today];
  } else if (object.type === 'ad_group') {
    sql = `SELECT ${aggregator}(${column}) as val FROM daily_metrics WHERE ad_group_id = $1 AND date BETWEEN $2 AND $3`;
    params = [object.id, fromDate, today];
  } else if (object.type === 'ad') {
    sql = `SELECT ${aggregator}(${column}) as val FROM daily_metrics WHERE ad_id = $1 AND date BETWEEN $2 AND $3`;
    params = [object.id, fromDate, today];
  } else {
    return null;
  }

  const result = await query(sql, params);
  return Number(result.rows[0]?.val || 0);
};

const STRING_OPS = {
  contains:     (name, val) => name.toLowerCase().includes(val.toLowerCase()),
  not_contains: (name, val) => !name.toLowerCase().includes(val.toLowerCase()),
  starts_with:  (name, val) => name.toLowerCase().startsWith(val.toLowerCase()),
  ends_with:    (name, val) => name.toLowerCase().endsWith(val.toLowerCase()),
  equals:       (name, val) => name.toLowerCase() === val.toLowerCase(),
  not_equals:   (name, val) => name.toLowerCase() !== val.toLowerCase(),
};

/**
 * Đánh giá 1 condition
 */
const evaluateCondition = async (condition, object, account) => {
  if (condition.metric === 'time') {
    const now = dayjs().tz('Asia/Ho_Chi_Minh');
    const currentMinutes = now.hour() * 60 + now.minute();
    const [sH, sM] = (condition.timeStart || '00:00').split(':').map(Number);
    const [eH, eM] = (condition.timeEnd || '23:59').split(':').map(Number);
    const startMin = sH * 60 + sM;
    const endMin = eH * 60 + eM;
    return { passed: currentMinutes >= startMin && currentMinutes <= endMin, actualValue: null };
  }

  if (condition.metric === 'name') {
    const nameOp = STRING_OPS[condition.operator];
    if (!nameOp) return { passed: false, actualValue: null };
    const objectName = object.name || '';
    const condValue = String(condition.value || '');
    if (!condValue) return { passed: false, actualValue: null };
    return { passed: nameOp(objectName, condValue), actualValue: null };
  }

  const value = await getMetricValue(object, condition.metric, condition.timeRange || 'today', account);
  if (value === null) return { passed: false, actualValue: null };

  const op = OPERATORS[condition.operator];
  if (!op) return { passed: false, actualValue: null };

  return { passed: op(value, condition.value), actualValue: value };
};

/**
 * Đánh giá tất cả conditions
 */
const evaluateAllConditions = async (conditions, logic, object, account) => {
  if (!conditions || conditions.length === 0) return false;

  const results = [];
  for (const cond of conditions) {
    const r = await evaluateCondition(cond, object, account);
    results.push({ condition: cond, result: r.passed, actualValue: r.actualValue });
  }

  let passed;
  if (logic === 'OR') {
    passed = results.some(r => r.result);
  } else {
    passed = results.every(r => r.result);
  }

  return { passed, evaluations: results };
};

/**
 * Thực thi 1 action
 */
const executeAction = async (action, object, account, rule, evaluations = []) => {
  const service = getService(account.platform);

  try {
    switch (action.type) {
      case 'pause':
      case 'tat':
      case 'turn_off':
        if (object.type === 'campaign') {
          await service.toggleCampaignStatus(account.credentials, object.external_id, false);
          await query(
            'UPDATE campaigns SET status = $1 WHERE id = $2',
            ['PAUSED', object.id]
          );
        }
        if (rule.email_notify) {
          await sendRuleNotification({ ruleName: rule.name, objectName: object.name, objectType: object.type, platform: account.platform, accountName: account.account_name, currency: account.currency, actionType: 'pause', evaluations });
        }
        return { success: true, action: 'pause', message: `Đã tắt ${object.name}` };

      case 'enable':
      case 'bat':
      case 'turn_on':
        if (object.type === 'campaign') {
          await service.toggleCampaignStatus(account.credentials, object.external_id, true);
          await query(
            'UPDATE campaigns SET status = $1 WHERE id = $2',
            [account.platform === 'google' ? 'ENABLED' : 'ACTIVE', object.id]
          );
        }
        if (rule.email_notify) {
          await sendRuleNotification({ ruleName: rule.name, objectName: object.name, objectType: object.type, platform: account.platform, accountName: account.account_name, currency: account.currency, actionType: 'enable', evaluations });
        }
        return { success: true, action: 'enable', message: `Đã bật ${object.name}` };

      case 'notify':
      case 'send_email':
      case 'gui_thong_bao':
        if (rule.email_notify) {
          await sendRuleNotification({ ruleName: rule.name, objectName: object.name, objectType: object.type, platform: account.platform, accountName: account.account_name, currency: account.currency, actionType: 'notify', evaluations });
        }
        return { success: true, action: 'notify', message: `Đã gửi email thông báo` };

      case 'warn_complete':
      case 'canh_bao_hoan_thanh':
        await sendRuleNotification({ ruleName: rule.name, objectName: object.name, objectType: object.type, platform: account.platform, accountName: account.account_name, currency: account.currency, actionType: 'warn_complete', evaluations });
        return { success: true, action: 'warn_complete', message: 'Đã gửi cảnh báo sắp hoàn thành' };

      case 'warn_threshold':
      case 'canh_bao_vuot_nguong':
        await sendRuleNotification({ ruleName: rule.name, objectName: object.name, objectType: object.type, platform: account.platform, accountName: account.account_name, currency: account.currency, actionType: 'warn_threshold', evaluations });
        return { success: true, action: 'warn_threshold', message: 'Đã gửi cảnh báo vượt ngưỡng' };

      default:
        return { success: false, action: action.type, message: `Action không hỗ trợ: ${action.type}` };
    }
  } catch (err) {
    logger.error(`Action execution failed [${action.type}]:`, err.message);
    return { success: false, action: action.type, message: err.message };
  }
};

/**
 * Thực thi 1 rule
 */
const executeRule = async (rule) => {
  const startTime = Date.now();

  try {
    // Cập nhật last_run_at
    await query('UPDATE rules SET last_run_at = CURRENT_TIMESTAMP, total_runs = total_runs + 1 WHERE id = $1', [rule.id]);

    // Lấy account
    let accountSql = `SELECT id, platform, account_name, credentials, currency FROM ad_accounts WHERE id = $1`;
    let accounts;

    if (rule.account_id) {
      accounts = await query(accountSql, [rule.account_id]);
    } else {
      // Apply cho tất cả accounts của platform
      accounts = await query(
        `SELECT id, platform, account_name, credentials, currency FROM ad_accounts WHERE user_id = $1 AND platform = $2 AND status = 'active'`,
        [rule.user_id, rule.platform]
      );
    }

    if (accounts.rowCount === 0) {
      logger.warn(`Rule ${rule.id} không có account để chạy`);
      return { success: false, message: 'Không có tài khoản phù hợp' };
    }

    const allResults = [];

    for (const account of accounts.rows) {
      // Lấy targets theo scope
      let targets = [];

      if (rule.scope === 'campaign') {
        const r = await query(
          'SELECT id, external_id, name, status, metrics FROM campaigns WHERE account_id = $1',
          [account.id]
        );
        targets = r.rows.map(c => ({ ...c, type: 'campaign' }));
      } else if (rule.scope === 'ad_group') {
        const r = await query(
          'SELECT id, external_id, name, status, metrics FROM ad_groups WHERE account_id = $1',
          [account.id]
        );
        targets = r.rows.map(g => ({ ...g, type: 'ad_group' }));
      } else if (rule.scope === 'ad') {
        const r = await query(
          'SELECT id, external_id, name, status, metrics FROM ads WHERE account_id = $1',
          [account.id]
        );
        targets = r.rows.map(a => ({ ...a, type: 'ad' }));
      }

      // Lọc theo target cụ thể nếu có
      if (rule.target_mode === 'specific') {
        const rawIds = Array.isArray(rule.target_ids) ? rule.target_ids
          : (typeof rule.target_ids === 'string' ? JSON.parse(rule.target_ids) : []);
        if (rawIds.length > 0) {
          const allowedIds = new Set(rawIds.map(t => Number(typeof t === 'object' ? t.id : t)));
          targets = targets.filter(t => allowedIds.has(Number(t.id)));
        } else {
          targets = []; // specific mode nhưng chưa chọn target → không chạy
        }
      }

      let lastTriggeredAt = rule.last_triggered_at;

    for (const target of targets) {
        // Kiểm tra cooldown (dùng biến local để phản ánh trigger trong cùng lần chạy)
        if (lastTriggeredAt) {
          const cooldownMs = (rule.cooldown_minutes || 60) * 60 * 1000;
          const sinceLastTrigger = Date.now() - new Date(lastTriggeredAt).getTime();
          if (sinceLastTrigger < cooldownMs) {
            continue;
          }
        }

        // Đánh giá conditions
        const evalResult = await evaluateAllConditions(
          rule.conditions,
          rule.conditions_logic || 'AND',
          target,
          account
        );

        if (!evalResult.passed) {
          continue;
        }

        // Bỏ qua nếu action đã được thực hiện (tránh trigger lặp)
        const actionTypes = rule.actions.map(a => a.type);
        const hasPause = actionTypes.some(t => ['pause', 'tat', 'turn_off'].includes(t));
        const hasEnable = actionTypes.some(t => ['enable', 'bat', 'turn_on'].includes(t));
        const targetStatus = (target.status || '').toUpperCase();
        const isAlreadyPaused = ['PAUSED', 'PAUSE', 'DISABLED', 'DISABLE'].includes(targetStatus);
        const isAlreadyActive = ['ENABLED', 'ACTIVE', 'ENABLE'].includes(targetStatus);

        if (hasPause && isAlreadyPaused) continue; // Đã tắt rồi, bỏ qua
        if (hasEnable && isAlreadyActive) continue; // Đã bật rồi, bỏ qua

        // Thực thi actions
        const actionsResults = [];
        for (const action of rule.actions) {
          const r = await executeAction(action, target, account, rule, evalResult.evaluations);
          actionsResults.push(r);
        }

        const allSuccess = actionsResults.every(r => r.success);
        const status = allSuccess ? 'success' : 'failed';
        const messages = actionsResults.map(r => r.message).join('; ');

        // Lưu history
        await query(
          `INSERT INTO rule_history (rule_id, account_id, target_type, target_id, target_name, status, message, conditions_evaluated, actions_taken)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            rule.id,
            account.id,
            target.type,
            target.external_id,
            target.name,
            status,
            messages,
            JSON.stringify(evalResult.evaluations),
            JSON.stringify(actionsResults),
          ]
        );

        // Cập nhật last_triggered_at (cả DB lẫn local để cooldown đúng trong cùng lần chạy)
        const nowTs = new Date().toISOString();
        lastTriggeredAt = nowTs;
        await query(
          'UPDATE rules SET last_triggered_at = CURRENT_TIMESTAMP, total_triggers = total_triggers + 1 WHERE id = $1',
          [rule.id]
        );

        await logEvent({
          userId: rule.user_id,
          accountId: account.id,
          eventType: EVENT_TYPES.RULE_TRIGGERED,
          level: status === 'success' ? 'success' : 'error',
          message: `Rule "${rule.name}" → ${target.name}: ${messages}`,
          details: { rule_id: rule.id, target: target.name, actions: actionsResults },
        });

        allResults.push({ target: target.name, status, actions: actionsResults });
      }
    }

    return {
      success: true,
      duration: Date.now() - startTime,
      triggered: allResults.length,
      results: allResults,
    };

  } catch (err) {
    logger.error(`Rule ${rule.id} execution error:`, err);
    await query(
      `INSERT INTO rule_history (rule_id, status, message) VALUES ($1, 'failed', $2)`,
      [rule.id, err.message]
    );
    return { success: false, message: err.message };
  }
};

/**
 * Chạy tất cả rules đang active
 */
const runAllActiveRules = async () => {
  const result = await query(
    `SELECT * FROM rules WHERE is_active = TRUE`
  );

  logger.info(`Bắt đầu chạy ${result.rowCount} rules đang active`);

  const results = [];
  for (const rule of result.rows) {
    try {
      const r = await executeRule(rule);
      results.push({ ruleId: rule.id, name: rule.name, ...r });
    } catch (err) {
      logger.error(`Rule ${rule.id} error:`, err);
      results.push({ ruleId: rule.id, success: false, error: err.message });
    }
  }

  return results;
};

module.exports = {
  executeRule,
  runAllActiveRules,
  evaluateAllConditions,
  evaluateCondition,
  OPERATORS,
};
