import dayjs from 'dayjs';

export const PLATFORMS = ['google', 'facebook', 'tiktok'];

export const PLATFORM_LABELS = {
  google: 'Google Ads',
  facebook: 'Facebook Ads',
  tiktok: 'TikTok Ads',
};

export const PLATFORM_COLORS = {
  google: '#4285F4',
  facebook: '#1877F2',
  tiktok: '#010101',
};

/**
 * Format số thành dạng đẹp: 1.5M, 12K, 1,234
 */
export const formatNumber = (n) => {
  const num = Number(n) || 0;
  return new Intl.NumberFormat('vi-VN').format(Math.round(num));
};

/**
 * Format tiền theo currency code (VND, USD, JPY, ...)
 */
export const formatCurrency = (n, currencyOrOptions = 'VND') => {
  const num = Number(n) || 0;
  const cur = (
    typeof currencyOrOptions === 'string'
      ? currencyOrOptions
      : (currencyOrOptions?.currency || 'VND')
  ).toUpperCase();
  try {
    const noDecimal = ['VND', 'JPY', 'KRW', 'IDR'].includes(cur);
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: cur,
      minimumFractionDigits: noDecimal ? 0 : 2,
      maximumFractionDigits: noDecimal ? 0 : 2,
    }).format(num);
  } catch {
    return new Intl.NumberFormat('vi-VN').format(Math.round(num)) + ' ' + cur;
  }
};

/**
 * Format phần trăm
 */
export const formatPercent = (n, decimals = 2) => {
  const num = Number(n) || 0;
  return num.toFixed(decimals) + '%';
};

/**
 * Format ngày
 */
export const formatDate = (d, format = 'DD/MM/YYYY') => {
  if (!d) return '';
  return dayjs(d).format(format);
};

export const formatDateTime = (d) => {
  if (!d) return '';
  return dayjs(d).format('HH:mm DD/MM/YYYY');
};

export const timeAgo = (d) => {
  if (!d) return '';
  const diffMs = Date.now() - new Date(d).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'Vừa xong';
  if (diffMin < 60) return `${diffMin} phút trước`;
  if (diffHour < 24) return `${diffHour} giờ trước`;
  if (diffDay < 30) return `${diffDay} ngày trước`;
  return formatDate(d);
};

/**
 * Map status sang badge class
 */
export const getStatusBadge = (status) => {
  const s = String(status || '').toUpperCase();
  if (['ENABLED', 'ACTIVE', 'ENABLE'].includes(s)) return { class: 'badge-success', label: 'Đang chạy' };
  if (['PAUSED', 'PAUSE', 'DISABLE'].includes(s)) return { class: 'badge-warning', label: 'Tạm dừng' };
  if (['REMOVED', 'DELETED', 'ARCHIVED'].includes(s)) return { class: 'badge-error', label: 'Đã xóa' };
  return { class: 'badge-info', label: status || 'Khác' };
};

/**
 * Date range presets
 */
export const DATE_PRESETS = [
  { key: 'today', label: 'Hôm nay', getValue: () => ({ from: dayjs().format('YYYY-MM-DD'), to: dayjs().format('YYYY-MM-DD') }) },
  { key: 'yesterday', label: 'Hôm qua', getValue: () => ({ from: dayjs().subtract(1, 'day').format('YYYY-MM-DD'), to: dayjs().subtract(1, 'day').format('YYYY-MM-DD') }) },
  { key: '7d', label: '7 ngày qua', getValue: () => ({ from: dayjs().subtract(6, 'day').format('YYYY-MM-DD'), to: dayjs().format('YYYY-MM-DD') }) },
  { key: '14d', label: '14 ngày qua', getValue: () => ({ from: dayjs().subtract(13, 'day').format('YYYY-MM-DD'), to: dayjs().format('YYYY-MM-DD') }) },
  { key: '30d', label: '30 ngày qua', getValue: () => ({ from: dayjs().subtract(29, 'day').format('YYYY-MM-DD'), to: dayjs().format('YYYY-MM-DD') }) },
  { key: 'this_month', label: 'Tháng này', getValue: () => ({ from: dayjs().startOf('month').format('YYYY-MM-DD'), to: dayjs().format('YYYY-MM-DD') }) },
  { key: 'last_month', label: 'Tháng trước', getValue: () => ({ from: dayjs().subtract(1, 'month').startOf('month').format('YYYY-MM-DD'), to: dayjs().subtract(1, 'month').endOf('month').format('YYYY-MM-DD') }) },
  { key: 'all_time', label: 'Toàn thời gian', getValue: () => ({ from: 'ALL_TIME', to: 'ALL_TIME' }) },
];

/**
 * Cột chỉ số mặc định cho từng platform
 */
export const DEFAULT_COLUMNS = {
  google: [
    { key: 'name', label: 'Chiến dịch', sticky: true, visible: true },
    { key: 'status', label: 'Trạng thái', visible: true },
    { key: 'objective', label: 'Mục tiêu', visible: true },
    { key: 'budget', label: 'Ngân sách', visible: true, format: 'currency' },
    { key: 'impressions', label: 'Hiển thị', visible: true, format: 'number' },
    { key: 'clicks', label: 'Lượt nhấp', visible: true, format: 'number' },
    { key: 'ctr', label: 'CTR', visible: true, format: 'percent' },
    { key: 'cpc', label: 'CPC', visible: true, format: 'currency' },
    { key: 'spend', label: 'Chi phí', visible: true, format: 'currency', pinned: true },
    { key: 'video_views', label: 'TrueView', visible: true, format: 'number' },
    { key: 'cpv', label: 'CPV', visible: true, format: 'currency' },
    { key: 'conversions', label: 'Kết quả', visible: true, format: 'number', pinned: true },
    { key: 'cpa', label: 'CP/KQ', visible: true, format: 'currency', pinned: true },
    { key: 'roas', label: 'ROAS', visible: true, format: 'roas' },
    { key: 'impression_share', label: 'Impr.Share', visible: true, format: 'percent' },
    { key: 'cpm', label: 'CPM', visible: false, format: 'currency' },
    { key: 'engagements', label: 'Tương tác', visible: false, format: 'number' },
    { key: 'video_p25', label: 'Video 25%', visible: false, format: 'percent' },
    { key: 'video_p50', label: 'Video 50%', visible: false, format: 'percent' },
    { key: 'video_p75', label: 'Video 75%', visible: false, format: 'percent' },
    { key: 'video_p100', label: 'Video 100%', visible: false, format: 'percent' },
  ],
  facebook: [
    { key: 'name', label: 'Chiến dịch', sticky: true, visible: true },
    { key: 'status', label: 'Trạng thái', visible: true },
    { key: 'objective', label: 'Mục tiêu', visible: true },
    { key: 'budget', label: 'Ngân sách', visible: true, format: 'currency' },
    { key: 'impressions', label: 'Hiển thị', visible: true, format: 'number' },
    { key: 'reach', label: 'Tiếp cận', visible: true, format: 'number' },
    { key: 'frequency', label: 'Tần suất', visible: false, format: 'decimal' },
    { key: 'clicks', label: 'Lượt nhấp', visible: true, format: 'number' },
    { key: 'ctr', label: 'CTR', visible: true, format: 'percent' },
    { key: 'cpc', label: 'CPC', visible: true, format: 'currency' },
    { key: 'cpm', label: 'CPM', visible: true, format: 'currency' },
    { key: 'spend', label: 'Chi phí', visible: true, format: 'currency', pinned: true },
    { key: 'conversions', label: 'Kết quả', visible: true, format: 'number', pinned: true },
    { key: 'cpa', label: 'CP/KQ', visible: true, format: 'currency', pinned: true },
    { key: 'roas', label: 'ROAS', visible: true, format: 'roas' },
    { key: 'messages', label: 'Tin nhắn', visible: false, format: 'number' },
    { key: 'page_likes', label: 'Thích trang', visible: false, format: 'number' },
    { key: 'post_engagements', label: 'Tương tác', visible: false, format: 'number' },
    { key: 'video_2s_views', label: 'Video 2s', visible: false, format: 'number' },
    { key: 'purchases', label: 'Đơn hàng', visible: false, format: 'number' },
  ],
  tiktok: [
    { key: 'name', label: 'Chiến dịch', sticky: true, visible: true },
    { key: 'status', label: 'Trạng thái', visible: true },
    { key: 'objective', label: 'Mục tiêu', visible: true },
    { key: 'budget', label: 'Ngân sách', visible: true, format: 'currency' },
    { key: 'impressions', label: 'Hiển thị', visible: true, format: 'number' },
    { key: 'reach', label: 'Tiếp cận', visible: false, format: 'number' },
    { key: 'frequency', label: 'Tần suất', visible: false, format: 'decimal' },
    { key: 'clicks', label: 'Lượt nhấp', visible: true, format: 'number' },
    { key: 'ctr', label: 'CTR', visible: true, format: 'percent' },
    { key: 'cpc', label: 'CPC', visible: true, format: 'currency' },
    { key: 'cpm', label: 'CPM', visible: false, format: 'currency' },
    { key: 'spend', label: 'Chi phí', visible: true, format: 'currency', pinned: true },
    { key: 'video_views', label: 'Video views', visible: true, format: 'number' },
    { key: 'follows', label: 'Follow', visible: true, format: 'number' },
    { key: 'cpv', label: 'CPV', visible: false, format: 'currency' },
    { key: 'cpf', label: 'CPF', visible: false, format: 'currency' },
    { key: 'result', label: 'Kết quả', visible: true, format: 'number', pinned: true },
    { key: 'cost_per_result', label: 'CP/KQ', visible: true, format: 'currency', pinned: true },
    { key: 'conversions', label: 'Đơn hàng', visible: false, format: 'number' },
    { key: 'cpa', label: 'CPA', visible: false, format: 'currency' },
  ],
};

export const formatCellValue = (value, format, currency) => {
  if (value === null || value === undefined) return '—';
  switch (format) {
    case 'currency': return formatCurrency(value, currency || 'VND');
    case 'percent': return formatPercent(value);
    case 'number': return formatNumber(value);
    case 'roas': return Number(value).toFixed(2) + 'x';
    case 'decimal': return Number(value).toFixed(2);
    default: return value;
  }
};
