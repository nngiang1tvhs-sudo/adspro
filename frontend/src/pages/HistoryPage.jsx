import { useState, useEffect } from 'react';
import { historyApi, accountsApi } from '../services/api';
import { formatDateTime, PLATFORM_LABELS } from '../utils/helpers';
import toast from 'react-hot-toast';
import { CheckCircle, XCircle, AlertCircle, Info } from 'lucide-react';

const TABS = [
  { key: 'audit', label: 'Audit Log' },
  { key: 'rules', label: 'Lịch sử Rule' },
  { key: 'sync', label: 'Lịch sử Đồng bộ' },
];

const LEVEL_ICONS = {
  success: { icon: CheckCircle, color: 'text-emerald-500' },
  info: { icon: Info, color: 'text-blue-500' },
  warning: { icon: AlertCircle, color: 'text-amber-500' },
  error: { icon: XCircle, color: 'text-red-500' },
};

const STATUS_BADGE = {
  success: 'badge-success',
  failed: 'badge-error',
  warning: 'badge-warning',
  skipped: 'badge-info',
  partial: 'badge-warning',
};

export default function HistoryPage() {
  const [tab, setTab] = useState('audit');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState('');
  const [eventType, setEventType] = useState('');
  const [level, setLevel] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    loadAccounts();
  }, []);

  useEffect(() => {
    loadData();
  }, [tab, accountId, eventType, level, status]);

  const loadAccounts = async () => {
    try {
      const res = await accountsApi.list();
      setAccounts(res.data.accounts);
    } catch (err) {}
  };

  const loadData = async () => {
    setLoading(true);
    try {
      let res;
      const params = {};
      if (accountId) params.account_id = accountId;

      if (tab === 'audit') {
        if (eventType) params.event_type = eventType;
        if (level) params.level = level;
        res = await historyApi.audit(params);
        setData(res.data.logs);
      } else if (tab === 'rules') {
        if (status) params.status = status;
        res = await historyApi.rules(params);
        setData(res.data.history);
      } else if (tab === 'sync') {
        if (status) params.status = status;
        res = await historyApi.sync(params);
        setData(res.data.logs);
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Lịch sử & Audit</h1>
        <p className="text-sm text-slate-500 mt-0.5">Theo dõi mọi hoạt động của hệ thống</p>
      </div>

      {/* Tabs */}
      <div className="inline-flex bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setEventType(''); setLevel(''); setStatus(''); }}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              tab === t.key ? 'bg-brand-500 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="input py-2 w-52">
          <option value="">Tất cả tài khoản</option>
          {accounts.map(a => (
            <option key={a.id} value={a.id}>{PLATFORM_LABELS[a.platform]} — {a.account_name}</option>
          ))}
        </select>

        {tab === 'audit' && (
          <>
            <select value={eventType} onChange={(e) => setEventType(e.target.value)} className="input py-2 w-44">
              <option value="">Tất cả sự kiện</option>
              <option value="LOGIN">Đăng nhập</option>
              <option value="RULE_CREATED">Tạo Rule</option>
              <option value="RULE_TRIGGERED">Rule trigger</option>
              <option value="ACCOUNT_CONNECTED">Kết nối TK</option>
              <option value="SYNC_SUCCESS">Đồng bộ TC</option>
              <option value="SYNC_FAILED">Đồng bộ thất bại</option>
              <option value="API_ERROR">Lỗi API</option>
              <option value="EMAIL_SENT">Gửi email</option>
              <option value="CAMPAIGN_TOGGLE">Bật/Tắt camp</option>
            </select>
            <select value={level} onChange={(e) => setLevel(e.target.value)} className="input py-2 w-36">
              <option value="">Tất cả mức độ</option>
              <option value="success">Thành công</option>
              <option value="info">Thông tin</option>
              <option value="warning">Cảnh báo</option>
              <option value="error">Lỗi</option>
            </select>
          </>
        )}

        {(tab === 'rules' || tab === 'sync') && (
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="input py-2 w-36">
            <option value="">Tất cả</option>
            <option value="success">Thành công</option>
            <option value="failed">Thất bại</option>
            {tab === 'rules' && <option value="skipped">Bỏ qua</option>}
            {tab === 'sync' && <option value="partial">Một phần</option>}
          </select>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-slate-400">Đang tải...</div>
        ) : data.length === 0 ? (
          <div className="text-center py-12 text-slate-400">Chưa có dữ liệu</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-500 tracking-wide">
                {tab === 'audit' && (
                  <tr>
                    <th className="text-left px-4 py-3 font-medium w-40">Thời gian</th>
                    <th className="text-left px-4 py-3 font-medium w-36">Sự kiện</th>
                    <th className="text-left px-4 py-3 font-medium w-24">Mức độ</th>
                    <th className="text-left px-4 py-3 font-medium">Tài khoản</th>
                    <th className="text-left px-4 py-3 font-medium">Nội dung</th>
                  </tr>
                )}
                {tab === 'rules' && (
                  <tr>
                    <th className="text-left px-4 py-3 font-medium w-40">Thời gian</th>
                    <th className="text-left px-4 py-3 font-medium">Rule</th>
                    <th className="text-left px-4 py-3 font-medium">Đối tượng</th>
                    <th className="text-left px-4 py-3 font-medium w-28">Trạng thái</th>
                    <th className="text-left px-4 py-3 font-medium">Kết quả</th>
                  </tr>
                )}
                {tab === 'sync' && (
                  <tr>
                    <th className="text-left px-4 py-3 font-medium w-40">Bắt đầu</th>
                    <th className="text-left px-4 py-3 font-medium">Tài khoản</th>
                    <th className="text-left px-4 py-3 font-medium w-28">Trạng thái</th>
                    <th className="text-left px-4 py-3 font-medium w-24">Số lượng</th>
                    <th className="text-left px-4 py-3 font-medium w-24">Thời gian</th>
                    <th className="text-left px-4 py-3 font-medium">Lỗi</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {data.map(row => {
                  if (tab === 'audit') {
                    const lvl = LEVEL_ICONS[row.level] || LEVEL_ICONS.info;
                    const Icon = lvl.icon;
                    return (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 border-b border-slate-100 text-xs text-slate-600 whitespace-nowrap">
                          {formatDateTime(row.created_at)}
                        </td>
                        <td className="px-4 py-2.5 border-b border-slate-100">
                          <span className="text-[10px] font-mono bg-slate-100 px-2 py-0.5 rounded">{row.event_type}</span>
                        </td>
                        <td className="px-4 py-2.5 border-b border-slate-100">
                          <Icon size={16} className={lvl.color} />
                        </td>
                        <td className="px-4 py-2.5 border-b border-slate-100 text-xs">
                          {row.account_name ? (
                            <span>{PLATFORM_LABELS[row.platform]} — {row.account_name}</span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-2.5 border-b border-slate-100 text-xs">{row.message}</td>
                      </tr>
                    );
                  }
                  if (tab === 'rules') {
                    return (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 border-b border-slate-100 text-xs text-slate-600 whitespace-nowrap">
                          {formatDateTime(row.executed_at)}
                        </td>
                        <td className="px-4 py-2.5 border-b border-slate-100">
                          <div className="font-medium text-sm">{row.rule_name}</div>
                          {row.account_name && <div className="text-[10px] text-slate-400">{PLATFORM_LABELS[row.platform]} — {row.account_name}</div>}
                        </td>
                        <td className="px-4 py-2.5 border-b border-slate-100 text-xs">
                          {row.target_name || '—'}
                        </td>
                        <td className="px-4 py-2.5 border-b border-slate-100">
                          <span className={`badge ${STATUS_BADGE[row.status] || 'badge-info'}`}>
                            {row.status === 'success' ? 'Thành công' : row.status === 'failed' ? 'Thất bại' : row.status === 'skipped' ? 'Bỏ qua' : row.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 border-b border-slate-100 text-xs text-slate-600">{row.message || '—'}</td>
                      </tr>
                    );
                  }
                  if (tab === 'sync') {
                    return (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 border-b border-slate-100 text-xs text-slate-600 whitespace-nowrap">
                          {formatDateTime(row.started_at)}
                        </td>
                        <td className="px-4 py-2.5 border-b border-slate-100 text-xs">
                          {PLATFORM_LABELS[row.platform]} — {row.account_name}
                        </td>
                        <td className="px-4 py-2.5 border-b border-slate-100">
                          <span className={`badge ${STATUS_BADGE[row.status] || 'badge-info'}`}>
                            {row.status === 'success' ? 'Thành công' : row.status === 'failed' ? 'Thất bại' : row.status === 'partial' ? 'Một phần' : row.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 border-b border-slate-100 text-xs">
                          {row.campaigns_synced} camp
                        </td>
                        <td className="px-4 py-2.5 border-b border-slate-100 text-xs">
                          {row.duration_ms ? `${row.duration_ms}ms` : '—'}
                        </td>
                        <td className="px-4 py-2.5 border-b border-slate-100 text-xs text-red-500">
                          {row.error_message || '—'}
                        </td>
                      </tr>
                    );
                  }
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
