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

// Cot mac dinh cho Ad Sets - day du chi so theo platform
const DEFAULT_ADSET_COLUMNS = {
  google: [
    { key: 'name', label: 'Nhom QC', visible: true, sticky: true },
    { key: 'status', label: 'Trang thai', visible: true },
    { key: 'budget', label: 'Ngan sach', visible: true, format: 'currency' },
    { key: 'impressions', label: 'Hien thi', visible: true, format: 'number' },
    { key: 'clicks', label: 'Luot nhap', visible: true, format: 'number' },
    { key: 'ctr', label: 'CTR', visible: true, format: 'percent' },
    { key: 'cpc', label: 'CPC', visible: true, format: 'currency' },
    { key: 'cpm', label: 'CPM', visible: true, format: 'currency' },
    { key: 'spend', label: 'Chi phi', visible: true, format: 'currency' },
    { key: 'conversions', label: 'Ket qua', visible: true, format: 'number' },
    { key: 'cpa', label: 'CP/KQ', visible: true, format: 'currency' },
    { key: 'roas', label: 'ROAS', visible: true, format: 'roas' },
  ],
  facebook: [
    { key: 'name', label: 'Nhom QC', visible: true, sticky: true },
    { key: 'status', label: 'Trang thai', visible: true },
    { key: 'budget', label: 'Ngan sach', visible: true, format: 'currency' },
    { key: 'impressions', label: 'Hien thi', visible: true, format: 'number' },
    { key: 'reach', label: 'Tiep can', visible: true, format: 'number' },
    { key: 'clicks', label: 'Luot nhap', visible: true, format: 'number' },
    { key: 'ctr', label: 'CTR', visible: true, format: 'percent' },
    { key: 'cpc', label: 'CPC', visible: true, format: 'currency' },
    { key: 'cpm', label: 'CPM', visible: true, format: 'currency' },
    { key: 'spend', label: 'Chi phi', visible: true, format: 'currency' },
    { key: 'conversions', label: 'Ket qua', visible: true, format: 'number' },
    { key: 'cpa', label: 'CP/KQ', visible: true, format: 'currency' },
    { key: 'roas', label: 'ROAS', visible: true, format: 'roas' },
    { key: 'messages', label: 'Tin nhan', visible: false, format: 'number' },
    { key: 'post_engagements', label: 'Tuong tac', visible: false, format: 'number' },
  ],
  tiktok: [
    { key: 'name', label: 'Nhom QC', visible: true, sticky: true },
    { key: 'status', label: 'Trang thai', visible: true },
    { key: 'budget', label: 'Ngan sach', visible: true, format: 'currency' },
    { key: 'impressions', label: 'Hien thi', visible: true, format: 'number' },
    { key: 'reach', label: 'Tiep can', visible: true, format: 'number' },
    { key: 'clicks', label: 'Luot nhap', visible: true, format: 'number' },
    { key: 'ctr', label: 'CTR', visible: true, format: 'percent' },
    { key: 'cpc', label: 'CPC', visible: true, format: 'currency' },
    { key: 'cpm', label: 'CPM', visible: true, format: 'currency' },
    { key: 'spend', label: 'Chi phi', visible: true, format: 'currency' },
    { key: 'video_views', label: 'Video views', visible: true, format: 'number' },
    { key: 'conversions', label: 'Ket qua', visible: true, format: 'number' },
    { key: 'cpa', label: 'CP/KQ', visible: true, format: 'currency' },
  ],
};

// Cot mac dinh cho Ads - day du chi so
const DEFAULT_AD_COLUMNS = {
  google: [
    { key: 'name', label: 'Quang cao', visible: true, sticky: true },
    { key: 'preview', label: 'Hinh/Video', visible: true },
    { key: 'status', label: 'Trang thai', visible: true },
    { key: 'impressions', label: 'Hien thi', visible: true, format: 'number' },
    { key: 'clicks', label: 'Luot nhap', visible: true, format: 'number' },
    { key: 'ctr', label: 'CTR', visible: true, format: 'percent' },
    { key: 'cpc', label: 'CPC', visible: true, format: 'currency' },
    { key: 'cpm', label: 'CPM', visible: true, format: 'currency' },
    { key: 'spend', label: 'Chi phi', visible: true, format: 'currency' },
    { key: 'conversions', label: 'Ket qua', visible: true, format: 'number' },
    { key: 'cpa', label: 'CP/KQ', visible: true, format: 'currency' },
  ],
  facebook: [
    { key: 'name', label: 'Quang cao', visible: true, sticky: true },
    { key: 'preview', label: 'Hinh/Video', visible: true },
    { key: 'status', label: 'Trang thai', visible: true },
    { key: 'impressions', label: 'Hien thi', visible: true, format: 'number' },
    { key: 'reach', label: 'Tiep can', visible: true, format: 'number' },
    { key: 'clicks', label: 'Luot nhap', visible: true, format: 'number' },
    { key: 'ctr', label: 'CTR', visible: true, format: 'percent' },
    { key: 'cpc', label: 'CPC', visible: true, format: 'currency' },
    { key: 'cpm', label: 'CPM', visible: true, format: 'currency' },
    { key: 'spend', label: 'Chi phi', visible: true, format: 'currency' },
    { key: 'conversions', label: 'Ket qua', visible: true, format: 'number' },
    { key: 'cpa', label: 'CP/KQ', visible: true, format: 'currency' },
    { key: 'roas', label: 'ROAS', visible: true, format: 'roas' },
  ],
  tiktok: [
    { key: 'name', label: 'Quang cao', visible: true, sticky: true },
    { key: 'preview', label: 'Hinh/Video', visible: true },
    { key: 'status', label: 'Trang thai', visible: true },
    { key: 'impressions', label: 'Hien thi', visible: true, format: 'number' },
    { key: 'clicks', label: 'Luot nhap', visible: true, format: 'number' },
    { key: 'ctr', label: 'CTR', visible: true, format: 'percent' },
    { key: 'cpc', label: 'CPC', visible: true, format: 'currency' },
    { key: 'cpm', label: 'CPM', visible: true, format: 'currency' },
    { key: 'spend', label: 'Chi phi', visible: true, format: 'currency' },
    { key: 'video_views', label: 'Video views', visible: true, format: 'number' },
    { key: 'conversions', label: 'Ket qua', visible: true, format: 'number' },
    { key: 'cpa', label: 'CP/KQ', visible: true, format: 'currency' },
  ],
};

// Chi so tong quan co the chon
const SUMMARY_OPTIONS = [
  { key: 'totalBudget', label: 'Ngan sach/ngay', format: 'currency' },
  { key: 'totalSpend', label: 'Da chi tieu', format: 'currency' },
  { key: 'totalImpressions', label: 'Tong hien thi', format: 'number' },
  { key: 'totalClicks', label: 'Tong luot nhap', format: 'number' },
  { key: 'totalResults', label: 'Tong ket qua', format: 'number' },
  { key: 'avgCTR', label: 'CTR trung binh', format: 'percent' },
  { key: 'avgCPC', label: 'CPC trung binh', format: 'currency' },
  { key: 'avgCPM', label: 'CPM trung binh', format: 'currency' },
  { key: 'avgCostPerResult', label: 'CP/KQ trung binh', format: 'currency' },
  { key: 'avgROAS', label: 'ROAS trung binh', format: 'roas' },
];

// Sortable column header
function SortableHeader({ col }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: col.key });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  return (
    <th ref={setNodeRef} style={style} {...attributes} {...listeners}
      className="text-left px-3 py-2.5 text-[11px] font-medium text-slate-500 uppercase tracking-wide cursor-grab whitespace-nowrap bg-slate-50 border-b border-slate-200 select-none">
      {col.label}
    </th>
  );
}

export default function CampaignsPage() {
  const [platform, setPlatform] = useState('google');
  const [dateRange, setDateRange] = useState(DATE_PRESETS[4].getValue());
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState('');
  const [status, setStatus] = useState('RUNNING');
  const [objective, setObjective] = useState('');
  const [search, setSearch] = useState('');

  const [campaigns, setCampaigns] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(false);

  const [columns, setColumns] = useState(DEFAULT_COLUMNS.google);
  const [showColSettings, setShowColSettings] = useState(false);
  const [presets, setPresets] = useState([]);
  const [activePreset, setActivePreset] = useState('default');
  const [newPresetName, setNewPresetName] = useState('');
  const [showSavePreset, setShowSavePreset] = useState(false);

  const [drillDown, setDrillDown] = useState(null);
  const [drillData, setDrillData] = useState([]);
  const [drillLoading, setDrillLoading] = useState(false);

  const [adsetColumns, setAdsetColumns] = useState(DEFAULT_ADSET_COLUMNS.facebook);
  const [adColumns, setAdColumns] = useState(DEFAULT_AD_COLUMNS.facebook);
  const [showDrillColSettings, setShowDrillColSettings] = useState(false);

  const [visibleSummaryKeys, setVisibleSummaryKeys] = useState(['totalBudget', 'totalSpend', 'totalResults', 'avgCostPerResult']);
  const [showSummarySettings, setShowSummarySettings] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  useEffect(() => {
    setColumns(DEFAULT_COLUMNS[platform]);
    setAdsetColumns(DEFAULT_ADSET_COLUMNS[platform] || DEFAULT_ADSET_COLUMNS.facebook);
    setAdColumns(DEFAULT_AD_COLUMNS[platform] || DEFAULT_AD_COLUMNS.facebook);
    setActivePreset('default');
    loadAccounts();
    loadPresets();
  }, [platform]);

  useEffect(() => { loadCampaigns(); }, [platform, accountId, status, objective, search, dateRange]);

  const loadAccounts = async () => { try { const res = await dashboardApi.getAccounts(platform); setAccounts(res.data.accounts); } catch (err) {} };
  const loadPresets = async () => { try { const res = await settingsApi.getColumnPresets(platform); setPresets(res.data.presets); } catch (err) {} };

  const loadCampaigns = async () => {
    setLoading(true);
    try {
      const res = await campaignsApi.list({
        platform,
        account_id: accountId || undefined,
        status: (status && status !== 'RUNNING') ? status : undefined,
        objective: objective || undefined,
        search: search || undefined,
        date_from: dateRange.from,
        date_to: dateRange.to,
      });

      let filtered = res.data.campaigns;
      if (status === 'RUNNING') {
        filtered = filtered.filter(c => ['ENABLED', 'ACTIVE', 'ENABLE'].includes(c.status));
      }

      setCampaigns(filtered);

      // Tinh summary tu filtered data
      const activeCount = filtered.filter(r => ['ENABLED', 'ACTIVE', 'ENABLE'].includes(r.status)).length;
      let totalSpend = 0, totalResults = 0, totalBudget = 0, totalImpressions = 0, totalClicks = 0;
      filtered.forEach(r => {
        const m = r.metrics || {};
        totalSpend += Number(m.spend || 0);
        totalBudget += Number(r.budget || 0);
        totalImpressions += Number(m.impressions || 0);
        totalClicks += Number(m.clicks || 0);
        totalResults += Number(m.conversions || m.video_views || m.messages || m.engagements || 0);
      });

      setSummary({
        total: filtered.length, active: activeCount,
        totalSpend, totalBudget, totalImpressions, totalClicks, totalResults,
        avgCTR: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
        avgCPC: totalClicks > 0 ? totalSpend / totalClicks : 0,
        avgCPM: totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0,
        avgCostPerResult: totalResults > 0 ? totalSpend / totalResults : 0,
        avgROAS: 0,
      });
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  const handleSync = async () => {
    setLoading(true);
    try { const res = await campaignsApi.sync(accountId || null); toast.success(res.message); await loadCampaigns(); }
    catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  const handleToggleCampaign = async (camp) => {
    const enable = !['ENABLED', 'ACTIVE', 'ENABLE'].includes(camp.status);
    try { await campaignsApi.toggle(camp.id, enable); toast.success(enable ? 'Da bat chien dich' : 'Da tat chien dich'); await loadCampaigns(); }
    catch (err) { toast.error(err.message); }
  };

  // Preset functions
  const handleSavePreset = async () => {
    if (!newPresetName.trim()) { toast.error('Vui long nhap ten'); return; }
    try {
      await settingsApi.createColumnPreset({ platform, preset_name: newPresetName.trim(), columns, is_default: false });
      toast.success('Da luu nhom cot: ' + newPresetName);
      setNewPresetName(''); setShowSavePreset(false); await loadPresets();
    } catch (err) { toast.error(err.message); }
  };

  const handleLoadPreset = (preset) => {
    try {
      const saved = typeof preset.columns === 'string' ? JSON.parse(preset.columns) : preset.columns;
      setColumns(saved); setActivePreset(preset.id);
    } catch (err) { toast.error('Loi tai nhom cot'); }
  };

  const handleDeletePreset = async (id, name) => {
    if (!confirm('Xoa nhom cot "' + name + '"?')) return;
    try {
      await settingsApi.deleteColumnPreset(id);
      if (activePreset === id) { setColumns(DEFAULT_COLUMNS[platform]); setActivePreset('default'); }
      await loadPresets();
    } catch (err) { toast.error(err.message); }
  };

  const handleUpdatePreset = async (id) => {
    try { await settingsApi.updateColumnPreset(id, { columns }); toast.success('Da cap nhat'); }
    catch (err) { toast.error(err.message); }
  };

  const visibleColumns = columns.filter(c => c.visible);

  const handleColumnDrag = (event) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIdx = visibleColumns.findIndex(c => c.key === active.id);
      const newIdx = visibleColumns.findIndex(c => c.key === over.id);
      const reordered = arrayMove(visibleColumns, oldIdx, newIdx);
      setColumns([...reordered, ...columns.filter(c => !c.visible)]);
    }
  };

  const toggleColumn = (key) => setColumns(columns.map(c => c.key === key ? { ...c, visible: !c.visible } : c));
  const toggleAdsetColumn = (key) => setAdsetColumns(adsetColumns.map(c => c.key === key ? { ...c, visible: !c.visible } : c));
  const toggleAdColumn = (key) => setAdColumns(adColumns.map(c => c.key === key ? { ...c, visible: !c.visible } : c));
  const toggleSummaryKey = (key) => {
    if (visibleSummaryKeys.includes(key)) {
      if (visibleSummaryKeys.length <= 1) return;
      setVisibleSummaryKeys(visibleSummaryKeys.filter(k => k !== key));
    } else { setVisibleSummaryKeys([...visibleSummaryKeys, key]); }
  };

  // Drill-down
  const drillToAdGroups = async (campaign) => {
    setDrillDown({ type: 'ad_groups', campaign, breadcrumb: [campaign.name] });
    setDrillLoading(true); setShowDrillColSettings(false);
    try { const res = await campaignsApi.getAdGroups(campaign.id, { date_from: dateRange.from, date_to: dateRange.to }); setDrillData(res.data.adGroups); }
    catch (err) { toast.error(err.message); }
    finally { setDrillLoading(false); }
  };

  const drillToAds = async (adGroup) => {
    setDrillDown({ type: 'ads', adGroup, campaign: drillDown.campaign, breadcrumb: [drillDown.campaign.name, adGroup.name] });
    setDrillLoading(true); setShowDrillColSettings(false);
    try {
      const res = await campaignsApi.getAds(adGroup.external_id, {
        campaign_id: drillDown.campaign.external_id, account_id: drillDown.campaign.account_id,
        date_from: dateRange.from, date_to: dateRange.to,
      });
      setDrillData(res.data.ads);
    } catch (err) { toast.error(err.message); }
    finally { setDrillLoading(false); }
  };

  // Render helpers
  const renderCellValue = (camp, col) => {
    if (col.key === 'name') return (
      <div>
        <span className="text-blue-600 font-medium cursor-pointer hover:underline" onClick={() => drillToAdGroups(camp)}>{camp.name}</span>
        <div className="text-[10px] text-slate-400 mt-0.5">{camp.external_id}</div>
      </div>
    );
    if (col.key === 'status') {
      const badge = getStatusBadge(camp.status);
      return (<div className="flex items-center gap-2"><span className={`badge ${badge.class}`}>{badge.label}</span>
        <button onClick={() => handleToggleCampaign(camp)} className="text-slate-400 hover:text-blue-500 p-0.5"><Power size={14} /></button></div>);
    }
    if (col.key === 'objective') return <span className="badge badge-info text-[10px]">{camp.objective || '\u2014'}</span>;
    if (col.key === 'budget') return formatCellValue(camp.budget, 'currency', camp.currency);
    return formatCellValue(camp.metrics?.[col.key], col.format, camp.currency);
  };

  const renderAdsetCell = (ag, col, cur) => {
    if (col.key === 'name') return <span className="text-blue-600 font-medium cursor-pointer hover:underline" onClick={() => drillToAds(ag)}>{ag.name}</span>;
    if (col.key === 'status') { const b = getStatusBadge(ag.status || ag.effective_status); return <span className={`badge ${b.class}`}>{b.label}</span>; }
    if (col.key === 'budget') return formatCellValue(ag.budget, 'currency', cur);
    return formatCellValue(ag.metrics?.[col.key], col.format, cur);
  };

  const renderAdCell = (ad, col, cur) => {
    if (col.key === 'name') return (<div><div className="font-medium">{ad.name}</div>
      {ad.headline && <div className="text-[10px] text-slate-400 mt-0.5">Tieu de: {ad.headline}</div>}
      {ad.description && <div className="text-[10px] text-slate-400">Mo ta: {ad.description}</div>}</div>);
    if (col.key === 'preview') {
      if (ad.image_url) return <img src={ad.image_url} alt="" className="w-12 h-9 object-cover rounded" />;
      if (ad.video_url) return <a href={ad.video_url} target="_blank" rel="noreferrer" className="text-blue-600 text-[10px]">Video</a>;
      return '\u2014';
    }
    if (col.key === 'status') { const b = getStatusBadge(ad.status || ad.effective_status); return <span className={`badge ${b.class}`}>{b.label}</span>; }
    return formatCellValue(ad.metrics?.[col.key], col.format, cur);
  };

  const getSummaryValue = (key) => {
    const opt = SUMMARY_OPTIONS.find(o => o.key === key);
    if (!opt) return '\u2014';
    const cur = campaigns[0]?.currency;
    if (opt.format === 'currency') return formatCellValue(summary[key], 'currency', cur);
    if (opt.format === 'percent') return formatCellValue(summary[key], 'percent');
    if (opt.format === 'roas') return formatCellValue(summary[key], 'roas');
    return formatCellValue(summary[key], 'number');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Chien dich</h1>
          <p className="text-sm text-slate-500 mt-0.5">{summary.active || 0} chien dich dang hoat dong - Tong {summary.total || 0}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowColSettings(!showColSettings)} className="btn btn-outline btn-sm"><Settings size={14} /> Cai dat cot</button>
          <button onClick={handleSync} className="btn btn-primary btn-sm" disabled={loading}><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Lam moi</button>
        </div>
      </div>

      <PlatformTabs value={platform} onChange={(p) => { setPlatform(p); setDrillDown(null); }} />

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tim chien dich..." className="input pl-9 py-2" />
        </div>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="input py-2 w-44">
          <option value="">Tat ca tai khoan</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.account_name}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="input py-2 w-44">
          <option value="RUNNING">Dang chay</option>
          <option value="">Tat ca trang thai</option>
          <option value="PAUSED">Tam dung</option>
          <option value="REMOVED">Da xoa</option>
        </select>
        <select value={objective} onChange={(e) => setObjective(e.target.value)} className="input py-2 w-44">
          <option value="">Tat ca muc tieu</option>
          {[...new Set(campaigns.map(c => c.objective).filter(Boolean))].map(obj => <option key={obj} value={obj}>{obj}</option>)}
        </select>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      {/* Column settings - Campaigns */}
      {showColSettings && !drillDown && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold">Hien thi cot - Chien dich</div>
            <button onClick={() => setShowColSettings(false)}><X size={16} /></button>
          </div>
          <div className="flex gap-1.5 mb-3 flex-wrap items-center">
            <button className={`btn btn-sm ${activePreset === 'default' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'btn-outline'}`}
              onClick={() => { setColumns(DEFAULT_COLUMNS[platform]); setActivePreset('default'); }}>Mac dinh</button>
            {presets.map(p => (
              <div key={p.id} className="flex items-center gap-0.5">
                <button className={`btn btn-sm ${activePreset === p.id ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'btn-outline'}`}
                  onClick={() => handleLoadPreset(p)}>{p.preset_name}</button>
                {activePreset === p.id && <button className="btn btn-sm text-blue-600" onClick={() => handleUpdatePreset(p.id)}><Save size={12} /></button>}
                <button className="btn btn-sm text-red-400 hover:text-red-600" onClick={() => handleDeletePreset(p.id, p.preset_name)}><Trash2 size={12} /></button>
              </div>
            ))}
            {!showSavePreset ? (
              <button className="btn btn-sm text-blue-600" onClick={() => setShowSavePreset(true)}><Plus size={12} /> Luu nhom cot moi</button>
            ) : (
              <div className="flex items-center gap-1">
                <input value={newPresetName} onChange={(e) => setNewPresetName(e.target.value)} placeholder="Ten nhom cot..."
                  className="input py-1 px-2 text-xs w-36" autoFocus onKeyDown={(e) => e.key === 'Enter' && handleSavePreset()} />
                <button className="btn btn-sm btn-primary py-1" onClick={handleSavePreset}><Save size={12} /> Luu</button>
                <button className="btn btn-sm btn-outline py-1" onClick={() => { setShowSavePreset(false); setNewPresetName(''); }}>Huy</button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            {columns.map(col => (
              <label key={col.key} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={col.visible} onChange={() => toggleColumn(col.key)} disabled={col.sticky} />{col.label}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Drill-down breadcrumb */}
      {drillDown && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <button onClick={() => { setDrillDown(null); setShowDrillColSettings(false); }} className="text-blue-600 hover:underline">Chien dich</button>
          {drillDown.breadcrumb.map((b, i) => (
            <span key={i} className="flex items-center gap-2"><ChevronRight size={14} />
              <span className={i === drillDown.breadcrumb.length - 1 ? 'text-slate-700' : 'text-blue-600 cursor-pointer hover:underline'}>{b}</span>
            </span>
          ))}
          <span className="ml-auto flex items-center gap-2">
            <span className="text-xs">{drillDown.type === 'ad_groups' ? 'Nhom quang cao' : 'Quang cao'}</span>
            <button onClick={() => setShowDrillColSettings(!showDrillColSettings)} className="btn btn-outline btn-sm py-0.5 px-2 text-[10px]">
              <Settings size={12} /> Cot
            </button>
          </span>
        </div>
      )}

      {/* Column settings - Drill-down */}
      {showDrillColSettings && drillDown?.type === 'ad_groups' && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3"><div className="text-sm font-semibold">Hien thi cot - Nhom quang cao</div>
            <button onClick={() => setShowDrillColSettings(false)}><X size={16} /></button></div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            {adsetColumns.map(col => <label key={col.key} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={col.visible} onChange={() => toggleAdsetColumn(col.key)} disabled={col.sticky} />{col.label}</label>)}
          </div>
        </div>
      )}
      {showDrillColSettings && drillDown?.type === 'ads' && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3"><div className="text-sm font-semibold">Hien thi cot - Quang cao</div>
            <button onClick={() => setShowDrillColSettings(false)}><X size={16} /></button></div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            {adColumns.map(col => <label key={col.key} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={col.visible} onChange={() => toggleAdColumn(col.key)} disabled={col.sticky} />{col.label}</label>)}
          </div>
        </div>
      )}

      {/* Campaign table */}
      {!drillDown && (
        <div className="card overflow-hidden"><div className="overflow-x-auto">
          {loading ? <div className="text-center py-12 text-slate-400">Dang tai...</div>
          : campaigns.length === 0 ? <div className="text-center py-12 text-slate-400"><div>Chua co chien dich nao</div><div className="text-xs mt-1">Hay dong bo data tu tai khoan da ket noi</div></div>
          : <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleColumnDrag}>
              <table className="w-full text-xs"><thead>
                <SortableContext items={visibleColumns.map(c => c.key)} strategy={horizontalListSortingStrategy}>
                  <tr>{visibleColumns.map(col => <SortableHeader key={col.key} col={col} />)}</tr>
                </SortableContext></thead>
                <tbody>{campaigns.map(camp => (
                  <tr key={camp.id || camp.external_id} className="hover:bg-slate-50">
                    {visibleColumns.map(col => <td key={col.key} className="px-3 py-2.5 border-b border-slate-100 whitespace-nowrap">{renderCellValue(camp, col)}</td>)}
                  </tr>
                ))}</tbody></table>
            </DndContext>}
        </div></div>
      )}

      {/* Ad Groups table */}
      {drillDown?.type === 'ad_groups' && (
        <div className="card overflow-hidden"><div className="overflow-x-auto">
          {drillLoading ? <div className="text-center py-12 text-slate-400">Dang tai nhom quang cao...</div>
          : drillData.length === 0 ? <div className="text-center py-12 text-slate-400">Khong co nhom quang cao</div>
          : <table className="w-full text-xs"><thead className="bg-slate-50"><tr>
              {adsetColumns.filter(c => c.visible).map(col => <th key={col.key} className="text-left px-3 py-2.5 text-[11px] font-medium text-slate-500 uppercase">{col.label}</th>)}
            </tr></thead><tbody>
              {drillData.map(ag => <tr key={ag.external_id} className="hover:bg-slate-50">
                {adsetColumns.filter(c => c.visible).map(col => <td key={col.key} className="px-3 py-2.5 border-b border-slate-100 whitespace-nowrap">{renderAdsetCell(ag, col, drillDown?.campaign?.currency)}</td>)}
              </tr>)}
            </tbody></table>}
        </div></div>
      )}

      {/* Ads table */}
      {drillDown?.type === 'ads' && (
        <div className="card overflow-hidden"><div className="overflow-x-auto">
          {drillLoading ? <div className="text-center py-12 text-slate-400">Dang tai quang cao...</div>
          : drillData.length === 0 ? <div className="text-center py-12 text-slate-400">Khong co quang cao</div>
          : <table className="w-full text-xs"><thead className="bg-slate-50"><tr>
              {adColumns.filter(c => c.visible).map(col => <th key={col.key} className="text-left px-3 py-2.5 text-[11px] font-medium text-slate-500 uppercase">{col.label}</th>)}
            </tr></thead><tbody>
              {drillData.map(ad => <tr key={ad.external_id} className="hover:bg-slate-50">
                {adColumns.filter(c => c.visible).map(col => <td key={col.key} className="px-3 py-2.5 border-b border-slate-100 whitespace-nowrap">{renderAdCell(ad, col, drillDown?.campaign?.currency)}</td>)}
              </tr>)}
            </tbody></table>}
        </div></div>
      )}

      {/* Summary */}
      {!drillDown && campaigns.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400">Tong quan</span>
            <button onClick={() => setShowSummarySettings(!showSummarySettings)} className="btn btn-outline btn-sm py-0.5 px-2 text-[10px]">
              <Settings size={12} /> Tuy chinh
            </button>
          </div>
          {showSummarySettings && (
            <div className="card p-3 mb-2">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold">Chon chi so tong quan</div>
                <button onClick={() => setShowSummarySettings(false)}><X size={14} /></button>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                {SUMMARY_OPTIONS.map(opt => (
                  <label key={opt.key} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={visibleSummaryKeys.includes(opt.key)} onChange={() => toggleSummaryKey(opt.key)} />{opt.label}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(visibleSummaryKeys.length, 5)}, 1fr)` }}>
            {visibleSummaryKeys.map(key => {
              const opt = SUMMARY_OPTIONS.find(o => o.key === key);
              return (
                <div key={key} className="card p-3 text-center">
                  <div className="text-[10px] text-slate-400">{opt?.label || key}</div>
                  <div className={`text-lg font-semibold mt-1 ${['totalResults', 'avgCostPerResult', 'avgROAS'].includes(key) ? 'text-blue-600' : ''}`}>
                    {getSummaryValue(key)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
