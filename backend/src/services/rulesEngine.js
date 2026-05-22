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
 * Lấy giá trị metric của 1 đối tượng cho khoảng thời gian.
 *
 * Thứ tự ưu tiên cho "Hôm nay":
 *   1. liveMetrics (gọi trực tiếp từ API — chính xác nhất)
 *   2. campaigns.metrics từ DB (sync gần nhất, có thể là 30 ngày)
 *   3. daily_metrics hôm nay trong DB (fallback cuối)
 *
 * @param {object} object           - Campaign/AdGroup/Ad từ DB
 * @param {string} metric           - Tên chỉ số cần lấy
 * @param {string} timeRange        - today | 3d | 5d | 7d | all
 * @param {object} account          - Thông tin tài khoản
 * @param {object|null} liveMetrics - Metrics live từ API (null = dùng cache)
 */
const getMetricValue = async (object, metric, timeRange, account, liveMetrics = null) => {
  if (metric === 'time') return { value: null, source: 'time' };

  const colMap = {
    spend: 'spend', impressions: 'impressions', clicks: 'clicks',
    ctr: 'ctr', cpc: 'cpc', cpm: 'cpm', conversions: 'conversions',
    cpa: 'cpa', revenue: 'revenue', roas: 'roas',
    video_views: 'video_views', cpv: 'cpv', engagements: 'engagements',
    follows: 'follows', messages: 'messages', reach: 'reach',
  };

  const column = colMap[metric];
  if (!column) return { value: null, source: 'unknown_metric' };

  if (timeRange === 'today' || !timeRange) {
    const today = dayjs().tz('Asia/Ho_Chi_Minh').format('YYYY-MM-DD');

    // Ưu tiên 1: Live metrics từ API — chỉ dùng nếu > 0
    // (Facebook/TikTok có độ trễ báo cáo vài giờ, trả về 0 dù chiến dịch đang chi tiêu)
    if (liveMetrics !== null) {
      const val = liveMetrics[metric] ?? liveMetrics[column];
      const numVal = Number(val ?? 0);
      if (numVal > 0) return { value: numVal, source: 'live_api' };
    }

    // Ưu tiên 2: daily_metrics hôm nay trong DB (từ lần sync gần nhất)
    let sql2, params2;
    if (object.type === 'campaign') {
      sql2 = `SELECT SUM(${column}) as val FROM daily_metrics WHERE campaign_id = $1 AND date = $2`;
      params2 = [object.id, today];
    } else if (object.type === 'ad_group') {
      sql2 = `SELECT SUM(${column}) as val FROM daily_metrics WHERE ad_group_id = $1 AND date = $2`;
      params2 = [object.id, today];
    } else if (object.type === 'ad') {
      sql2 = `SELECT SUM(${column}) as val FROM daily_metrics WHERE ad_id = $1 AND date = $2`;
      params2 = [object.id, today];
    } else {
      return { value: 0, source: 'no_type' };
    }
    const dailyResult = await query(sql2, params2);
    const dailyVal = Number(dailyResult.rows[0]?.val || 0);
    if (dailyVal > 0) return { value: dailyVal, source: 'daily_db' };

    // Ưu tiên 3: campaigns.metrics từ lần sync gần nhất (dữ liệu 30 ngày — phương án cuối)
    const rawMetrics = object.metrics;
    if (rawMetrics) {
      const m = typeof rawMetrics === 'string' ? JSON.parse(rawMetrics) : rawMetrics;
      const val = m[metric] ?? m[column];
      if (val !== undefined && val !== null) return { value: Number(val), source: 'cache_30d' };
    }

    return { value: 0, source: 'zero_no_data' };
  }

  // Khoảng thời gian lịch sử (3d, 5d, 7d, all) — đọc từ daily_metrics
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
    return { value: null, source: 'no_type' };
  }

  const result = await query(sql, params);
  return { value: Number(result.rows[0]?.val || 0), source: `daily_${timeRange}` };
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
 * @param {object|null} liveMetrics - Metrics live từ API cho target này
 */
const evaluateCondition = async (condition, object, account, liveMetrics = null) => {
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

  const { value, source } = await getMetricValue(object, condition.metric, condition.timeRange || 'today', account, liveMetrics);
  if (value === null) return { passed: false, actualValue: null, source: 'null' };

  const op = OPERATORS[condition.operator];
  if (!op) return { passed: false, actualValue: value, source };

  return { passed: op(value, condition.value), actualValue: value, source };
};

/**
 * Đánh giá tất cả conditions
 * @param {object|null} liveMetrics - Metrics live từ API cho target này
 */
const evaluateAllConditions = async (conditions, logic, object, account, liveMetrics = null) => {
  if (!conditions || conditions.length === 0) return false;

  const results = [];
  for (const cond of conditions) {
    const r = await evaluateCondition(cond, object, account, liveMetrics);
    results.push({ condition: cond, result: r.passed, actualValue: r.actualValue, source: r.source });
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
 * Kiểm tra cooldown theo từng target riêng biệt (tra rule_history).
 * Mỗi campaign/ad_group/ad có cooldown độc lập — target A trigger không ảnh hưởng target B.
 */
const isTargetInCooldown = async (ruleId, targetExternalId, cooldownMinutes) => {
  if (!cooldownMinutes || cooldownMinutes <= 0) return false;
  const res = await query(
    `SELECT executed_at FROM rule_history
     WHERE rule_id = $1 AND target_id = $2 AND status = 'success'
     ORDER BY executed_at DESC LIMIT 1`,
    [ruleId, String(targetExternalId)]
  );
  if (res.rowCount === 0) return false;
  const elapsed = Date.now() - new Date(res.rows[0].executed_at).getTime();
  return elapsed < cooldownMinutes * 60 * 1000;
};

/**
 * Thực thi 1 rule
 *
 * @param {object} rule                  - Rule từ DB
 * @param {object} options
 * @param {boolean} options.bypassCooldown - Bỏ qua cooldown (dùng khi chạy thủ công)
 */
const executeRule = async (rule, options = {}) => {
  const { bypassCooldown = false } = options;
  const startTime = Date.now();

  try {
    await query(
      'UPDATE rules SET last_run_at = CURRENT_TIMESTAMP, total_runs = total_runs + 1 WHERE id = $1',
      [rule.id]
    );

    // Lấy danh sách account cần xử lý
    let accounts;
    if (rule.account_id) {
      accounts = await query(
        `SELECT id, platform, account_name, credentials, currency FROM ad_accounts WHERE id = $1`,
        [rule.account_id]
      );
    } else {
      accounts = await query(
        `SELECT id, platform, account_name, credentials, currency
         FROM ad_accounts WHERE user_id = $1 AND platform = $2 AND status = 'active'`,
        [rule.user_id, rule.platform]
      );
    }

    if (accounts.rowCount === 0) {
      logger.warn(`Rule ${rule.id} không có account để chạy`);
      return { success: false, message: 'Không có tài khoản phù hợp' };
    }

    const allResults = [];
    const debugEvals = [];
    let totalCooldownSkipped = 0;

    for (const account of accounts.rows) {
      // --- Tải live metrics từ API nếu có điều kiện "Hôm nay" ---
      let liveMetricsMap = {};
      const hasTodayCondition = (rule.conditions || []).some(c => !c.timeRange || c.timeRange === 'today');
      if (hasTodayCondition) {
        try {
          const svc = getService(account.platform);
          liveMetricsMap = await svc.getLiveMetrics(account.credentials, rule.scope);
          logger.info(`Rule ${rule.id}: Đã tải live metrics cho ${Object.keys(liveMetricsMap).length} campaigns (${account.account_name})`);
        } catch (err) {
          logger.warn(`Rule ${rule.id}: Không thể tải live metrics, dùng cache DB: ${err.message}`);
        }
      }

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

      // Lọc target cụ thể nếu có
      if (rule.target_mode === 'specific') {
        const rawIds = Array.isArray(rule.target_ids) ? rule.target_ids
          : (typeof rule.target_ids === 'string' ? JSON.parse(rule.target_ids) : []);
        if (rawIds.length > 0) {
          const allowedIds = new Set(rawIds.map(t => Number(typeof t === 'object' ? t.id : t)));
          targets = targets.filter(t => allowedIds.has(Number(t.id)));
        } else {
          targets = [];
        }
      }

      // Lọc theo trạng thái chiến dịch
      if (rule.target_status_filter && rule.target_status_filter !== 'all') {
        const ACTIVE_STATUSES = ['ENABLED', 'ACTIVE', 'ENABLE'];
        const PAUSED_STATUSES = ['PAUSED', 'PAUSE', 'DISABLED', 'DISABLE'];
        targets = targets.filter(t => {
          const s = (t.status || '').toUpperCase();
          if (rule.target_status_filter === 'active') return ACTIVE_STATUSES.includes(s);
          if (rule.target_status_filter === 'paused') return PAUSED_STATUSES.includes(s);
          return true;
        });
      }

      for (const target of targets) {
        // --- Cooldown per-target (bypass khi chạy thủ công) ---
        if (!bypassCooldown) {
          const inCooldown = await isTargetInCooldown(rule.id, target.external_id, rule.cooldown_minutes);
          if (inCooldown) {
            totalCooldownSkipped++;
            logger.debug(`Rule ${rule.id} - "${target.name}" đang trong cooldown, bỏ qua`);
            continue;
          }
        }

        // Lấy live metrics cho target cụ thể này
        const targetLiveMetrics = Object.keys(liveMetricsMap).length > 0
          ? (liveMetricsMap[target.external_id] || null)
          : null;

        // Đánh giá conditions với live metrics
        const evalResult = await evaluateAllConditions(
          rule.conditions,
          rule.conditions_logic || 'AND',
          target,
          account,
          targetLiveMetrics
        );

        // Thu thập debug info (luôn ghi, kể cả khi không trigger)
        debugEvals.push({
          target: target.name,
          status: target.status,
          passed: evalResult.passed,
          evaluations: evalResult.evaluations,
          liveMetricsAvailable: targetLiveMetrics !== null,
        });

        if (!evalResult.passed) continue;

        // Với action pause/enable: bỏ qua nếu status đã đúng rồi
        const actionTypes = rule.actions.map(a => a.type);
        const hasPause  = actionTypes.some(t => ['pause',  'tat',  'turn_off'].includes(t));
        const hasEnable = actionTypes.some(t => ['enable', 'bat',  'turn_on' ].includes(t));
        const targetStatus    = (target.status || '').toUpperCase();
        const isAlreadyPaused = ['PAUSED', 'PAUSE', 'DISABLED', 'DISABLE'].includes(targetStatus);
        const isAlreadyActive = ['ENABLED', 'ACTIVE', 'ENABLE'].includes(targetStatus);
        if (hasPause  && isAlreadyPaused) { debugEvals[debugEvals.length - 1].skipped = 'already_paused'; continue; }
        if (hasEnable && isAlreadyActive)  { debugEvals[debugEvals.length - 1].skipped = 'already_active'; continue; }

        // Thực thi tất cả actions
        const actionsResults = [];
        for (const action of rule.actions) {
          const r = await executeAction(action, target, account, rule, evalResult.evaluations);
          actionsResults.push(r);
        }

        const allSuccess = actionsResults.every(r => r.success);
        const status   = allSuccess ? 'success' : 'failed';
        const messages = actionsResults.map(r => r.message).join('; ');

        // Lưu history (target_id = external_id để cooldown query đúng)
        await query(
          `INSERT INTO rule_history
             (rule_id, account_id, target_type, target_id, target_name, status, message, conditions_evaluated, actions_taken)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            rule.id, account.id,
            target.type, String(target.external_id), target.name,
            status, messages,
            JSON.stringify(evalResult.evaluations),
            JSON.stringify(actionsResults),
          ]
        );

        // Cập nhật thống kê rule
        await query(
          'UPDATE rules SET last_triggered_at = CURRENT_TIMESTAMP, total_triggers = total_triggers + 1 WHERE id = $1',
          [rule.id]
        );

        await logEvent({
          userId:    rule.user_id,
          accountId: account.id,
          eventType: EVENT_TYPES.RULE_TRIGGERED,
          level:     status === 'success' ? 'success' : 'error',
          message:   `Rule "${rule.name}" → ${target.name}: ${messages}`,
          details:   { rule_id: rule.id, target: target.name, actions: actionsResults },
        });

        allResults.push({ target: target.name, status, actions: actionsResults });
      }
    }

    return {
      success: true,
      duration: Date.now() - startTime,
      triggered: allResults.length,
      cooldown_skipped: totalCooldownSkipped,
      results: allResults,
      debug: debugEvals,
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
