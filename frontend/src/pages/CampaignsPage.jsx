import { useState, useEffect } from 'react';
import PlatformTabs from '../components/PlatformTabs';
import DateRangePicker from '../components/DateRangePicker';
import { campaignsApi, dashboardApi, settingsApi } from '../services/api';
import { formatCellValue, getStatusBadge, DEFAULT_COLUMNS, DATE_PRESETS, timeAgo } from '../utils/helpers';
import toast from 'react-hot-toast';
import { Settings, RefreshCw, Search, ChevronRight, Power, X, Plus, Save } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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
  const [accountId, setAccountId] = useState('');
  const [status, setStatus] = useState('');
  const [objective, setObjective] = useState('');
  const [search, setSearch] = useState('');

  const [campaigns, setCampaigns] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(false);

  const [columns, setColumns] = useState(DEFAULT_COLUMNS.google);
  const [showColSettings, setShowColSettings] = useState(false);
  const [presets, setPresets] = useState([]);
  const [activePreset, setActivePreset] = useState('default');

  // Drill-down
  const [drillDown, setDrillDown] = useState(null); // { type: 'ad_groups', campaign }, etc
  const [drillData, setDrillData] = useState([]);
  const [drillLoading, setDrillLoading] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  useEffect(() => {
    setColumns(DEFAULT_COLUMNS[platform]);
    loadAccounts();
    loadPresets();
  }, [platform]);

  useEffect(() => {
    loadCampaigns();
  }, [platform, accountId, status, objective, search, dateRange]);

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
        status: status || undefined,
        objective: objective || undefined,
        search: search || undefined,
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
      toast.success(newStatus ? 'Đã bật chiến dịch' : 'Đã tắt chiến dịch');
      await loadCampaigns();
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

      // Merge back với hidden columns
      const hiddenCols = columns.filter(c => !c.visible);
      setColumns([...reordered, ...hiddenCols]);
    }
  };

  const toggleColumn = (key) => {
    setColumns(columns.map(c => c.key === key ? { ...c, visible: !c.visible } : c));
  };

  const drillToAdGroups = async (campaign) => {
    setDrillDown({ type: 'ad_groups', campaign, breadcrumb: [campaign.name] });
    setDrillLoading(true);
    try {
      const res = await campaignsApi.getAdGroups(campaign.id, {
        date_from: dateRange.from,
        date_to: dateRange.to,
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
            title="Bật/Tắt chiến dịch"
          >
            <Power size={14} />
          </button>
        </div>
      );
    }
    if (col.key === 'objective') return <span className="badge badge-info text-[10px]">{camp.objective || '—'}</span>;
    if (col.key === 'budget') return formatCellValue(camp.budget, 'currency', camp.currency);

    const value = camp.metrics?.[col.key];
    return formatCellValue(value, col.format, camp.currency);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Chiến dịch</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {summary.active || 0} chiến dịch đang hoạt động · Tổng {summary.total || 0}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowColSettings(!showColSettings)}
            className="btn btn-outline btn-sm"
          >
            <Settings size={14} /> Cài đặt cột
          </button>
          <button onClick={handleSync} className="btn btn-primary btn-sm" disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Làm mới
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
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="input py-2 w-44">
          <option value="">Tất cả tài khoản</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.account_name}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="input py-2 w-44">
          <option value="">Tất cả trạng thái</option>
          <option value="ENABLED">Đang chạy (Google)</option>
          <option value="ACTIVE">Đang chạy (FB/TT)</option>
          <option value="PAUSED">Tạm dừng</option>
        </select>
        <select value={objective} onChange={(e) => setObjective(e.target.value)} className="input py-2 w-44">
          <option value="">Tất cả mục tiêu</option>
          {[...new Set(campaigns.map(c => c.objective).filter(Boolean))].map(obj => (
            <option key={obj} value={obj}>{obj}</option>
          ))}
        </select>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      {/* Column settings panel */}
      {showColSettings && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold">Hiển thị cột</div>
            <button onClick={() => setShowColSettings(false)}><X size={16} /></button>
          </div>

          {presets.length > 0 && (
            <div className="flex gap-1.5 mb-3 flex-wrap">
              <button className="btn btn-sm bg-blue-50 text-blue-700 border border-blue-200">Mặc định</button>
              {presets.map(p => (
                <button key={p.id} className="btn btn-outline btn-sm">{p.preset_name}</button>
              ))}
              <button className="btn btn-sm text-blue-600">
                <Plus size={12} /> Tạo nhóm cột mới
              </button>
            </div>
          )}

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
          <button onClick={() => setDrillDown(null)} className="text-blue-600 hover:underline">Chiến dịch</button>
          {drillDown.breadcrumb.map((b, i) => (
            <span key={i} className="flex items-center gap-2">
              <ChevronRight size={14} />
              <span className={i === drillDown.breadcrumb.length - 1 ? 'text-slate-700' : 'text-blue-600 cursor-pointer hover:underline'}>
                {b}
              </span>
            </span>
          ))}
          <span className="ml-auto text-xs">
            {drillDown.type === 'ad_groups' ? 'Nhóm quảng cáo' : 'Quảng cáo'}
          </span>
        </div>
      )}

      {/* TABLE */}
      {!drillDown && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            {loading ? (
              <div className="text-center py-12 text-slate-400">Đang tải...</div>
            ) : campaigns.length === 0 ? (
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
                    {campaigns.map(camp => (
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

      {/* DRILL-DOWN: Ad Groups */}
      {drillDown?.type === 'ad_groups' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            {drillLoading ? (
              <div className="text-center py-12 text-slate-400">Đang tải nhóm quảng cáo...</div>
            ) : drillData.length === 0 ? (
              <div className="text-center py-12 text-slate-400">Không có nhóm quảng cáo</div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-3 py-2.5 text-[11px] font-medium text-slate-500 uppercase">Nhóm QC</th>
                    <th className="text-left px-3 py-2.5 text-[11px] font-medium text-slate-500 uppercase">Trạng thái</th>
                    <th className="text-left px-3 py-2.5 text-[11px] font-medium text-slate-500 uppercase">CPV/CPM mục tiêu</th>
                    <th className="text-left px-3 py-2.5 text-[11px] font-medium text-slate-500 uppercase">Hiển thị</th>
                    <th className="text-left px-3 py-2.5 text-[11px] font-medium text-slate-500 uppercase">Lượt nhấp</th>
                    <th className="text-left px-3 py-2.5 text-[11px] font-medium text-slate-500 uppercase">Chi phí</th>
                    <th className="text-left px-3 py-2.5 text-[11px] font-medium text-slate-500 uppercase">Kết quả</th>
                    <th className="text-left px-3 py-2.5 text-[11px] font-medium text-slate-500 uppercase">CP/KQ</th>
                  </tr>
                </thead>
                <tbody>
                  {drillData.map(ag => (
                    <tr key={ag.external_id} className="hover:bg-slate-50">
                      <td className="px-3 py-2.5 border-b border-slate-100">
                        <span className="text-blue-600 font-medium cursor-pointer hover:underline" onClick={() => drillToAds(ag)}>
                          {ag.name}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 border-b border-slate-100">
                        <span className={`badge ${getStatusBadge(ag.status).class}`}>{getStatusBadge(ag.status).label}</span>
                      </td>
                      <td className="px-3 py-2.5 border-b border-slate-100">
                        {ag.target_cpv ? formatCellValue(ag.target_cpv, 'currency', drillDown?.campaign?.currency) : ag.target_cpm ? formatCellValue(ag.target_cpm, 'currency', drillDown?.campaign?.currency) : '—'}
                      </td>
                      <td className="px-3 py-2.5 border-b border-slate-100">{formatCellValue(ag.metrics?.impressions, 'number')}</td>
                      <td className="px-3 py-2.5 border-b border-slate-100">{formatCellValue(ag.metrics?.clicks, 'number')}</td>
                      <td className="px-3 py-2.5 border-b border-slate-100 font-medium">{formatCellValue(ag.metrics?.spend, 'currency', drillDown?.campaign?.currency)}</td>
                      <td className="px-3 py-2.5 border-b border-slate-100 text-blue-600">{formatCellValue(ag.metrics?.video_views || ag.metrics?.conversions, 'number')}</td>
                      <td className="px-3 py-2.5 border-b border-slate-100 text-blue-600">{formatCellValue(ag.metrics?.cpv || ag.metrics?.cpa, 'currency', drillDown?.campaign?.currency)}</td>
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
              <div className="text-center py-12 text-slate-400">Đang tải quảng cáo...</div>
            ) : drillData.length === 0 ? (
              <div className="text-center py-12 text-slate-400">Không có quảng cáo</div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-3 py-2.5 text-[11px] font-medium text-slate-500 uppercase">Quảng cáo</th>
                    <th className="text-left px-3 py-2.5 text-[11px] font-medium text-slate-500 uppercase">Hình/Video</th>
                    <th className="text-left px-3 py-2.5 text-[11px] font-medium text-slate-500 uppercase">Trạng thái</th>
                    <th className="text-left px-3 py-2.5 text-[11px] font-medium text-slate-500 uppercase">Hiển thị</th>
                    <th className="text-left px-3 py-2.5 text-[11px] font-medium text-slate-500 uppercase">Chi phí</th>
                  </tr>
                </thead>
                <tbody>
                  {drillData.map(ad => (
                    <tr key={ad.external_id} className="hover:bg-slate-50">
                      <td className="px-3 py-2.5 border-b border-slate-100">
                        <div className="font-medium">{ad.name}</div>
                        {ad.headline && <div className="text-[10px] text-slate-400 mt-0.5">Tiêu đề: {ad.headline}</div>}
                        {ad.description && <div className="text-[10px] text-slate-400">Mô tả: {ad.description}</div>}
                      </td>
                      <td className="px-3 py-2.5 border-b border-slate-100">
                        {ad.image_url ? (
                          <img src={ad.image_url} alt="" className="w-12 h-9 object-cover rounded" />
                        ) : ad.video_url ? (
                          <a href={ad.video_url} target="_blank" rel="noreferrer" className="text-blue-600 text-[10px]">▶ Video</a>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2.5 border-b border-slate-100">
                        <span className={`badge ${getStatusBadge(ad.status).class}`}>{getStatusBadge(ad.status).label}</span>
                      </td>
                      <td className="px-3 py-2.5 border-b border-slate-100">{formatCellValue(ad.metrics?.impressions, 'number')}</td>
                      <td className="px-3 py-2.5 border-b border-slate-100">{formatCellValue(ad.metrics?.spend, 'currency')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Summary */}
      {!drillDown && campaigns.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="card p-3 text-center">
            <div className="text-[10px] text-slate-400">Ngân sách/ngày</div>
            <div className="text-lg font-semibold mt-1">{formatCellValue(summary.totalBudget, 'currency', campaigns[0]?.currency)}</div>
          </div>
          <div className="card p-3 text-center">
            <div className="text-[10px] text-slate-400">Đã chi tiêu</div>
            <div className="text-lg font-semibold mt-1">{formatCellValue(summary.totalSpend, 'currency', campaigns[0]?.currency)}</div>
          </div>
          <div className="card p-3 text-center">
            <div className="text-[10px] text-slate-400">Tổng kết quả</div>
            <div className="text-lg font-semibold mt-1 text-blue-600">{formatCellValue(summary.totalResults, 'number')}</div>
          </div>
          <div className="card p-3 text-center">
            <div className="text-[10px] text-slate-400">CP/KQ trung bình</div>
            <div className="text-lg font-semibold mt-1 text-blue-600">{formatCellValue(summary.avgCostPerResult, 'currency', campaigns[0]?.currency)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
