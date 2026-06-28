import { useState, useEffect } from 'react';
import PlatformTabs from '../components/PlatformTabs';
import DateRangePicker from '../components/DateRangePicker';
import { campaignsApi, dashboardApi, settingsApi } from '../services/api';
import { formatCellValue, getStatusBadge, DEFAULT_COLUMNS, DATE_PRESETS, timeAgo } from '../utils/helpers';
import toast from 'react-hot-toast';
import { Settings, RefreshCw, Search, ChevronRight, Power, X, Plus, Save, Trash2 } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Cot mac dinh cho Ad Sets theo platform
const DEFAULT_ADSET_COLUMNS = {
  google: [
    { key: 'name', label: 'Nhom QC', visible: true, sticky: true },
    { key: 'status', label: 'Trang thai', visible: true },
    { key: 'budget', label: 'Ngan sach', visible: true, format: 'currency' },
    { key: 'impressions', label: 'Hien thi', visible: true, format: 'number' },
    { key: 'clicks', label: 'Luot nhap', visible: true, format: 'number' },
    { key: 'ctr', label: 'CTR', visible: true, format: 'percent' },
    { key: 'cpc', label: 'CPC', visible: true, format: 'currency' },
    { key: 'spend', label: 'Chi phi', visible: true, format: 'currency', pinned: true },
    { key: 'video_views', label: 'TrueView', visible: true, format: 'number' },
    { key: 'cpv', label: 'CPV', visible: true, format: 'currency' },
    { key: 'conversions', label: 'Ket qua', visible: true, format: 'number', pinned: true },
    { key: 'cpa', label: 'CP/KQ', visible: true, format: 'currency', pinned: true },
    { key: 'roas', label: 'ROAS', visible: true, format: 'roas' },
    { key: 'cpm', label: 'CPM', visible: false, format: 'currency' },
  ],
  facebook: [
    { key: 'name', label: 'Nhom QC', visible: true, sticky: true },
    { key: 'status', label: 'Trang thai', visible: true },
    { key: 'budget', label: 'Ngan sach', visible: true, format: 'currency' },
    { key: 'impressions', label: 'Hien thi', visible: true, format: 'number' },
    { key: 'reach', label: 'Tiep can', visible: true, format: 'number' },
    { key: 'frequency', label: 'Tan suat', visible: false, format: 'decimal' },
    { key: 'clicks', label: 'Luot nhap', visible: true, format: 'number' },
    { key: 'ctr', label: 'CTR', visible: true, format: 'percent' },
    { key: 'cpc', label: 'CPC', visible: true, format: 'currency' },
    { key: 'cpm', label: 'CPM', visible: true, format: 'currency' },
    { key: 'spend', label: 'Chi phi', visible: true, format: 'currency', pinned: true },
    { key: 'conversions', label: 'Ket qua', visible: true, format: 'number', pinned: true },
    { key: 'cpa', label: 'CP/KQ', visible: true, format: 'currency', pinned: true },
    { key: 'roas', label: 'ROAS', visible: true, format: 'roas' },
    { key: 'messages', label: 'Tin nhan', visible: false, format: 'number' },
    { key: 'cpp_mess', label: 'CP/Mess', visible: false, format: 'currency' },
    { key: 'page_likes', label: 'Follow', visible: false, format: 'number' },
    { key: 'cpp_follow', label: 'CP/Follow', visible: false, format: 'currency' },
    { key: 'post_engagements', label: 'Tuong tac', visible: false, format: 'number' },
    { key: 'video_2s_views', label: 'Video 2s', visible: false, format: 'number' },
    { key: 'purchases', label: 'Don hang', visible: false, format: 'number' },
  ],
  tiktok: [
    { key: 'name', label: 'Nhom QC', visible: true, sticky: true },
    { key: 'status', label: 'Trang thai', visible: true },
    { key: 'budget', label: 'Ngan sach', visible: true, format: 'currency' },
    { key: 'impressions', label: 'Hien thi', visible: true, format: 'number' },
    { key: 'reach', label: 'Tiep can', visible: false, format: 'number' },
    { key: 'frequency', label: 'Tan suat', visible: false, format: 'decimal' },
    { key: 'clicks', label: 'Luot nhap', visible: true, format: 'number' },
    { key: 'ctr', label: 'CTR', visible: true, format: 'percent' },
    { key: 'cpc', label: 'CPC', visible: true, format: 'currency' },
    { key: 'cpm', label: 'CPM', visible: false, format: 'currency' },
    { key: 'spend', label: 'Chi phi', visible: true, format: 'currency', pinned: true },
    { key: 'video_views', label: 'Video views', visible: true, format: 'number' },
    { key: 'follows', label: 'Follow', visible: true, format: 'number' },
    { key: 'likes', label: 'Likes', visible: false, format: 'number' },
    { key: 'comments', label: 'Comments', visible: false, format: 'number' },
    { key: 'shares', label: 'Shares', visible: false, format: 'number' },
    { key: 'cpv', label: 'CPV', visible: false, format: 'currency' },
    { key: 'cpf', label: 'CPF', visible: false, format: 'currency' },
    { key: 'result', label: 'Ket qua', visible: true, format: 'number', pinned: true },
    { key: 'cost_per_result', label: 'CP/KQ', visible: true, format: 'currency', pinned: true },
    { key: 'conversions', label: 'Don hang', visible: false, format: 'number' },
    { key: 'cpa', label: 'CPA', visible: false, format: 'currency' },
  ],
};

// Cot mac dinh cho Ads theo platform
const DEFAULT_AD_COLUMNS = {
  google: [
    { key: 'name', label: 'Quang cao', visible: true, sticky: true },
    { key: 'preview', label: 'Hinh/Video', visible: true },
    { key: 'status', label: 'Trang thai', visible: true },
    { key: 'impressions', label: 'Hien thi', visible: true, format: 'number' },
    { key: 'clicks', label: 'Luot nhap', visible: true, format: 'number' },
    { key: 'ctr', label: 'CTR', visible: true, format: 'percent' },
    { key: 'cpc', label: 'CPC', visible: true, format: 'currency' },
    { key: 'spend', label: 'Chi phi', visible: true, format: 'currency', pinned: true },
    { key: 'video_views', label: 'TrueView', visible: true, format: 'number' },
    { key: 'cpv', label: 'CPV', visible: true, format: 'currency' },
    { key: 'conversions', label: 'Ket qua', visible: true, format: 'number', pinned: true },
    { key: 'cpa', label: 'CP/KQ', visible: true, format: 'currency', pinned: true },
    { key: 'roas', label: 'ROAS', visible: true, format: 'roas' },
    { key: 'cpm', label: 'CPM', visible: false, format: 'currency' },
  ],
  facebook: [
    { key: 'name', label: 'Quang cao', visible: true, sticky: true },
    { key: 'preview', label: 'Hinh/Video', visible: true },
    { key: 'status', label: 'Trang thai', visible: true },
    { key: 'impressions', label: 'Hien thi', visible: true, format: 'number' },
    { key: 'reach', label: 'Tiep can', visible: true, format: 'number' },
    { key: 'frequency', label: 'Tan suat', visible: false, format: 'decimal' },
    { key: 'clicks', label: 'Luot nhap', visible: true, format: 'number' },
    { key: 'ctr', label: 'CTR', visible: true, format: 'percent' },
    { key: 'cpc', label: 'CPC', visible: true, format: 'currency' },
    { key: 'cpm', label: 'CPM', visible: true, format: 'currency' },
    { key: 'spend', label: 'Chi phi', visible: true, format: 'currency', pinned: true },
    { key: 'conversions', label: 'Ket qua', visible: true, format: 'number', pinned: true },
    { key: 'cpa', label: 'CP/KQ', visible: true, format: 'currency', pinned: true },
    { key: 'roas', label: 'ROAS', visible: true, format: 'roas' },
    { key: 'messages', label: 'Tin nhan', visible: false, format: 'number' },
    { key: 'cpp_mess', label: 'CP/Mess', visible: false, format: 'currency' },
    { key: 'page_likes', label: 'Follow', visible: false, format: 'number' },
    { key: 'cpp_follow', label: 'CP/Follow', visible: false, format: 'currency' },
    { key: 'post_engagements', label: 'Tuong tac', visible: false, format: 'number' },
    { key: 'video_2s_views', label: 'Video 2s', visible: false, format: 'number' },
    { key: 'purchases', label: 'Don hang', visible: false, format: 'number' },
  ],
  tiktok: [
    { key: 'name', label: 'Quang cao', visible: true, sticky: true },
    { key: 'preview', label: 'Hinh/Video', visible: true },
    { key: 'status', label: 'Trang thai', visible: true },
    { key: 'impressions', label: 'Hien thi', visible: true, format: 'number' },
    { key: 'reach', label: 'Tiep can', visible: false, format: 'number' },
    { key: 'frequency', label: 'Tan suat', visible: false, format: 'decimal' },
    { key: 'clicks', label: 'Luot nhap', visible: true, format: 'number' },
    { key: 'ctr', label: 'CTR', visible: true, format: 'percent' },
    { key: 'cpc', label: 'CPC', visible: true, format: 'currency' },
    { key: 'cpm', label: 'CPM', visible: false, format: 'currency' },
    { key: 'spend', label: 'Chi phi', visible: true, format: 'currency', pinned: true },
    { key: 'video_views', label: 'Video views', visible: true, format: 'number' },
    { key: 'follows', label: 'Follow', visible: true, format: 'number' },
    { key: 'likes', label: 'Likes', visible: false, format: 'number' },
    { key: 'comments', label: 'Comments', visible: false, format: 'number' },
    { key: 'shares', label: 'Shares', visible: false, format: 'number' },
    { key: 'cpv', label: 'CPV', visible: false, format: 'currency' },
    { key: 'cpf', label: 'CPF', visible: false, format: 'currency' },
    { key: 'result', label: 'Ket qua', visible: true, format: 'number', pinned: true },
    { key: 'cost_per_result', label: 'CP/KQ', visible: true, format: 'currency', pinned: true },
    { key: 'conversions', label: 'Don hang', visible: false, format: 'number' },
    { key: 'cpa', label: 'CPA', visible: false, format: 'currency' },
  ],
};

// Tinh hang tong tu danh sach items (campaigns/adgroups/ads)
function computeTotals(items, getBudget, getMetric) {
  const sum = (key) => items.reduce((s, item) => s + Number(getMetric(item, key) || 0), 0);

  const totalBudget = items.reduce((s, item) => s + Number(getBudget(item) || 0), 0);
  const totalSpend = sum('spend');
  const totalImpressions = sum('impressions');
  const totalClicks = sum('clicks');
  const totalConversions = sum('conversions');
  const totalReach = sum('reach');
  const totalVideoViews = sum('video_views');
  const totalFollows = sum('follows');
  const totalMessages = sum('messages');
  const totalPageLikes = sum('page_likes');
  const totalEngagements = sum('engagements');
  const totalPostEngagements = sum('post_engagements');
  const totalVideo2s = sum('video_2s_views');
  const totalPurchases = sum('purchases');
  const totalResult = sum('result');
  const totalLikes = sum('likes');
  const totalComments = sum('comments');
  const totalShares = sum('shares');
  const totalConversionValue = sum('conversion_value');

  return {
    budget: totalBudget,
    spend: totalSpend,
    impressions: totalImpressions,
    clicks: totalClicks,
    conversions: totalConversions,
    reach: totalReach,
    video_views: totalVideoViews,
    follows: totalFollows,
    messages: totalMessages,
    page_likes: totalPageLikes,
    engagements: totalEngagements,
    post_engagements: totalPostEngagements,
    video_2s_views: totalVideo2s,
    purchases: totalPurchases,
    result: totalResult,
    likes: totalLikes,
    comments: totalComments,
    shares: totalShares,
    ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
    cpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
    cpm: totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0,
    cpa: totalConversions > 0 ? totalSpend / totalConversions : 0,
    cpv: totalVideoViews > 0 ? totalSpend / totalVideoViews : 0,
    cpf: totalFollows > 0 ? totalSpend / totalFollows : 0,
    cpp_mess: totalMessages > 0 ? totalSpend / totalMessages : 0,
    cpp_follow: totalPageLikes > 0 ? totalSpend / totalPageLikes : 0,
    cost_per_result: totalResult > 0 ? totalSpend / totalResult : 0,
    frequency: totalReach > 0 ? totalImpressions / totalReach : 0,
    roas: totalSpend > 0 ? totalConversionValue / totalSpend : 0,
    impression_share: items.length > 0 ? items.reduce((s, item) => s + Number(getMetric(item, 'impression_share') || 0), 0) / items.length : 0,
  };
}

// Sortable column header
function SortableHeader({ col, sortKey, sortDir, onSort }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: col.key });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const isActive = sortKey === col.key;
  return (
    <th
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onSort(col.key)}
      className="text-left px-3 py-2.5 text-[11px] font-medium text-slate-500 uppercase tracking-wide cursor-pointer whitespace-nowrap bg-slate-50 border-b border-slate-200 select-none hover:bg-slate-100"
    >
      <span className="inline-flex items-center gap-1">
        {col.label}
        <span className={isActive ? 'text-blue-500' : 'text-slate-300'}>
          {isActive ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </span>
    </th>
  );
}

export default function CampaignsPage() {
  const [platform, setPlatform] = useState('google');
  const [dateRange, setDateRange] = useState(DATE_PRESETS[4].getValue());
  const [accounts, setAccounts] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [accountId, setAccountId] = useState('');
  const [status, setStatus] = useState('ACTIVE_ALL');
  const [objective, setObjective] = useState('');
  const [search, setSearch] = useState('');

  const [campaigns, setCampaigns] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(false);

  // Column presets
  const [columns, setColumns] = useState(DEFAULT_COLUMNS.google);
  const [showColSettings, setShowColSettings] = useState(false);
  const [presets, setPresets] = useState([]);
  const [activePreset, setActivePreset] = useState('default');
  const [newPresetName, setNewPresetName] = useState('');
  const [showSavePreset, setShowSavePreset] = useState(false);

  // Drill-down
  const [drillDown, setDrillDown] = useState(null);
  const [drillData, setDrillData] = useState([]);
  const [drillLoading, setDrillLoading] = useState(false);

  // Drill-down column settings
  const [adsetColumns, setAdsetColumns] = useState(DEFAULT_ADSET_COLUMNS.google);
  const [adColumns, setAdColumns] = useState(DEFAULT_AD_COLUMNS.google);
  const [showDrillColSettings, setShowDrillColSettings] = useState(false);

  // Sort
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    const loadSavedCols = (storageKey, defaults) => {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) return JSON.parse(saved);
      } catch {}
      return defaults;
    };
    setColumns(loadSavedCols(`cols_campaign_${platform}`, DEFAULT_COLUMNS[platform]));
    setAdsetColumns(loadSavedCols(`cols_adset_${platform}`, DEFAULT_ADSET_COLUMNS[platform]));
    setAdColumns(loadSavedCols(`cols_ad_${platform}`, DEFAULT_AD_COLUMNS[platform]));
    setActivePreset('default');
    setGroupName('');
    setAccountId('');
    setDrillDown(null);
    loadAccounts();
    loadPresets();
  }, [platform]);

  useEffect(() => {
    loadCampaigns();
  }, [platform, accountId, dateRange]);

  const loadAccounts = async () => {
    try {
      const res = await dashboardApi.getAccounts(platform);
      setAccounts(res.data.accounts);
    } catch (err) {}
  };

  const loadPresets = async () => {
    try {
      const res = await settingsApi.getColumnPresets(platform);
      setPresets(res.data.presets);
    } catch (err) {}
  };

  const loadCampaigns = async () => {
    setLoading(true);
    try {
      const res = await campaignsApi.list({
        platform,
        account_id: accountId || undefined,
        date_from: dateRange.from,
        date_to: dateRange.to,
      });
      setCampaigns(res.data.campaigns);
      setSummary(res.data.summary);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Các nhóm tài khoản có trong platform hiện tại
  const accountGroups = [...new Set(accounts.map(a => a.group_name).filter(Boolean))].sort();

  // Tài khoản hiển thị trong dropdown (lọc theo nhóm nếu đã chọn)
  const visibleAccounts = groupName ? accounts.filter(a => a.group_name === groupName) : accounts;

  // Lọc campaign client-side
  const filteredCampaigns = campaigns.filter(c => {
    if (groupName && !accountId) {
      const groupAccountIds = new Set(accounts.filter(a => a.group_name === groupName).map(a => a.id));
      if (!groupAccountIds.has(c.account_id)) return false;
    }
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (objective && c.objective !== objective) return false;
    if (status === 'ACTIVE_ALL') return ['ENABLED', 'ACTIVE', 'ENABLE'].includes(c.status);
    if (status === 'PAUSED_ALL') return ['PAUSED', 'PAUSE', 'DISABLE'].includes(c.status);
    if (status === 'REMOVED_ALL') return ['REMOVED', 'DELETED', 'ARCHIVED'].includes(c.status);
    return true;
  });

  const displayCampaigns = sortKey
    ? [...filteredCampaigns].sort((a, b) => {
        const getVal = (c) => {
          if (sortKey === 'name') return (c.name || '').toLowerCase();
          if (sortKey === 'status') return c.status || '';
          if (sortKey === 'objective') return c.objective || '';
          if (sortKey === 'budget') return Number(c.budget || 0);
          return Number(c.metrics?.[sortKey] ?? 0);
        };
        const av = getVal(a), bv = getVal(b);
        if (av < bv) return sortDir === 'asc' ? -1 : 1;
        if (av > bv) return sortDir === 'asc' ? 1 : -1;
        return 0;
      })
    : filteredCampaigns;

  const handleSync = async () => {
    setLoading(true);
    try {
      const res = await campaignsApi.sync(accountId || null);
      toast.success(res.message);
      await loadCampaigns();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleCampaign = async (camp) => {
    const newStatus = !['ENABLED', 'ACTIVE', 'ENABLE'].includes(camp.status);
    try {
      await campaignsApi.toggle(camp.id, newStatus);
      toast.success(newStatus ? 'Da bat chien dich' : 'Da tat chien dich');
      await loadCampaigns();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleToggleAdGroup = async (ag) => {
    const isActive = ['ENABLED', 'ACTIVE', 'ENABLE'].includes(String(ag.status || '').toUpperCase());
    const newEnable = !isActive;
    try {
      await campaignsApi.toggleAdGroup(ag.external_id, drillDown.campaign.account_id, newEnable);
      toast.success(newEnable ? 'Da bat nhom quang cao' : 'Da tat nhom quang cao');
      // Reload drill data
      await drillToAdGroups(drillDown.campaign);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleToggleAd = async (ad, currentDrillDown) => {
    const isActive = ['ENABLED', 'ACTIVE', 'ENABLE'].includes(String(ad.status || '').toUpperCase());
    const newEnable = !isActive;
    try {
      await campaignsApi.toggleAd(ad.external_id, currentDrillDown.campaign.account_id, newEnable);
      toast.success(newEnable ? 'Da bat quang cao' : 'Da tat quang cao');
      await drillToAds(currentDrillDown.adGroup);
    } catch (err) {
      toast.error(err.message);
    }
  };

  // === COLUMN PRESET FUNCTIONS ===
  const handleSavePreset = async () => {
    if (!newPresetName.trim()) {
      toast.error('Vui long nhap ten');
      return;
    }
    try {
      await settingsApi.createColumnPreset({
        platform,
        preset_name: newPresetName.trim(),
        columns: columns,
        is_default: false,
      });
      toast.success('Da luu nhom cot: ' + newPresetName);
      setNewPresetName('');
      setShowSavePreset(false);
      await loadPresets();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleLoadPreset = (preset) => {
    try {
      const savedCols = typeof preset.columns === 'string' ? JSON.parse(preset.columns) : preset.columns;
      // Bảo đảm các cột cố định luôn hiển thị sau khi load preset
      const pinnedKeys = new Set(DEFAULT_COLUMNS[platform].filter(c => c.pinned).map(c => c.key));
      const finalCols = savedCols.map(c => pinnedKeys.has(c.key) ? { ...c, visible: true } : c);
      setColumns(finalCols);
      localStorage.setItem(`cols_campaign_${platform}`, JSON.stringify(finalCols));
      setActivePreset(preset.id);
      toast.success('Da tai nhom cot: ' + preset.preset_name);
    } catch (err) {
      toast.error('Loi tai nhom cot');
    }
  };

  const handleDeletePreset = async (presetId, presetName) => {
    if (!confirm('Xoa nhom cot "' + presetName + '"?')) return;
    try {
      await settingsApi.deleteColumnPreset(presetId);
      toast.success('Da xoa');
      if (activePreset === presetId) {
        setColumns(DEFAULT_COLUMNS[platform]);
        setActivePreset('default');
      }
      await loadPresets();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleUpdatePreset = async (presetId) => {
    try {
      await settingsApi.updateColumnPreset(presetId, { columns });
      toast.success('Da cap nhat nhom cot');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const visibleColumns = columns.filter(c => c.visible);

  const handleColumnDrag = (event) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIdx = visibleColumns.findIndex(c => c.key === active.id);
      const newIdx = visibleColumns.findIndex(c => c.key === over.id);
      const reordered = arrayMove(visibleColumns, oldIdx, newIdx);
      const hiddenCols = columns.filter(c => !c.visible);
      const newCols = [...reordered, ...hiddenCols];
      setColumns(newCols);
      localStorage.setItem(`cols_campaign_${platform}`, JSON.stringify(newCols));
    }
  };

  const handleAdsetColumnDrag = (event) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const vis = adsetColumns.filter(c => c.visible);
      const oldIdx = vis.findIndex(c => c.key === active.id);
      const newIdx = vis.findIndex(c => c.key === over.id);
      const reordered = arrayMove(vis, oldIdx, newIdx);
      const hidden = adsetColumns.filter(c => !c.visible);
      const newCols = [...reordered, ...hidden];
      setAdsetColumns(newCols);
      localStorage.setItem(`cols_adset_${platform}`, JSON.stringify(newCols));
    }
  };

  const handleAdColumnDrag = (event) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const vis = adColumns.filter(c => c.visible);
      const oldIdx = vis.findIndex(c => c.key === active.id);
      const newIdx = vis.findIndex(c => c.key === over.id);
      const reordered = arrayMove(vis, oldIdx, newIdx);
      const hidden = adColumns.filter(c => !c.visible);
      const newCols = [...reordered, ...hidden];
      setAdColumns(newCols);
      localStorage.setItem(`cols_ad_${platform}`, JSON.stringify(newCols));
    }
  };

  const toggleColumn = (key) => {
    const newCols = columns.map(c => (c.key === key && !c.pinned) ? { ...c, visible: !c.visible } : c);
    setColumns(newCols);
    localStorage.setItem(`cols_campaign_${platform}`, JSON.stringify(newCols));
  };

  const toggleAdsetColumn = (key) => {
    const newCols = adsetColumns.map(c => (c.key === key && !c.sticky && !c.pinned) ? { ...c, visible: !c.visible } : c);
    setAdsetColumns(newCols);
    localStorage.setItem(`cols_adset_${platform}`, JSON.stringify(newCols));
  };

  const toggleAdColumn = (key) => {
    const newCols = adColumns.map(c => (c.key === key && !c.sticky && !c.pinned) ? { ...c, visible: !c.visible } : c);
    setAdColumns(newCols);
    localStorage.setItem(`cols_ad_${platform}`, JSON.stringify(newCols));
  };

  // === DRILL-DOWN FUNCTIONS ===
  const drillToAdGroups = async (campaign) => {
    setDrillDown({ type: 'ad_groups', campaign, breadcrumb: [campaign.name] });
    setDrillLoading(true);
    setShowDrillColSettings(false);
    try {
      const res = await campaignsApi.getAdGroups(campaign.id, {
        date_from: dateRange.from,
        date_to: dateRange.to,
        external_id: campaign.external_id,
        account_id: campaign.account_id,
      });
      setDrillData(res.data.adGroups);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDrillLoading(false);
    }
  };

  const drillToAds = async (adGroup) => {
    setDrillDown({
      type: 'ads',
      adGroup,
      campaign: drillDown.campaign,
      breadcrumb: [drillDown.campaign.name, adGroup.name],
    });
    setDrillLoading(true);
    setShowDrillColSettings(false);
    try {
      const res = await campaignsApi.getAds(adGroup.external_id, {
        campaign_id: drillDown.campaign.external_id,
        account_id: drillDown.campaign.account_id,
        date_from: dateRange.from,
        date_to: dateRange.to,
      });
      setDrillData(res.data.ads);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDrillLoading(false);
    }
  };

  // === RENDER CELL HELPERS ===
  const renderCellValue = (camp, col) => {
    if (col.key === 'name') {
      return (
        <div>
          <span
            className="text-blue-600 font-medium cursor-pointer hover:underline"
            onClick={() => drillToAdGroups(camp)}
          >
            {camp.name}
          </span>
          <div className="text-[10px] text-slate-400 mt-0.5">{camp.external_id}</div>
        </div>
      );
    }
    if (col.key === 'status') {
      const badge = getStatusBadge(camp.status);
      return (
        <div className="flex items-center gap-2">
          <span className={`badge ${badge.class}`}>{badge.label}</span>
          <button
            onClick={() => handleToggleCampaign(camp)}
            className="text-slate-400 hover:text-blue-500 p-0.5"
            title="Bat/Tat chien dich"
          >
            <Power size={14} />
          </button>
        </div>
      );
    }
    if (col.key === 'objective') return <span className="badge badge-info text-[10px]">{camp.objective || '\u2014'}</span>;
    if (col.key === 'budget') return formatCellValue(camp.budget, 'currency', camp.currency);

    const value = camp.metrics?.[col.key];
    return formatCellValue(value, col.format, camp.currency);
  };

  const renderAdsetCell = (ag, col, currency) => {
    if (col.key === 'name') {
      return (
        <span className="text-blue-600 font-medium cursor-pointer hover:underline" onClick={() => drillToAds(ag)}>
          {ag.name}
        </span>
      );
    }
    if (col.key === 'status') {
      const badge = getStatusBadge(ag.status);
      return (
        <div className="flex items-center gap-2">
          <span className={`badge ${badge.class}`}>{badge.label}</span>
          <button
            onClick={() => handleToggleAdGroup(ag)}
            className="text-slate-400 hover:text-blue-500 p-0.5"
            title="Bat/Tat nhom quang cao"
          >
            <Power size={14} />
          </button>
        </div>
      );
    }
    if (col.key === 'budget') {
      return formatCellValue(ag.budget, 'currency', currency);
    }
    const value = ag.metrics?.[col.key];
    return formatCellValue(value, col.format, currency);
  };

  const renderAdCell = (ad, col, currency, currentDrillDown) => {
    if (col.key === 'name') {
      return (
        <div>
          <div className="font-medium">{ad.name}</div>
          {ad.headline && <div className="text-[10px] text-slate-400 mt-0.5">Tieu de: {ad.headline}</div>}
          {ad.description && <div className="text-[10px] text-slate-400">Mo ta: {ad.description}</div>}
        </div>
      );
    }
    if (col.key === 'preview') {
      if (ad.image_url) return <img src={ad.image_url} alt="" className="w-12 h-9 object-cover rounded" />;
      if (ad.video_url) return <a href={ad.video_url} target="_blank" rel="noreferrer" className="text-blue-600 text-[10px]">Video</a>;
      return '\u2014';
    }
    if (col.key === 'status') {
      const badge = getStatusBadge(ad.status);
      return (
        <div className="flex items-center gap-2">
          <span className={`badge ${badge.class}`}>{badge.label}</span>
          <button
            onClick={() => handleToggleAd(ad, currentDrillDown)}
            className="text-slate-400 hover:text-blue-500 p-0.5"
            title="Bat/Tat quang cao"
          >
            <Power size={14} />
          </button>
        </div>
      );
    }
    const value = ad.metrics?.[col.key];
    return formatCellValue(value, col.format, currency);
  };

  // === COLUMN SETTINGS PANEL (reusable) ===
  const renderColumnSettingsPanel = (title, cols, toggleFn, onClose) => (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold">{title}</div>
        <button onClick={onClose}><X size={16} /></button>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        {cols.map(col => (
          <label key={col.key} className={`flex items-center gap-2 ${col.sticky || col.pinned ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}>
            <input
              type="checkbox"
              checked={col.visible}
              onChange={() => toggleFn(col.key)}
              disabled={col.sticky || col.pinned}
            />
            <span className="flex items-center gap-1">
              {col.label}
              {col.pinned && <span className="text-blue-500 font-bold" title="Cot co dinh">•</span>}
            </span>
          </label>
        ))}
      </div>
      <div className="mt-2 text-[10px] text-slate-400 flex items-center gap-1">
        <span className="text-blue-500 font-bold">•</span> Cột cố định, không thể ẩn
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Chien dich</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {displayCampaigns.filter(c => ['ENABLED','ACTIVE','ENABLE'].includes(c.status)).length} chiến dịch đang hoạt động - Tổng {displayCampaigns.length}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowColSettings(!showColSettings)}
            className="btn btn-outline btn-sm"
          >
            <Settings size={14} /> Cai dat cot
          </button>
          <button onClick={handleSync} className="btn btn-primary btn-sm" disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Lam moi
          </button>
        </div>
      </div>

      <PlatformTabs value={platform} onChange={(p) => { setPlatform(p); setDrillDown(null); }} />

      {/* Filter row */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm chiến dịch..."
            className="input pl-9 py-2"
          />
        </div>
        <select value={groupName} onChange={(e) => { setGroupName(e.target.value); setAccountId(''); }} className="input py-2 w-44">
          <option value="">Tất cả nhóm</option>
          {accountGroups.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="input py-2 w-44">
          <option value="">Tất cả tài khoản</option>
          {visibleAccounts.map(a => <option key={a.id} value={a.id}>{a.account_name}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="input py-2 w-36">
          <option value="">Tất cả</option>
          <option value="ACTIVE_ALL">Đang chạy</option>
          <option value="PAUSED_ALL">Tạm dừng</option>
          <option value="REMOVED_ALL">Đã xóa</option>
        </select>
        <select value={objective} onChange={(e) => setObjective(e.target.value)} className="input py-2 w-44">
          <option value="">Tất cả mục tiêu</option>
          {[...new Set(campaigns.map(c => c.objective).filter(Boolean))].map(obj => (
            <option key={obj} value={obj}>{obj}</option>
          ))}
        </select>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      {/* Column settings panel - Campaigns */}
      {showColSettings && !drillDown && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold">Hien thi cot - Chien dich</div>
            <button onClick={() => setShowColSettings(false)}><X size={16} /></button>
          </div>

          {/* Preset buttons */}
          <div className="flex gap-1.5 mb-3 flex-wrap items-center">
            <button
              className={`btn btn-sm ${activePreset === 'default' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'btn-outline'}`}
              onClick={() => { setColumns(DEFAULT_COLUMNS[platform]); localStorage.removeItem(`cols_campaign_${platform}`); setActivePreset('default'); }}
            >
              Mac dinh
            </button>
            {presets.map(p => (
              <div key={p.id} className="flex items-center gap-0.5">
                <button
                  className={`btn btn-sm ${activePreset === p.id ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'btn-outline'}`}
                  onClick={() => handleLoadPreset(p)}
                >
                  {p.preset_name}
                </button>
                {activePreset === p.id && (
                  <button
                    className="btn btn-sm text-blue-600"
                    onClick={() => handleUpdatePreset(p.id)}
                    title="Luu thay doi vao nhom nay"
                  >
                    <Save size={12} />
                  </button>
                )}
                <button
                  className="btn btn-sm text-red-400 hover:text-red-600"
                  onClick={() => handleDeletePreset(p.id, p.preset_name)}
                  title="Xoa nhom cot"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}

            {/* Tao moi */}
            {!showSavePreset ? (
              <button
                className="btn btn-sm text-blue-600"
                onClick={() => setShowSavePreset(true)}
              >
                <Plus size={12} /> Luu nhom cot moi
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <input
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  placeholder="Ten nhom cot..."
                  className="input py-1 px-2 text-xs w-36"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleSavePreset()}
                />
                <button className="btn btn-sm btn-primary py-1" onClick={handleSavePreset}>
                  <Save size={12} /> Luu
                </button>
                <button className="btn btn-sm btn-outline py-1" onClick={() => { setShowSavePreset(false); setNewPresetName(''); }}>
                  Huy
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            {columns.map(col => (
              <label key={col.key} className={`flex items-center gap-2 ${col.sticky || col.pinned ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}>
                <input
                  type="checkbox"
                  checked={col.visible}
                  onChange={() => toggleColumn(col.key)}
                  disabled={col.sticky || col.pinned}
                />
                <span className="flex items-center gap-1">
                  {col.label}
                  {col.pinned && <span className="text-blue-500 font-bold" title="Cot co dinh">•</span>}
                </span>
              </label>
            ))}
          </div>
          <div className="mt-2 text-[10px] text-slate-400 flex items-center gap-1">
            <span className="text-blue-500 font-bold">•</span> Cột cố định, không thể ẩn
          </div>
        </div>
      )}

      {/* Drill-down breadcrumb */}
      {drillDown && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <button onClick={() => { setDrillDown(null); setShowDrillColSettings(false); }} className="text-blue-600 hover:underline">Chien dich</button>
          {drillDown.breadcrumb.map((b, i) => {
            const isLast = i === drillDown.breadcrumb.length - 1;
            const handleBreadcrumbClick = !isLast && drillDown.type === 'ads' && i === 0
              ? () => drillToAdGroups(drillDown.campaign)
              : undefined;
            return (
              <span key={i} className="flex items-center gap-2">
                <ChevronRight size={14} />
                <span
                  className={isLast ? 'text-slate-700' : 'text-blue-600 cursor-pointer hover:underline'}
                  onClick={handleBreadcrumbClick}
                >
                  {b}
                </span>
              </span>
            );
          })}
          <span className="ml-auto flex items-center gap-2">
            <span className="text-xs">{drillDown.type === 'ad_groups' ? 'Nhom quang cao' : 'Quang cao'}</span>
            <button
              onClick={() => setShowDrillColSettings(!showDrillColSettings)}
              className="btn btn-outline btn-sm py-0.5 px-2 text-[10px]"
            >
              <Settings size={12} /> Cot
            </button>
          </span>
        </div>
      )}

      {/* Column settings for drill-down */}
      {showDrillColSettings && drillDown?.type === 'ad_groups' &&
        renderColumnSettingsPanel('Hien thi cot - Nhom quang cao', adsetColumns, toggleAdsetColumn, () => setShowDrillColSettings(false))
      }
      {showDrillColSettings && drillDown?.type === 'ads' &&
        renderColumnSettingsPanel('Hien thi cot - Quang cao', adColumns, toggleAdColumn, () => setShowDrillColSettings(false))
      }

      {/* TABLE - Campaigns */}
      {!drillDown && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            {loading ? (
              <div className="text-center py-12 text-slate-400">Đang tải...</div>
            ) : displayCampaigns.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <div>Chưa có chiến dịch nào</div>
                <div className="text-xs mt-1">Hãy đồng bộ data từ tài khoản đã kết nối</div>
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleColumnDrag}>
                <table className="w-full text-xs">
                  <thead>
                    <SortableContext items={visibleColumns.map(c => c.key)} strategy={horizontalListSortingStrategy}>
                      <tr>
                        {visibleColumns.map(col => <SortableHeader key={col.key} col={col} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />)}
                      </tr>
                    </SortableContext>
                  </thead>
                  <tbody>
                    {displayCampaigns.map(camp => (
                      <tr key={camp.id} className="hover:bg-slate-50">
                        {visibleColumns.map(col => (
                          <td key={col.key} className="px-3 py-2.5 border-b border-slate-100 whitespace-nowrap">
                            {renderCellValue(camp, col)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    {(() => {
                      const totals = computeTotals(
                        displayCampaigns,
                        (c) => c.budget,
                        (c, key) => c.metrics?.[key]
                      );
                      const cur = displayCampaigns[0]?.currency;
                      return (
                        <tr className="bg-slate-100 font-semibold border-t-2 border-slate-300">
                          {visibleColumns.map(col => (
                            <td key={col.key} className="px-3 py-2.5 whitespace-nowrap text-slate-700">
                              {col.key === 'name' ? 'Tổng' :
                               col.key === 'status' || col.key === 'objective' ? '' :
                               col.key === 'budget' ? formatCellValue(totals.budget, 'currency', cur) :
                               formatCellValue(totals[col.key], col.format, cur)}
                            </td>
                          ))}
                        </tr>
                      );
                    })()}
                  </tfoot>
                </table>
              </DndContext>
            )}
          </div>
        </div>
      )}

      {/* DRILL-DOWN: Ad Groups / Ad Sets */}
      {drillDown?.type === 'ad_groups' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            {drillLoading ? (
              <div className="text-center py-12 text-slate-400">Dang tai nhom quang cao...</div>
            ) : drillData.length === 0 ? (
              <div className="text-center py-12 text-slate-400">Khong co nhom quang cao</div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleAdsetColumnDrag}>
              <table className="w-full text-xs">
                <thead>
                  <SortableContext items={adsetColumns.filter(c => c.visible).map(c => c.key)} strategy={horizontalListSortingStrategy}>
                    <tr>
                      {adsetColumns.filter(c => c.visible).map(col => (
                        <SortableHeader key={col.key} col={col} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                      ))}
                    </tr>
                  </SortableContext>
                </thead>
                <tbody>
                  {drillData.map(ag => (
                    <tr key={ag.external_id} className="hover:bg-slate-50">
                      {adsetColumns.filter(c => c.visible).map(col => (
                        <td key={col.key} className="px-3 py-2.5 border-b border-slate-100 whitespace-nowrap">
                          {renderAdsetCell(ag, col, drillDown?.campaign?.currency)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {(() => {
                    const visibleAdsetCols = adsetColumns.filter(c => c.visible);
                    const totals = computeTotals(
                      drillData,
                      (ag) => ag.budget,
                      (ag, key) => ag.metrics?.[key]
                    );
                    const cur = drillDown?.campaign?.currency;
                    return (
                      <tr className="bg-slate-100 font-semibold border-t-2 border-slate-300">
                        {visibleAdsetCols.map(col => (
                          <td key={col.key} className="px-3 py-2.5 whitespace-nowrap text-slate-700">
                            {col.key === 'name' ? 'Tổng' :
                             col.key === 'status' ? '' :
                             col.key === 'budget' ? formatCellValue(totals.budget, 'currency', cur) :
                             formatCellValue(totals[col.key], col.format, cur)}
                          </td>
                        ))}
                      </tr>
                    );
                  })()}
                </tfoot>
              </table>
              </DndContext>
            )}
          </div>
        </div>
      )}

      {/* DRILL-DOWN: Ads */}
      {drillDown?.type === 'ads' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            {drillLoading ? (
              <div className="text-center py-12 text-slate-400">Dang tai quang cao...</div>
            ) : drillData.length === 0 ? (
              <div className="text-center py-12 text-slate-400">Khong co quang cao</div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleAdColumnDrag}>
              <table className="w-full text-xs">
                <thead>
                  <SortableContext items={adColumns.filter(c => c.visible).map(c => c.key)} strategy={horizontalListSortingStrategy}>
                    <tr>
                      {adColumns.filter(c => c.visible).map(col => (
                        <SortableHeader key={col.key} col={col} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                      ))}
                    </tr>
                  </SortableContext>
                </thead>
                <tbody>
                  {drillData.map(ad => (
                    <tr key={ad.external_id} className="hover:bg-slate-50">
                      {adColumns.filter(c => c.visible).map(col => (
                        <td key={col.key} className="px-3 py-2.5 border-b border-slate-100 whitespace-nowrap">
                          {renderAdCell(ad, col, drillDown?.campaign?.currency, drillDown)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {(() => {
                    const visibleAdCols = adColumns.filter(c => c.visible);
                    const totals = computeTotals(
                      drillData,
                      () => 0,
                      (ad, key) => ad.metrics?.[key]
                    );
                    const cur = drillDown?.campaign?.currency;
                    return (
                      <tr className="bg-slate-100 font-semibold border-t-2 border-slate-300">
                        {visibleAdCols.map(col => (
                          <td key={col.key} className="px-3 py-2.5 whitespace-nowrap text-slate-700">
                            {col.key === 'name' ? 'Tổng' :
                             col.key === 'status' || col.key === 'preview' ? '' :
                             formatCellValue(totals[col.key], col.format, cur)}
                          </td>
                        ))}
                      </tr>
                    );
                  })()}
                </tfoot>
              </table>
              </DndContext>
            )}
          </div>
        </div>
      )}

      {/* Summary */}
      {!drillDown && displayCampaigns.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {(() => {
            const cur = displayCampaigns[0]?.currency;
            const totalBudget = displayCampaigns.reduce((s, c) => s + Number(c.budget || 0), 0);
            const totalSpend = displayCampaigns.reduce((s, c) => s + Number(c.metrics?.spend || 0), 0);
            const totalResults = displayCampaigns.reduce((s, c) => s + Number(c.metrics?.video_views || c.metrics?.conversions || c.metrics?.engagements || c.metrics?.messages || 0), 0);
            const avgCPR = totalResults > 0 ? totalSpend / totalResults : 0;
            return <>
              <div className="card p-3 text-center">
                <div className="text-[10px] text-slate-400">Ngân sách/ngày</div>
                <div className="text-lg font-semibold mt-1">{formatCellValue(totalBudget, 'currency', cur)}</div>
              </div>
              <div className="card p-3 text-center">
                <div className="text-[10px] text-slate-400">Đã chi tiêu</div>
                <div className="text-lg font-semibold mt-1">{formatCellValue(totalSpend, 'currency', cur)}</div>
              </div>
              <div className="card p-3 text-center">
                <div className="text-[10px] text-slate-400">Tổng kết quả</div>
                <div className="text-lg font-semibold mt-1 text-blue-600">{formatCellValue(totalResults, 'number')}</div>
              </div>
              <div className="card p-3 text-center">
                <div className="text-[10px] text-slate-400">CP/KQ trung bình</div>
                <div className="text-lg font-semibold mt-1 text-blue-600">{formatCellValue(avgCPR, 'currency', cur)}</div>
              </div>
            </>;
          })()}
        </div>
      )}
    </div>
  );
}
