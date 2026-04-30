const { query } = require('../config/database');
const logger = require('./logger');

/**
 * Ghi log hoạt động vào DB
 * @param {Object} params
 * @param {number} params.userId - ID người dùng
 * @param {number} params.accountId - ID tài khoản ads (optional)
 * @param {string} params.eventType - Loại sự kiện (LOGIN, RULE_EXEC, API_ERROR, SYNC, EMAIL...)
 * @param {string} params.level - Mức độ (info|success|warning|error)
 * @param {string} params.message - Nội dung log
 * @param {Object} params.details - Chi tiết bổ sung (optional)
 * @param {string} params.ipAddress - Địa chỉ IP (optional)
 */
const logEvent = async ({ userId = null, accountId = null, eventType, level = 'info', message, details = {}, ipAddress = null }) => {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, account_id, event_type, level, message, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, accountId, eventType, level, message, JSON.stringify(details), ipAddress]
    );
  } catch (err) {
    logger.error('Failed to write audit log:', err.message);
  }
};

const EVENT_TYPES = {
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  LOGIN_FAILED: 'LOGIN_FAILED',
  RULE_CREATED: 'RULE_CREATED',
  RULE_UPDATED: 'RULE_UPDATED',
  RULE_DELETED: 'RULE_DELETED',
  RULE_EXEC: 'RULE_EXEC',
  RULE_TRIGGERED: 'RULE_TRIGGERED',
  ACCOUNT_CONNECTED: 'ACCOUNT_CONNECTED',
  ACCOUNT_UPDATED: 'ACCOUNT_UPDATED',
  ACCOUNT_DELETED: 'ACCOUNT_DELETED',
  ACCOUNT_TEST: 'ACCOUNT_TEST',
  SYNC_START: 'SYNC_START',
  SYNC_SUCCESS: 'SYNC_SUCCESS',
  SYNC_FAILED: 'SYNC_FAILED',
  API_ERROR: 'API_ERROR',
  EMAIL_SENT: 'EMAIL_SENT',
  EMAIL_FAILED: 'EMAIL_FAILED',
  CAMPAIGN_TOGGLE: 'CAMPAIGN_TOGGLE',
  TOKEN_EXPIRING: 'TOKEN_EXPIRING',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
};

module.exports = { logEvent, EVENT_TYPES };
