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
 * Rules Engine
 *
 * Luồng chạy:
 * 1. Xác định platform + account
 * 2. Với mỗi timeRange trong conditions → gọi getCampaigns(credentials, { from, to }) trực tiếp
 *    (y hệt tab chiến dịch, không dùng DB cache)
 * 3. Lọc targets theo target_mode, target_status_filter
 * 4. So sánh điều kiện với dữ liệu API đúng khoảng thời gian
 * 5. Thực thi action
 */

const OPERATORS = {
  '>':  (a, b) => Number(a) > Number(b),
  '<':  (a, b) => Number(a) < Number(b),
  '=':  (a, b) => Number(a) === Number(b),
  '>=': (a, b) => Number(a) >= Number(b),
  '<=': (a, b) => Number(a) <= Number(b),
  '!=': (a, b) => Number(a) !== Number(b),
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
 * Chuyển timeRange thành { from, to } theo giờ Việt Nam (UTC+7)
 */
const getDateRange = (timeRange) => {
  const vn = dayjs().tz('Asia/Ho_Chi_Minh');
  const today = vn.format('YYYY-MM-DD');
  switch (timeRange) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const y = vn.subtract(1, 'day').format('YYYY-MM-DD');
      return { from: y, to: y };
    }
    case '3d':
      return { from: vn.subtract(2, 'day').format('YYYY-MM-DD'), to: today };
    case '5d':
      return { from: vn.subtract(4, 'day').format('YYYY-MM-DD'), to: today };
    case '7d':
      return { from: vn.subtract(6, 'day').format('YYYY-MM-DD'), to: today };
    case 'all':
    default:
      return { from: vn.subtract(30, 'day').format('YYYY-MM-DD'), to: today };
  }
};

/**
 * Lấy giá trị metric từ apiMetricsByRange.
 * apiMetricsByRange[timeRange][external_id] = metrics object từ getCampaigns/getAdGroups
 */
const getMetricValue = (object, metric, timeRange, apiMetricsByRange) => {
  if (metric === 'time' || metric === 'name') return { value: null, source: 'skip' };

  const tr = timeRange || 'today';
  const rangeMap = apiMetricsByRange[tr] || {};
  const apiMetrics = rangeMap[String(object.external_id)];

  if (apiMetrics !== undefined) {
    const val = apiMetrics[metric];
    const numVal = (val !== undefined && val !== null) ? Number(val) : 0;
    return { value: numVal, source: `api_${tr}` };
  }

  // Không tìm thấy trong API data → trả về 0
  return { value: 0, source: `api_${tr}_not_found` };
};

/**
 * Đánh giá 1 condition
 */
const evaluateCondition = (condition, object, account, apiMetricsByRange) => {
  if (condition.metric === 'time') {
    const now = dayjs().tz('Asia/Ho_Chi_Minh');
    const currentMinutes = now.hour() * 60 + now.minute();
    const [sH, sM] = (condition.timeStart || '00:00').split(':').map(Number);
    const [eH, eM] = (condition.timeEnd || '23:59').split(':').map(Number);
    const startMin = sH * 60 + sM;
    const endMin   = eH * 60 + eM;
    const passed = currentMinutes >= startMin && currentMinutes <= endMin;
    return { passed, actualValue: `${now.format('HH:mm')}`, source: 'time_check' };
  }

  if (condition.metric === 'name') {
    const nameOp = STRING_OPS[condition.operator];
    if (!nameOp) return { passed: false, actualValue: null, source: 'unknown_op' };
    const objectName = object.name || '';
    const condValue  = String(condition.value || '');
    if (!condValue) return { passed: false, actualValue: null, source: 'empty_value' };
    return { passed: nameOp(objectName, condValue), actualValue: objectName, source: 'name_check' };
  }

  const { value, source } = getMetricValue(object, condition.metric, condition.timeRange || 'today', apiMetricsByRange);
  if (value === null) return { passed: false, actualValue: null, source };

  const op = OPERATORS[condition.operator];
  if (!op) return { passed: false, actualValue: value, source };

  return { passed: op(value, condition.value), actualValue: value, source };
};

/**
 * Đánh giá tất cả conditions
 */
const evaluateAllConditions = (conditions, logic, object, account, apiMetricsByRange) => {
  if (!conditions || conditions.length === 0) return { passed: false, evaluations: [] };

  const results = [];
  for (const cond of conditions) {
    const r = evaluateCondition(cond, object, account, apiMetricsByRange);
    results.push({ condition: cond, result: r.passed, actualValue: r.actualValue, source: r.source });
  }

  const passed = logic === 'OR'
    ? results.some(r => r.result)
    : results.every(r => r.result);

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
      case 'turn_off': {
        const toggleFn = service.toggleObjectStatus || service.toggleCampaignStatus;
        if (service.toggleObjectStatus) {
          await service.toggleObjectStatus(account.credentials, object.external_id, object.type, false);
        } else {
          await service.toggleCampaignStatus(account.credentials, object.external_id, false);
        }
        // Cập nhật status trong DB theo bảng tương ứng
        if (object.type === 'campaign') await query('UPDATE campaigns SET status = $1 WHERE id = $2', ['PAUSED', object.id]);
        else if (object.type === 'ad_group') await query('UPDATE ad_groups SET status = $1 WHERE id = $2', ['PAUSED', object.id]);
        else if (object.type === 'ad') await query('UPDATE ads SET status = $1 WHERE id = $2', ['PAUSED', object.id]);
        if (rule.email_notify) {
          await sendRuleNotification({ ruleName: rule.name, objectName: object.name, objectType: object.type, platform: account.platform, accountName: account.account_name, currency: account.currency, actionType: 'pause', evaluations });
        }
        return { success: true, action: 'pause', message: `Đã tắt ${object.name}` };
      }

      case 'enable':
      case 'bat':
      case 'turn_on': {
        if (service.toggleObjectStatus) {
          await service.toggleObjectStatus(account.credentials, object.external_id, object.type, true);
        } else {
          await service.toggleCampaignStatus(account.credentials, object.external_id, true);
        }
        const enabledStatus = account.platform === 'google' ? 'ENABLED' : 'ACTIVE';
        if (object.type === 'campaign') await query('UPDATE campaigns SET status = $1 WHERE id = $2', [enabledStatus, object.id]);
        else if (object.type === 'ad_group') await query('UPDATE ad_groups SET status = $1 WHERE id = $2', [enabledStatus, object.id]);
        else if (object.type === 'ad') await query('UPDATE ads SET status = $1 WHERE id = $2', [enabledStatus, object.id]);
        if (rule.email_notify) {
          await sendRuleNotification({ ruleName: rule.name, objectName: object.name, objectType: object.type, platform: account.platform, accountName: account.account_name, currency: account.currency, actionType: 'enable', evaluations });
        }
        return { success: true, action: 'enable', message: `Đã bật ${object.name}` };
      }

      case 'notify':
      case 'send_email':
      case 'gui_thong_bao':
        if (rule.email_notify) {
          await sendRuleNotification({ ruleName: rule.name, objectName: object.name, objectType: object.type, platform: account.platform, accountName: account.account_name, currency: account.currency, actionType: 'notify', evaluations });
        }
        return { success: true, action: 'notify', message: 'Đã gửi email thông báo' };

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
 * Cooldown per-target
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
 */
const executeRule = async (rule, options = {}) => {
  const { bypassCooldown = false } = options;
  const startTime = Date.now();

  try {
    await query(
      'UPDATE rules SET last_run_at = CURRENT_TIMESTAMP, total_runs = total_runs + 1 WHERE id = $1',
      [rule.id]
    );

    // Lấy danh sách account
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
      return { success: false, message: 'Không có tài khoản phù hợp' };
    }

    const allResults = [];
    const debugEvals = [];
    let totalCooldownSkipped = 0;

    for (const account of accounts.rows) {
      const svc = getService(account.platform);
      const conditions = Array.isArray(rule.conditions)
        ? rule.conditions
        : JSON.parse(rule.conditions || '[]');

      // ──────────────────────────────────────────────────────────────────
      // Bước 1: Gọi API lấy dữ liệu cho từng timeRange trong conditions
      //         Y hệt cách tab chiến dịch lấy số liệu — đúng khoảng thời gian
      // ──────────────────────────────────────────────────────────────────
      const metricConditions = conditions.filter(c => c.metric !== 'time' && c.metric !== 'name');
      const uniqueTimeRanges = [...new Set(metricConditions.map(c => c.timeRange || 'today'))];

      const apiMetricsByRange = {};
      // apiStatusMap[external_id] = status hiện tại từ API (để filter theo trạng thái)
      const apiStatusMap = {};

      for (const tr of uniqueTimeRanges) {
        const dateRange = getDateRange(tr);
        try {
          if (svc.getAllScopeMetrics) {
            const metricsMap = await svc.getAllScopeMetrics(account.credentials, dateRange, rule.scope);
            apiMetricsByRange[tr] = metricsMap;
            // Cập nhật status map từ API (chỉ cho campaign scope vì chỉ getCampaigns trả status)
            if (rule.scope === 'campaign') {
              const campaigns = await svc.getCampaigns(account.credentials, dateRange);
              for (const c of campaigns) {
                if (!apiStatusMap[String(c.external_id)]) {
                  apiStatusMap[String(c.external_id)] = c.status;
                }
              }
            }
            logger.info(`Rule ${rule.id} [${account.account_name}]: ${tr} scope=${rule.scope} → ${Object.keys(metricsMap).length} items (${dateRange.from}→${dateRange.to})`);
          } else {
            // Fallback cho platform chưa có getAllScopeMetrics
            const campaigns = await svc.getCampaigns(account.credentials, dateRange);
            apiMetricsByRange[tr] = {};
            for (const c of campaigns) {
              apiMetricsByRange[tr][String(c.external_id)] = c.metrics;
              if (!apiStatusMap[String(c.external_id)]) apiStatusMap[String(c.external_id)] = c.status;
            }
          }
        } catch (err) {
          logger.warn(`Rule ${rule.id}: Lỗi lấy dữ liệu API ${tr}: ${err.message}`);
        }
      }

      // ──────────────────────────────────────────────────────────────────
      // Bước 2: Lấy danh sách targets từ DB (để có internal id cho history/cooldown)
      // Khi scope là ad_group/ad và target_mode='specific', target_ids chứa campaign IDs
      // → lọc bằng campaign_id ngay tại bước này, không lọc lại ở bước 3
      // ──────────────────────────────────────────────────────────────────
      let targets = [];
      let filteredByParentCampaign = false;

      const parseTargetIds = (raw) => {
        const list = Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw) : []);
        return list.map(t => Number(typeof t === 'object' ? t.id : t));
      };

      if (rule.scope === 'campaign') {
        const r = await query(
          'SELECT id, external_id, name, status FROM campaigns WHERE account_id = $1',
          [account.id]
        );
        targets = r.rows.map(c => ({
          ...c,
          status: apiStatusMap[String(c.external_id)] || c.status,
          type: 'campaign',
        }));
      } else if (rule.scope === 'ad_group') {
        if (rule.target_mode === 'specific') {
          const campaignIds = parseTargetIds(rule.target_ids);
          if (campaignIds.length > 0) {
            const r = await query(
              'SELECT id, external_id, name, status FROM ad_groups WHERE account_id = $1 AND campaign_id = ANY($2)',
              [account.id, campaignIds]
            );
            targets = r.rows.map(g => ({ ...g, type: 'ad_group' }));
          }
          filteredByParentCampaign = true;
        } else {
          const r = await query(
            'SELECT id, external_id, name, status FROM ad_groups WHERE account_id = $1',
            [account.id]
          );
          targets = r.rows.map(g => ({ ...g, type: 'ad_group' }));
        }
      } else if (rule.scope === 'ad') {
        if (rule.target_mode === 'specific') {
          const campaignIds = parseTargetIds(rule.target_ids);
          if (campaignIds.length > 0) {
            const r = await query(
              'SELECT id, external_id, name, status FROM ads WHERE account_id = $1 AND campaign_id = ANY($2)',
              [account.id, campaignIds]
            );
            targets = r.rows.map(a => ({ ...a, type: 'ad' }));
          }
          filteredByParentCampaign = true;
        } else {
          const r = await query(
            'SELECT id, external_id, name, status FROM ads WHERE account_id = $1',
            [account.id]
          );
          targets = r.rows.map(a => ({ ...a, type: 'ad' }));
        }
      }

      // ──────────────────────────────────────────────────────────────────
      // Bước 3: Lọc targets theo target_mode và target_status_filter
      // ──────────────────────────────────────────────────────────────────
      if (!filteredByParentCampaign && rule.target_mode === 'specific') {
        const rawIds = parseTargetIds(rule.target_ids);
        if (rawIds.length > 0) {
          const allowedIds = new Set(rawIds);
          targets = targets.filter(t => allowedIds.has(Number(t.id)));
        } else {
          targets = [];
        }
      }

      if (rule.target_status_filter && rule.target_status_filter !== 'all') {
        const ACTIVE  = ['ENABLED', 'ACTIVE', 'ENABLE'];
        const PAUSED  = ['PAUSED',  'PAUSE',  'DISABLED', 'DISABLE'];
        targets = targets.filter(t => {
          const s = (t.status || '').toUpperCase();
          if (rule.target_status_filter === 'active') return ACTIVE.includes(s);
          if (rule.target_status_filter === 'paused') return PAUSED.includes(s);
          return true;
        });
      }

      // ──────────────────────────────────────────────────────────────────
      // Bước 4: Đánh giá điều kiện và thực thi action từng target
      // ──────────────────────────────────────────────────────────────────
      for (const target of targets) {
        if (!bypassCooldown) {
          const inCooldown = await isTargetInCooldown(rule.id, target.external_id, rule.cooldown_minutes);
          if (inCooldown) {
            totalCooldownSkipped++;
            continue;
          }
        }

        const evalResult = evaluateAllConditions(conditions, rule.conditions_logic || 'AND', target, account, apiMetricsByRange);

        // Lưu debug info cho mọi target
        debugEvals.push({
          target: target.name,
          status: target.status,
          passed: evalResult.passed,
          evaluations: evalResult.evaluations,
        });

        if (!evalResult.passed) continue;

        // Bỏ qua nếu action pause/enable mà status đã đúng rồi
        const actionTypes = conditions.length > 0 ? rule.actions.map(a => a.type) : [];
        const hasPause  = rule.actions.some(a => ['pause',  'tat',  'turn_off'].includes(a.type));
        const hasEnable = rule.actions.some(a => ['enable', 'bat',  'turn_on' ].includes(a.type));
        const s = (target.status || '').toUpperCase();
        const isAlreadyPaused = ['PAUSED', 'PAUSE', 'DISABLED', 'DISABLE'].includes(s);
        const isAlreadyActive = ['ENABLED', 'ACTIVE', 'ENABLE'].includes(s);
        if (hasPause  && isAlreadyPaused) { debugEvals[debugEvals.length - 1].skipped = 'already_paused'; continue; }
        if (hasEnable && isAlreadyActive)  { debugEvals[debugEvals.length - 1].skipped = 'already_active'; continue; }

        // Thực thi actions
        const actionsResults = [];
        for (const action of rule.actions) {
          const r = await executeAction(action, target, account, rule, evalResult.evaluations);
          actionsResults.push(r);
        }

        const allSuccess = actionsResults.every(r => r.success);
        const status   = allSuccess ? 'success' : 'failed';
        const messages = actionsResults.map(r => r.message).join('; ');

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

        await query(
          'UPDATE rules SET last_triggered_at = CURRENT_TIMESTAMP, total_triggers = total_triggers + 1 WHERE id = $1',
          [rule.id]
        );

        await logEvent({
          userId: rule.user_id, accountId: account.id,
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
  const result = await query(`SELECT * FROM rules WHERE is_active = TRUE`);
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
