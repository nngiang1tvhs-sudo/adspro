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

// Cot mac dinh cho Ad Sets
const DEFAULT_ADSET_COLUMNS = [
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
];

// Cot mac dinh cho Ads
const DEFAULT_AD_COLUMNS = [
  { key: 'name', label: 'Quang cao', visible: true, sticky: true },
  { key: 'preview', label: 'Hinh/Video', visible: true },
  { key: 'status', label: 'Trang thai', visible: true },
  { key: 'impressions', label: 'Hien thi', visible: true, format: 'number' },
  { key: 'clicks', label: 'Luot nhap', visible: true, format: 'number' },
  { key: 'ctr', label: 'CTR', visible: true, format: 'percent' },
  { key: 'cpc', label: 'CPC', visible: true, format: 'currency' },
  { key: 'spend', label: 'Chi phi', visible: true, format: 'currency' },
];

// Sortable column header
function SortableHeader({ col }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: col.key });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <th
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="text-left px-3 py-2.5 text-[11px] font-medium text-slate-500 uppercase tracking-wide cursor-grab whitespace-nowrap bg-slate-50 border-b border-slate-200 select-none"
    >
      {col.label}
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
  const [adsetColumns, setAdsetColumns] = useState(DEFAULT_ADSET_COLUMNS);
  const [adColumns, setAdColumns] = useState(DEFAULT_AD_COLUMNS);
  const [showDrillColSettings, setShowDrillColSettings] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  useEffect(() => {
    setColumns(DEFAULT_COLUMNS[platform]);
    setActivePreset('default');
    setGroupName('');
    setAccountId('');
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
  const displayCampaigns = campaigns.filter(c => {
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
      setColumns(savedCols);
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

  const visibleColumns = columns.filter(c => c.visible);

  const handleColumnDrag = (event) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIdx = visibleColumns.findIndex(c => c.key === active.id);
      const newIdx = visibleColumns.findIndex(c => c.key === over.id);
      const reordered = arrayMove(visibleColumns, oldIdx, newIdx);
      const hiddenCols = columns.filter(c => !c.visible);
      setColumns([...reordered, ...hiddenCols]);
    }
  };

  const toggleColumn = (key) => {
    setColumns(columns.map(c => c.key === key ? { ...c, visible: !c.visible } : c));
  };

  const toggleAdsetColumn = (key) => {
    setAdsetColumns(adsetColumns.map(c => c.key === key ? { ...c, visible: !c.visible } : c));
  };

  const toggleAdColumn = (key) => {
    setAdColumns(adColumns.map(c => c.key === key ? { ...c, visible: !c.visible } : c));
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
      return <span className={`badge ${badge.class}`}>{badge.label}</span>;
    }
    if (col.key === 'budget') {
      return formatCellValue(ag.budget, 'currency', currency);
    }
    const value = ag.metrics?.[col.key];
    return formatCellValue(value, col.format, currency);
  };

  const renderAdCell = (ad, col, currency) => {
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
      return <span className={`badge ${badge.class}`}>{badge.label}</span>;
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
          <label key={col.key} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={col.visible}
              onChange={() => toggleFn(col.key)}
              disabled={col.sticky}
            />
            {col.label}
          </label>
        ))}
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
              onClick={() => { setColumns(DEFAULT_COLUMNS[platform]); setActivePreset('default'); }}
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
              <label key={col.key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={col.visible}
                  onChange={() => toggleColumn(col.key)}
                  disabled={col.sticky}
                />
                {col.label}
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
            <span key={i} className="flex items-center gap-2">
              <ChevronRight size={14} />
              <span className={i === drillDown.breadcrumb.length - 1 ? 'text-slate-700' : 'text-blue-600 cursor-pointer hover:underline'}>
                {b}
              </span>
            </span>
          ))}
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
                        {visibleColumns.map(col => <SortableHeader key={col.key} col={col} />)}
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
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    {adsetColumns.filter(c => c.visible).map(col => (
                      <th key={col.key} className="text-left px-3 py-2.5 text-[11px] font-medium text-slate-500 uppercase">{col.label}</th>
                    ))}
                  </tr>
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
              </table>
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
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    {adColumns.filter(c => c.visible).map(col => (
                      <th key={col.key} className="text-left px-3 py-2.5 text-[11px] font-medium text-slate-500 uppercase">{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {drillData.map(ad => (
                    <tr key={ad.external_id} className="hover:bg-slate-50">
                      {adColumns.filter(c => c.visible).map(col => (
                        <td key={col.key} className="px-3 py-2.5 border-b border-slate-100 whitespace-nowrap">
                          {renderAdCell(ad, col, drillDown?.campaign?.currency)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
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
