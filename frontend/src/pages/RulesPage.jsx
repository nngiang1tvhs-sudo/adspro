import { useState, useEffect } from 'react';
import PlatformTabs from '../components/PlatformTabs';
import { rulesApi, dashboardApi } from '../services/api';
import { PLATFORM_LABELS, timeAgo } from '../utils/helpers';
import toast from 'react-hot-toast';
import { Plus, Edit, Trash2, Play, X, Power, Mail, Clock, AlertCircle } from 'lucide-react';

const METRICS_BY_PLATFORM = {
  google: [
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
  const [actions, setActions] = useState(rule?.actions || [{ type: 'notify' }]);
  const [saving, setSaving] = useState(false);

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

  const toggleAction = (type) => {
    if (actions.find(a => a.type === type)) {
      setActions(actions.filter(a => a.type !== type));
    } else {
      setActions([...actions, { type }]);
    }
  };

  const handleSubmit = async () => {
    if (!name) return toast.error('Vui lòng nhập tên rule');
    if (conditions.length === 0) return toast.error('Vui lòng thêm ít nhất 1 điều kiện');
    if (actions.length === 0) return toast.error('Vui lòng chọn ít nhất 1 hành động');

    setSaving(true);
    try {
      const data = {
        platform,
        account_id: accountId || null,
        name, description, scope,
        conditions, conditions_logic: conditionsLogic,
        actions,
        cooldown_minutes: Number(cooldown),
        is_active: isActive,
        email_notify: emailNotify,
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

                  <select value={c.metric} onChange={(e) => updateCondition(idx, 'metric', e.target.value)} className="border border-slate-200 rounded-md px-2 py-1.5 text-xs bg-white min-w-[140px]">
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

          {/* Actions */}
          <div>
            <label className="label">Hành động *</label>
            <div className="grid grid-cols-2 gap-2">
              {ACTION_TYPES.map(at => {
                const isSelected = actions.find(a => a.type === at.key);
                const colorClass = {
                  green: isSelected ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-white border-slate-200',
                  red: isSelected ? 'bg-red-50 border-red-300 text-red-700' : 'bg-white border-slate-200',
                  blue: isSelected ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-slate-200',
                  amber: isSelected ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-white border-slate-200',
                  orange: isSelected ? 'bg-orange-50 border-orange-300 text-orange-700' : 'bg-white border-slate-200',
                }[at.color];
                return (
                  <button
                    key={at.key}
                    type="button"
                    onClick={() => toggleAction(at.key)}
                    className={`p-3 rounded-lg border-2 text-left transition-colors ${colorClass}`}
                  >
                    <div className="text-sm font-medium">{at.label}</div>
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
      </div>
    </div>
  );
}
