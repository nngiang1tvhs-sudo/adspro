const express = require('express');
const router = express.Router();

const { authenticate } = require('../middleware/auth');
const authController = require('../controllers/authController');
const accountsController = require('../controllers/accountsController');
const campaignsController = require('../controllers/campaignsController');
const dashboardController = require('../controllers/dashboardController');
const rulesController = require('../controllers/rulesController');
const historyController = require('../controllers/historyController');
const settingsController = require('../controllers/settingsController');

// ===== AUTH =====
router.post('/auth/login', authController.login);
router.post('/auth/logout', authenticate, authController.logout);
router.get('/auth/me', authenticate, authController.getMe);
router.put('/auth/password', authenticate, authController.changePassword);

// ===== DASHBOARD =====
router.get('/dashboard/:platform', authenticate, dashboardController.getDashboard);
router.get('/dashboard/:platform/accounts', authenticate, dashboardController.getAccountsForPlatform);

// ===== ACCOUNTS =====
router.get('/accounts', authenticate, accountsController.listAccounts);
router.post('/accounts/test', authenticate, accountsController.testConnection);
router.post('/accounts', authenticate, accountsController.createAccount);
router.put('/accounts/:id', authenticate, accountsController.updateAccount);
router.delete('/accounts/:id', authenticate, accountsController.deleteAccount);
router.post('/accounts/:id/test', authenticate, accountsController.testExistingAccount);

// ===== CAMPAIGNS =====
router.get('/campaigns', authenticate, campaignsController.listCampaigns);
router.get('/campaigns/targets', authenticate, campaignsController.listTargets);
router.get('/campaigns/:id/ad-groups', authenticate, campaignsController.listAdGroups);
router.get('/campaigns/ad-groups/:adGroupId/ads', authenticate, campaignsController.listAds);
router.post('/campaigns/:id/toggle', authenticate, campaignsController.toggleCampaign);
router.post('/campaigns/ad-groups/:externalId/toggle', authenticate, campaignsController.toggleAdGroup);
router.post('/campaigns/ads/:externalId/toggle', authenticate, campaignsController.toggleAd);
router.post('/campaigns/sync', authenticate, campaignsController.syncCampaigns);

// ===== RULES =====
router.get('/rules', authenticate, rulesController.listRules);
router.get('/rules/:id', authenticate, rulesController.getRule);
router.post('/rules', authenticate, rulesController.createRule);
router.put('/rules/:id', authenticate, rulesController.updateRule);
router.delete('/rules/:id', authenticate, rulesController.deleteRule);
router.post('/rules/:id/run', authenticate, rulesController.runRule);
router.post('/rules/:id/toggle', authenticate, rulesController.toggleRule);

// ===== HISTORY =====
router.get('/history/audit', authenticate, historyController.getAuditLogs);
router.get('/history/rules', authenticate, historyController.getRuleHistory);
router.get('/history/sync', authenticate, historyController.getSyncHistory);

// ===== SETTINGS =====
router.get('/settings', authenticate, settingsController.getSettings);
router.put('/settings', authenticate, settingsController.updateSettings);
router.post('/settings/test-email', authenticate, settingsController.testEmailSetting);
router.post('/settings/send-report', authenticate, settingsController.sendReportNow);
router.get('/settings/column-presets', authenticate, settingsController.getColumnPresets);
router.post('/settings/column-presets', authenticate, settingsController.createColumnPreset);
router.put('/settings/column-presets/:id', authenticate, settingsController.updateColumnPreset);
router.delete('/settings/column-presets/:id', authenticate, settingsController.deleteColumnPreset);

// ===== HEALTH CHECK =====
router.get('/health', (req, res) => {
  res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
