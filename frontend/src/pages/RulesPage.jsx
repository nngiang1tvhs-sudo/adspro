import { useState, useEffect } from 'react';
import PlatformTabs from '../components/PlatformTabs';
import { rulesApi, dashboardApi, campaignsApi } from '../services/api';
import { PLATFORM_LABELS, timeAgo } from '../utils/helpers';
import toast from 'react-hot-toast';
import { Plus, Edit, Trash2, Play, X, Power, Mail, Clock, AlertCircle, Search, CheckSquare } from 'lucide-react';

const METRICS_BY_PLATFORM = {
  google: [
    { key: 'name', label: 'Tên (chứa/không chứa)', type: 'text' },
    { key: 'spend', label: 'Chi phí' },
    { key: 'impressions', label: 'Lượt hiển thị' },
    { key: 'clicks', label: 'Lượt nhấp' },
    { key: 'ctr', label: 'CTR (%)' },
    { key: 'cpc', label: 'CPC' },
    { key: 'cpm', label: 'CPM' },
    { key: 'video_views', label: 'TrueView' },
    { key: 'cpv', label: 'CPV' },
    { key: 'conversions', label: 'Chuyển đổi' },
    { key: 'cpa', label: 'CPA' },
    { key: 'roas', label: 'ROAS' },
    { key: 'time', label: 'Thời gian (khung giờ)' },
  ],
  facebook: [
    { key: 'name', label: 'Tên (chứa/không chứa)', type: 'text' },
    { key: 'spend', label: 'Chi phí' },
    { key: 'impressions', label: 'Lượt hiển thị' },
    { key: 'reach', label: 'Tiếp cận' },
    { key: 'clicks', label: 'Lượt nhấp' },
    { key: 'ctr', label: 'CTR (%)' },
    { key: 'cpc', label: 'CPC' },
    { key: 'cpm', label: 'CPM' },
    { key: 'conversions', label: 'Kết quả' },
    { key: 'cpa', label: 'CP/KQ' },
    { key: 'roas', label: 'ROAS' },
    { key: 'messages', label: 'Tin nhắn' },
    { key: 'engagements', label: 'Tương tác' },
    { key: 'time', label: 'Thời gian (khung giờ)' },
  ],
  tiktok: [
    { key: 'name', label: 'Tên (chứa/không chứa)', type: 'text' },
    { key: 'spend', label: 'Chi phí' },
    { key: 'impressions', label: 'Lượt hiển thị' },
    { key: 'clicks', label: 'Lượt nhấp' },
    { key: 'ctr', label: 'CTR (%)' },
    { key: 'cpc', label: 'CPC' },
    { key: 'video_views', label: 'Lượt xem' },
    { key: 'cpv', label: 'CPV' },
    { key: 'follows', label: 'Follow' },
    { key: 'conversions', label: 'Đơn hàng' },
    { key: 'cpa', label: 'CPA' },
    { key: 'time', label: 'Thời gian (khung giờ)' },
  ],
};

const STRING_OPERATORS = [
  { key: 'contains', label: 'chứa' },
  { key: 'not_contains', label: 'không chứa' },
  { key: 'starts_with', label: 'bắt đầu bằng' },
  { key: 'ends_with', label: 'kết thúc bằng' },
  { key: 'equals', label: 'bằng đúng' },
  { key: 'not_equals', label: 'khác' },
];

const TIME_RANGES = [
  { key: 'today', label: 'Hôm nay' },
  { key: '3d', label: '3 ngày' },
  { key: '5d', label: '5 ngày' },
  { key: '7d', label: '7 ngày' },
  { key: 'all', label: 'Toàn thời gian' },
];

const ACTION_TYPES = [
  { key: 'enable', label: 'Bật chiến dịch', color: 'green' },
  { key: 'pause', label: 'Tắt chiến dịch', color: 'red' },
  { key: 'notify', label: 'Gửi thông báo email', color: 'blue' },
  { key: 'warn_complete', label: 'Cảnh báo sắp hoàn thành', color: 'amber' },
  { key: 'warn_threshold', label: 'Cảnh báo sắp vượt ngưỡng', color: 'orange' },
];

export default function RulesPage() {
  const [platform, setPlatform] = useState('google');
  const [accountId, setAccountId] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState(null);

  useEffect(() => {
    loadAccounts();
  }, [platform]);

  useEffect(() => {
    loadRules();
  }, [platform, accountId]);

  const loadAccounts = async () => {
    try {
      const res = await dashboardApi.getAccounts(platform);
      setAccounts(res.data.accounts);
    } catch (err) {
      setAccounts([]);
    }
  };

  const loadRules = async () => {
    setLoading(true);
    try {
      const res = await rulesApi.list({
        platform,
        account_id: accountId || undefined,
      });
      setRules(res.data.rules);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (rule) => {
    try {
      await rulesApi.toggle(rule.id, !rule.is_active);
      toast.success(!rule.is_active ? 'Đã bật rule' : 'Đã tắt rule');
      await loadRules();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleRun = async (rule) => {
    const t = toast.loading('Đang chạy rule...');
    try {
      const res = await rulesApi.run(rule.id);
      const result = res.data;
      if (!result.success) {
        toast.error(result.message || 'Rule không thể chạy', { id: t });
      } else if (result.triggered > 0) {
        toast.success(`Rule đã trigger ${result.triggered} đối tượng`, { id: t });
      } else {
        toast(`Rule đã chạy. Không có đối tượng nào thỏa điều kiện (triggered: 0)`, {
          id: t, icon: 'ℹ️',
        });
      }
      await loadRules();
    } catch (err) {
      toast.error(err.message || 'Lỗi khi chạy rule', { id: t });
    }
  };

  const handleDelete = async (rule) => {
    if (!confirm(`Xóa rule "${rule.name}"?`)) return;
    try {
      await rulesApi.delete(rule.id);
      toast.success('Đã xóa');
      await loadRules();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleEdit = (rule) => {
    setEditingRule(rule);
    setShowForm(true);
  };

  const handleNew = () => {
    setEditingRule(null);
    setShowForm(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Quản lý Rule</h1>
          <p className="text-sm text-slate-500 mt-0.5">Tự động hóa quản lý chiến dịch theo điều kiện</p>
        </div>
        <button onClick={handleNew} className="btn btn-primary">
          <Plus size={16} /> Tạo Rule mới
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <PlatformTabs value={platform} onChange={setPlatform} />
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="input py-2 w-52"
        >
          <option value="">Tất cả tài khoản</option>
          {accounts.map(a => (
            <option key={a.id} value={a.id}>{a.account_name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">Đang tải...</div>
      ) : rules.length === 0 ? (
        <div className="card p-12 text-center">
          <AlertCircle size={32} className="text-slate-300 mx-auto mb-3" />
          <div className="text-sm text-slate-500 mb-1">Chưa có rule nào</div>
          <div className="text-xs text-slate-400 mb-4">Tạo rule đầu tiên để tự động hóa quản lý chiến dịch</div>
          <button onClick={handleNew} className="btn btn-primary btn-sm mx-auto">
            <Plus size={14} /> Tạo Rule
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          {rules.map(rule => <RuleCard key={rule.id} rule={rule} onToggle={handleToggle} onRun={handleRun} onEdit={handleEdit} onDelete={handleDelete} />)}
        </div>
      )}

      {showForm && (
        <RuleFormModal
          rule={editingRule}
          platform={platform}
          accounts={accounts}
          onClose={() => { setShowForm(false); setEditingRule(null); }}
          onSaved={() => { setShowForm(false); setEditingRule(null); loadRules(); }}
        />
      )}
    </div>
  );
}

// ============== Rule Card ==============
function RuleCard({ rule, onToggle, onRun, onEdit, onDelete }) {
  const conditions = rule.conditions || [];
  const actions = rule.actions || [];

  const getMetricLabel = (key) => {
    for (const platform of Object.values(METRICS_BY_PLATFORM)) {
      const m = platform.find(x => x.key === key);
      if (m) return m.label;
    }
    return key;
  };

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-slate-800">{rule.name}</h3>
            <span className={`badge ${rule.is_active ? 'badge-success' : 'badge-warning'}`}>
              {rule.is_active ? 'Đang chạy' : 'Tạm dừng'}
            </span>
            <span className="badge badge-info text-[10px]">
              {rule.scope === 'campaign' ? 'Chiến dịch' : rule.scope === 'ad_group' ? 'Nhóm QC' : 'QC'}
            </span>
            {rule.target_mode === 'specific' && rule.target_ids?.length > 0 && (
              <span className="badge badge-warning text-[10px]">
                {rule.target_ids.length} {rule.scope === 'campaign' ? 'chiến dịch' : rule.scope === 'ad_group' ? 'nhóm QC' : 'QC'} đã chọn
              </span>
            )}
            {rule.email_notify && (
              <span className="badge badge-info text-[10px]"><Mail size={10} className="inline mr-1" /> Email</span>
            )}
          </div>
          {rule.description && <p className="text-xs text-slate-500 mb-1">{rule.description}</p>}
          <div className="text-xs text-slate-400 flex items-center gap-3">
            <span><Clock size={10} className="inline mr-1" /> Cooldown: {rule.cooldown_minutes} phút</span>
            {rule.account_name && <span>Tài khoản: {rule.account_name}</span>}
            {rule.last_triggered_at && <span>Trigger gần nhất: {timeAgo(rule.last_triggered_at)}</span>}
            <span>Chạy {rule.total_runs || 0} lần · Trigger {rule.total_triggers || 0} lần</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => onToggle(rule)}
            className={`p-2 rounded-lg ${rule.is_active ? 'text-emerald-600 bg-emerald-50' : 'text-slate-400 bg-slate-50'} hover:opacity-80`}
            title={rule.is_active ? 'Tắt rule' : 'Bật rule'}
          >
            <Power size={14} />
          </button>
          <button onClick={() => onRun(rule)} className="p-2 text-blue-600 bg-blue-50 rounded-lg hover:opacity-80" title="Chạy ngay">
            <Play size={14} />
          </button>
          <button onClick={() => onEdit(rule)} className="p-2 text-slate-600 bg-slate-50 rounded-lg hover:opacity-80" title="Sửa">
            <Edit size={14} />
          </button>
          <button onClick={() => onDelete(rule)} className="p-2 text-red-600 bg-red-50 rounded-lg hover:opacity-80" title="Xóa">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Conditions hiển thị xếp ngang */}
      <div className="bg-slate-50 rounded-lg p-3 space-y-2 mb-2">
        <div className="text-[11px] uppercase text-slate-500 font-medium tracking-wide">Điều kiện ({rule.conditions_logic})</div>
        {conditions.map((c, i) => (
          <div key={i} className="flex items-center gap-2 text-xs flex-wrap">
            {i > 0 && <span className="text-slate-400 font-medium">{rule.conditions_logic}</span>}
            {c.metric === 'time' ? (
              <>
                <span className="bg-white px-2 py-1 rounded border border-slate-200">Thời gian</span>
                <span className="bg-white px-2 py-1 rounded border border-slate-200">{c.timeStart} → {c.timeEnd}</span>
              </>
            ) : c.metric === 'name' ? (
              <>
                <span className="bg-violet-50 text-violet-700 px-2 py-1 rounded border border-violet-200">Tên</span>
                <span className="bg-white px-2 py-1 rounded border border-slate-200 text-slate-600">
                  {STRING_OPERATORS.find(o => o.key === c.operator)?.label || c.operator}
                </span>
                <span className="bg-white px-2 py-1 rounded border border-slate-200 font-medium italic">"{c.value}"</span>
              </>
            ) : (
              <>
                <span className="bg-white px-2 py-1 rounded border border-slate-200">{getMetricLabel(c.metric)}</span>
                <span className="bg-white px-2 py-1 rounded border border-slate-200 font-mono">{c.operator}</span>
                <span className="bg-white px-2 py-1 rounded border border-slate-200 font-medium">{c.value}</span>
                <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-100">
                  {TIME_RANGES.find(t => t.key === c.timeRange)?.label || c.timeRange}
                </span>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] uppercase text-slate-500 font-medium tracking-wide mr-1">Hành động:</span>
        {actions.map((a, i) => {
          const at = ACTION_TYPES.find(t => t.key === a.type);
          const colorClass = {
            green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
            red: 'bg-red-50 text-red-700 border-red-200',
            blue: 'bg-blue-50 text-blue-700 border-blue-200',
            amber: 'bg-amber-50 text-amber-700 border-amber-200',
            orange: 'bg-orange-50 text-orange-700 border-orange-200',
          }[at?.color] || 'bg-slate-50 text-slate-700 border-slate-200';
          return (
            <span key={i} className={`text-xs px-2 py-1 rounded border ${colorClass}`}>
              {at?.label || a.type}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ============== Rule Form Modal ==============
function RuleFormModal({ rule, platform, accounts, onClose, onSaved }) {
  const [name, setName] = useState(rule?.name || '');
  const [description, setDescription] = useState(rule?.description || '');
  const [scope, setScope] = useState(rule?.scope || 'campaign');
  const [accountId, setAccountId] = useState(rule?.account_id || '');
  const [cooldown, setCooldown] = useState(rule?.cooldown_minutes || 60);
  const [isActive, setIsActive] = useState(rule?.is_active !== false);
  const [emailNotify, setEmailNotify] = useState(rule?.email_notify !== false);
  const [conditionsLogic, setConditionsLogic] = useState(rule?.conditions_logic || 'AND');
  const [conditions, setConditions] = useState(rule?.conditions || [
    { metric: 'spend', operator: '>', value: 0, timeRange: 'today' }
  ]);
  const [action, setAction] = useState((rule?.actions || [{ type: 'notify' }])[0]?.type || 'notify');
  const [saving, setSaving] = useState(false);
  const [targetMode, setTargetMode] = useState(rule?.target_mode || 'all');
  const [selectedTargets, setSelectedTargets] = useState(rule?.target_ids || []);
  const [showPicker, setShowPicker] = useState(false);

  const metrics = METRICS_BY_PLATFORM[platform];

  const addCondition = () => {
    setConditions([...conditions, { metric: 'spend', operator: '>', value: 0, timeRange: 'today' }]);
  };

  const removeCondition = (idx) => {
    setConditions(conditions.filter((_, i) => i !== idx));
  };

  const updateCondition = (idx, field, value) => {
    const newConds = [...conditions];
    newConds[idx] = { ...newConds[idx], [field]: value };
    setConditions(newConds);
  };


  const handleSubmit = async () => {
    if (!name) return toast.error('Vui lòng nhập tên rule');
    if (conditions.length === 0) return toast.error('Vui lòng thêm ít nhất 1 điều kiện');
    setSaving(true);
    try {
      const data = {
        platform,
        account_id: accountId || null,
        name, description, scope,
        conditions, conditions_logic: conditionsLogic,
        actions: [{ type: action }],
        cooldown_minutes: Number(cooldown),
        is_active: isActive,
        email_notify: emailNotify,
        target_mode: targetMode,
        target_ids: selectedTargets,
      };

      if (rule) {
        await rulesApi.update(rule.id, data);
        toast.success('Đã cập nhật rule');
      } else {
        await rulesApi.create(data);
        toast.success('Đã tạo rule');
      }
      onSaved();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-8">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white rounded-t-2xl z-10">
          <h2 className="text-lg font-semibold">{rule ? 'Sửa Rule' : 'Tạo Rule mới'}</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-md"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Tên rule *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="VD: Tắt camp khi CPV > 500đ" />
            </div>
            <div>
              <label className="label">Tài khoản</label>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="input">
                <option value="">Áp dụng tất cả tài khoản {PLATFORM_LABELS[platform]}</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.account_name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Mô tả</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} className="input" placeholder="Mô tả ngắn về rule này" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Phạm vi *</label>
              <select value={scope} onChange={(e) => setScope(e.target.value)} className="input">
                <option value="campaign">Chiến dịch</option>
                <option value="ad_group">Nhóm quảng cáo</option>
                <option value="ad">Quảng cáo</option>
              </select>
            </div>
            <div>
              <label className="label">Cooldown (phút)</label>
              <input type="number" value={cooldown} onChange={(e) => setCooldown(e.target.value)} className="input" min="1" />
            </div>
            <div className="flex items-end gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                Kích hoạt ngay
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={emailNotify} onChange={(e) => setEmailNotify(e.target.checked)} />
                Gửi email
              </label>
            </div>
          </div>

          {/* Target selection */}
          <div>
            <label className="label">Áp dụng cho</label>
            <div className="flex gap-2 mb-2">
              <button
                type="button"
                onClick={() => { setTargetMode('all'); setSelectedTargets([]); }}
                className={`px-3 py-1.5 rounded-lg text-sm border-2 transition-colors ${targetMode === 'all' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600'}`}
              >
                Tất cả {scope === 'campaign' ? 'chiến dịch' : scope === 'ad_group' ? 'nhóm quảng cáo' : 'quảng cáo'}
              </button>
              <button
                type="button"
                onClick={() => { setTargetMode('specific'); setShowPicker(true); }}
                className={`px-3 py-1.5 rounded-lg text-sm border-2 transition-colors ${targetMode === 'specific' ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-slate-200 bg-white text-slate-600'}`}
              >
                Chọn cụ thể
              </button>
            </div>

            {targetMode === 'specific' && (
              <div className="bg-violet-50 border border-violet-200 rounded-lg p-3">
                {selectedTargets.length === 0 ? (
                  <div className="text-sm text-violet-600 text-center py-2">
                    Chưa chọn {scope === 'campaign' ? 'chiến dịch' : scope === 'ad_group' ? 'nhóm quảng cáo' : 'quảng cáo'} nào
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {selectedTargets.slice(0, 5).map(t => (
                      <span key={t.id} className="bg-white text-violet-700 text-xs px-2 py-1 rounded border border-violet-200 flex items-center gap-1 max-w-[200px]">
                        <span className="truncate">{t.name}</span>
                        <button type="button" onClick={() => setSelectedTargets(selectedTargets.filter(x => x.id !== t.id))} className="flex-shrink-0 text-violet-400 hover:text-violet-700">
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                    {selectedTargets.length > 5 && (
                      <span className="text-xs text-violet-600 px-2 py-1">+{selectedTargets.length - 5} khác</span>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setShowPicker(true)}
                  className="text-xs text-violet-600 hover:text-violet-800 underline"
                >
                  {selectedTargets.length === 0 ? '+ Chọn từ danh sách' : 'Sửa danh sách đã chọn'}
                </button>
              </div>
            )}
          </div>

          {/* Conditions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label !mb-0">Điều kiện *</label>
              <div className="flex items-center gap-2">
                <select value={conditionsLogic} onChange={(e) => setConditionsLogic(e.target.value)} className="text-xs border border-slate-200 rounded px-2 py-1">
                  <option value="AND">VÀ (Tất cả phải đúng)</option>
                  <option value="OR">HOẶC (Một trong các điều kiện)</option>
                </select>
                <button type="button" onClick={addCondition} className="btn btn-outline btn-sm">
                  <Plus size={12} /> Thêm
                </button>
              </div>
            </div>

            <div className="space-y-2 bg-slate-50 p-3 rounded-lg">
              {conditions.map((c, idx) => (
                <div key={idx} className="flex items-center gap-2 flex-wrap">
                  {idx > 0 && <span className="text-xs font-medium text-slate-500">{conditionsLogic}</span>}

                  <select
                    value={c.metric}
                    onChange={(e) => {
                      const newMetric = e.target.value;
                      const newConds = [...conditions];
                      if (newMetric === 'name') {
                        newConds[idx] = { metric: 'name', operator: 'contains', value: '' };
                      } else if (newMetric === 'time') {
                        newConds[idx] = { metric: 'time', timeStart: '06:00', timeEnd: '22:00' };
                      } else if (c.metric === 'name' || c.metric === 'time') {
                        newConds[idx] = { metric: newMetric, operator: '>', value: 0, timeRange: 'today' };
                      } else {
                        newConds[idx] = { ...newConds[idx], metric: newMetric };
                      }
                      setConditions(newConds);
                    }}
                    className="border border-slate-200 rounded-md px-2 py-1.5 text-xs bg-white min-w-[160px]"
                  >
                    {metrics.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                  </select>

                  {c.metric === 'time' ? (
                    <>
                      <span className="text-xs text-slate-500">từ</span>
                      <input
                        type="time"
                        value={c.timeStart || '06:00'}
                        onChange={(e) => updateCondition(idx, 'timeStart', e.target.value)}
                        className="border border-slate-200 rounded-md px-2 py-1.5 text-xs"
                      />
                      <span className="text-xs text-slate-500">đến</span>
                      <input
                        type="time"
                        value={c.timeEnd || '22:00'}
                        onChange={(e) => updateCondition(idx, 'timeEnd', e.target.value)}
                        className="border border-slate-200 rounded-md px-2 py-1.5 text-xs"
                      />
                    </>
                  ) : c.metric === 'name' ? (
                    <>
                      <select
                        value={c.operator || 'contains'}
                        onChange={(e) => updateCondition(idx, 'operator', e.target.value)}
                        className="border border-slate-200 rounded-md px-2 py-1.5 text-xs bg-white w-36"
                      >
                        {STRING_OPERATORS.map(o => (
                          <option key={o.key} value={o.key}>{o.label}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={c.value || ''}
                        onChange={(e) => updateCondition(idx, 'value', e.target.value)}
                        className="border border-slate-200 rounded-md px-2 py-1.5 text-xs flex-1 min-w-[140px]"
                        placeholder='VD: "camp_abc", "test", "video"'
                      />
                      <span className="text-[10px] text-slate-400 whitespace-nowrap">(không phân biệt hoa thường)</span>
                    </>
                  ) : (
                    <>
                      <select value={c.operator} onChange={(e) => updateCondition(idx, 'operator', e.target.value)} className="border border-slate-200 rounded-md px-2 py-1.5 text-xs bg-white font-mono w-16">
                        <option value=">">{'>'}</option>
                        <option value="<">{'<'}</option>
                        <option value="=">=</option>
                        <option value=">=">≥</option>
                        <option value="<=">≤</option>
                        <option value="!=">≠</option>
                      </select>

                      <input
                        type="number"
                        step="any"
                        value={c.value}
                        onChange={(e) => updateCondition(idx, 'value', Number(e.target.value))}
                        className="border border-slate-200 rounded-md px-2 py-1.5 text-xs w-24"
                        placeholder="Giá trị"
                      />

                      <select value={c.timeRange || 'today'} onChange={(e) => updateCondition(idx, 'timeRange', e.target.value)} className="border border-slate-200 rounded-md px-2 py-1.5 text-xs bg-blue-50 text-blue-700 w-32">
                        {TIME_RANGES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                      </select>
                    </>
                  )}

                  <button type="button" onClick={() => removeCondition(idx)} className="p-1 text-red-500 hover:bg-red-50 rounded-md ml-auto">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Actions - single select */}
          <div>
            <label className="label">Hành động *</label>
            <div className="grid grid-cols-2 gap-2">
              {ACTION_TYPES.map(at => {
                const isSelected = action === at.key;
                const colorClass = {
                  green: isSelected ? 'bg-emerald-50 border-emerald-400 text-emerald-700' : 'bg-white border-slate-200 text-slate-600',
                  red: isSelected ? 'bg-red-50 border-red-400 text-red-700' : 'bg-white border-slate-200 text-slate-600',
                  blue: isSelected ? 'bg-blue-50 border-blue-400 text-blue-700' : 'bg-white border-slate-200 text-slate-600',
                  amber: isSelected ? 'bg-amber-50 border-amber-400 text-amber-700' : 'bg-white border-slate-200 text-slate-600',
                  orange: isSelected ? 'bg-orange-50 border-orange-400 text-orange-700' : 'bg-white border-slate-200 text-slate-600',
                }[at.color];
                return (
                  <button
                    key={at.key}
                    type="button"
                    onClick={() => setAction(at.key)}
                    className={`p-3 rounded-lg border-2 text-left transition-colors flex items-center gap-2 ${colorClass}`}
                  >
                    <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${isSelected ? 'border-current' : 'border-slate-300'}`}>
                      {isSelected && <span className="w-2 h-2 rounded-full bg-current" />}
                    </span>
                    <span className="text-sm font-medium">{at.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-slate-100 flex justify-end gap-2 sticky bottom-0 bg-white rounded-b-2xl">
          <button onClick={onClose} className="btn btn-outline">Hủy</button>
          <button onClick={handleSubmit} disabled={saving} className="btn btn-primary">
            {saving ? 'Đang lưu...' : (rule ? 'Cập nhật' : 'Tạo Rule')}
          </button>
        </div>

        {showPicker && (
          <TargetPickerModal
            platform={platform}
            accountId={accountId}
            scope={scope}
            selected={selectedTargets}
            onClose={() => setShowPicker(false)}
            onSave={(targets) => { setSelectedTargets(targets); setShowPicker(false); }}
          />
        )}
      </div>
    </div>
  );
}

// ============== Target Picker Modal ==============
function TargetPickerModal({ platform, accountId, scope, selected, onClose, onSave }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [checked, setChecked] = useState(() => new Map(selected.map(t => [t.id, t])));

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    setLoading(true);
    try {
      const res = await campaignsApi.getTargets({ platform, account_id: accountId || undefined, scope });
      setItems(res.data.targets || []);
    } catch (err) {
      toast.error('Không thể tải danh sách');
    } finally {
      setLoading(false);
    }
  };

  const filtered = items.filter(item =>
    !search || item.name.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (item) => {
    const next = new Map(checked);
    if (next.has(item.id)) {
      next.delete(item.id);
    } else {
      next.set(item.id, { id: item.id, name: item.name, status: item.status });
    }
    setChecked(next);
  };

  const toggleAll = () => {
    if (filtered.every(item => checked.has(item.id))) {
      const next = new Map(checked);
      filtered.forEach(item => next.delete(item.id));
      setChecked(next);
    } else {
      const next = new Map(checked);
      filtered.forEach(item => next.set(item.id, { id: item.id, name: item.name, status: item.status }));
      setChecked(next);
    }
  };

  const isActive = (status) => ['ENABLED', 'ACTIVE', 'ENABLE', 'enable', 'active'].includes(status);

  const selectedList = [...checked.values()];
  const scopeLabel = scope === 'campaign' ? 'chiến dịch' : scope === 'ad_group' ? 'nhóm quảng cáo' : 'quảng cáo';

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col" style={{ maxHeight: '80vh' }}>
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">Chọn {scopeLabel}</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X size={18} /></button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Left: list */}
          <div className="flex-1 border-r border-slate-100 flex flex-col min-h-0">
            {/* Search */}
            <div className="p-3 border-b border-slate-100">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Tìm kiếm theo tên ${scopeLabel}`}
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400"
                />
              </div>
            </div>

            {/* Count + select all */}
            <div className="px-3 py-2 flex items-center justify-between border-b border-slate-50">
              <span className="text-xs text-slate-500">
                {loading ? 'Đang tải...' : `${filtered.length}/${items.length} ${scopeLabel}`}
              </span>
              {!loading && filtered.length > 0 && (
                <button
                  type="button"
                  onClick={toggleAll}
                  className="text-xs text-blue-600 hover:underline"
                >
                  {filtered.every(item => checked.has(item.id)) ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                </button>
              )}
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="text-center py-8 text-slate-400 text-sm">Đang tải...</div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">
                  {items.length === 0 ? `Chưa có ${scopeLabel} nào trong DB. Hãy đồng bộ dữ liệu trước.` : 'Không tìm thấy kết quả'}
                </div>
              ) : (
                filtered.map(item => (
                  <label
                    key={item.id}
                    className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-slate-50 border-b border-slate-50 ${checked.has(item.id) ? 'bg-blue-50' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked.has(item.id)}
                      onChange={() => toggle(item)}
                      className="w-4 h-4 rounded text-blue-600"
                    />
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive(item.status) ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-slate-700 truncate">{item.name}</div>
                      {item.parent_name && (
                        <div className="text-[10px] text-slate-400 truncate">{item.parent_name}</div>
                      )}
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Right: selected */}
          <div className="w-52 flex flex-col min-h-0">
            <div className="p-3 border-b border-slate-100 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600">Đã chọn {selectedList.length} mục</span>
              {selectedList.length > 0 && (
                <button type="button" onClick={() => setChecked(new Map())} className="text-xs text-red-500 hover:underline">
                  Xoá tất cả
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              {selectedList.map(t => (
                <div key={t.id} className="flex items-center gap-2 px-3 py-2 border-b border-slate-50 group">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive(t.status) ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  <span className="flex-1 text-xs text-slate-700 truncate">{t.name}</span>
                  <button type="button" onClick={() => toggle(t)} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-outline btn-sm">Hủy</button>
          <button type="button" onClick={() => onSave(selectedList)} className="btn btn-primary btn-sm">
            Xong ({selectedList.length} đã chọn)
          </button>
        </div>
      </div>
    </div>
  );
}
