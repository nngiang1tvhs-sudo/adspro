import axios from 'axios';
import toast from 'react-hot-toast';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 60000,
});

// Request interceptor - thêm token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('adspro_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor - xử lý lỗi
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message = error.response?.data?.message || error.message || 'Có lỗi xảy ra';
    const status = error.response?.status;

    if (status === 401) {
      localStorage.removeItem('adspro_token');
      localStorage.removeItem('adspro_user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    return Promise.reject({ message, status, data: error.response?.data });
  }
);

// ==== AUTH ====
export const authApi = {
  login: (username, password) => api.post('/auth/login', { username, password }),
  logout: () => api.post('/auth/logout'),
  getMe: () => api.get('/auth/me'),
  changePassword: (currentPassword, newPassword) =>
    api.put('/auth/password', { currentPassword, newPassword }),
};

// ==== DASHBOARD ====
export const dashboardApi = {
  get: (platform, params) => api.get(`/dashboard/${platform}`, { params }),
  getAccounts: (platform) => api.get(`/dashboard/${platform}/accounts`),
};

// ==== ACCOUNTS ====
export const accountsApi = {
  list: (platform) => api.get('/accounts', { params: { platform } }),
  test: (platform, credentials) => api.post('/accounts/test', { platform, credentials }),
  create: (data) => api.post('/accounts', data),
  update: (id, data) => api.put(`/accounts/${id}`, data),
  delete: (id) => api.delete(`/accounts/${id}`),
  testExisting: (id) => api.post(`/accounts/${id}/test`),
};

// ==== CAMPAIGNS ====
export const campaignsApi = {
  list: (params) => api.get('/campaigns', { params }),
  getAdGroups: (campaignId, params) => api.get(`/campaigns/${campaignId}/ad-groups`, { params }),
  getAds: (adGroupId, params) => api.get(`/campaigns/ad-groups/${adGroupId}/ads`, { params }),
  toggle: (id, enable) => api.post(`/campaigns/${id}/toggle`, { enable }),
  toggleAdGroup: (externalId, accountId, enable) => api.post(`/campaigns/ad-groups/${externalId}/toggle`, { enable, account_id: accountId }),
  toggleAd: (externalId, accountId, enable) => api.post(`/campaigns/ads/${externalId}/toggle`, { enable, account_id: accountId }),
  sync: (accountId) => api.post('/campaigns/sync', { account_id: accountId }),
  getTargets: (params) => api.get('/campaigns/targets', { params }),
};

// ==== RULES ====
export const rulesApi = {
  list: (params) => api.get('/rules', { params }),
  get: (id) => api.get(`/rules/${id}`),
  create: (data) => api.post('/rules', data),
  update: (id, data) => api.put(`/rules/${id}`, data),
  delete: (id) => api.delete(`/rules/${id}`),
  run: (id) => api.post(`/rules/${id}/run`),
  toggle: (id, isActive) => api.post(`/rules/${id}/toggle`, { is_active: isActive }),
};

// ==== HISTORY ====
export const historyApi = {
  audit: (params) => api.get('/history/audit', { params }),
  rules: (params) => api.get('/history/rules', { params }),
  sync: (params) => api.get('/history/sync', { params }),
};

// ==== SETTINGS ====
export const settingsApi = {
  get: () => api.get('/settings'),
  update: (data) => api.put('/settings', data),
  testEmail: (to) => api.post('/settings/test-email', { to }),
  sendReport: () => api.post('/settings/send-report'),
  getColumnPresets: (platform) => api.get('/settings/column-presets', { params: { platform } }),
  createColumnPreset: (data) => api.post('/settings/column-presets', data),
  updateColumnPreset: (id, data) => api.put(`/settings/column-presets/${id}`, data),
  deleteColumnPreset: (id) => api.delete(`/settings/column-presets/${id}`),
};

export default api;
