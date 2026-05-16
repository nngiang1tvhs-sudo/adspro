import { useState, useEffect } from 'react';
import { accountsApi, settingsApi } from '../services/api';
import { PLATFORMS, PLATFORM_LABELS, PLATFORM_COLORS, formatDateTime, timeAgo } from '../utils/helpers';
import toast from 'react-hot-toast';
import { Plus, Edit, Trash2, RefreshCw, Mail, X, CheckCircle, AlertCircle, Send } from 'lucide-react';

const TABS = [
  { key: 'accounts', label: 'Tài khoản' },
  { key: 'email', label: 'Cài đặt email' },
];

const PLATFORM_FIELDS = {
  google: [
    { key: 'developer_token', label: 'Developer Token', type: 'password', help: 'Lấy từ Google Ads Manager → Tools → API Center' },
    { key: 'client_id', label: 'Client ID', type: 'text', help: 'OAuth 2.0 Client ID từ Google Cloud Console' },
    { key: 'client_secret', label: 'Client Secret', type: 'password' },
    { key: 'refresh_token', label: 'Refresh Token', type: 'password', help: 'Lấy qua flow OAuth (xem README)' },
    { key: 'customer_id', label: 'Customer ID', type: 'text', help: 'ID tài khoản Google Ads (định dạng XXX-XXX-XXXX)' },
    { key: 'login_customer_id', label: 'Login Customer ID (MCC)', type: 'text', optional: true, help: 'ID MCC nếu dùng tài khoản quản lý (không bắt buộc)' },
  ],
  facebook: [
    { key: 'access_token', label: 'System User Access Token', type: 'password', help: 'Token không hết hạn — lấy từ Business Settings → System Users' },
    { key: 'bm_id', label: 'Business Manager ID', type: 'text', help: 'ID của BM (Business Settings → Business Info)' },
    { key: 'app_id', label: 'App ID', type: 'text', optional: true },
    { key: 'app_secret', label: 'App Secret', type: 'password', optional: true },
  ],
  tiktok: [
    { key: 'app_id', label: 'App ID', type: 'text' },
    { key: 'app_secret', label: 'App Secret', type: 'password' },
    { key: 'access_token', label: 'Access Token', type: 'password', help: 'Token có hạn 24h, sẽ tự động refresh' },
    { key: 'refresh_token', label: 'Refresh Token', type: 'password', help: 'Token có hạn 1 năm để tự động làm mới Access Token' },
    { key: 'advertiser_id', label: 'Advertiser ID', type: 'text', help: 'ID tài khoản TikTok Ads' },
  ],
};

export default function ConnectPage() {
  const [tab, setTab] = useState('accounts');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Kết nối tài khoản</h1>
        <p className="text-sm text-slate-500 mt-0.5">Quản lý kết nối các nền tảng quảng cáo và email</p>
      </div>

      <div className="inline-flex bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              tab === t.key ? 'bg-brand-500 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'accounts' ? <AccountsTab /> : <EmailTab />}
    </div>
  );
}

function AccountsTab() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => { loadAccounts(); }, []);

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const res = await accountsApi.list();
      setAccounts(res.data.accounts);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async (account) => {
    const t = toast.loading('Đang kiểm tra...');
    try {
      const res = await accountsApi.testExisting(account.id);
      if (res.data.success) {
        toast.success(res.data.message, { id: t });
      } else {
        toast.error(res.data.message || 'Test thất bại', { id: t });
      }
      await loadAccounts();
    } catch (err) {
      toast.error(err.message, { id: t });
    }
  };

  const handleDelete = async (account) => {
    if (!confirm(`Xóa tài khoản "${account.account_name}"?`)) return;
    try {
      await accountsApi.delete(account.id);
      toast.success('Đã xóa');
      await loadAccounts();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const groupedAccounts = PLATFORMS.reduce((acc, p) => {
    acc[p] = accounts.filter(a => a.platform === p);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn btn-primary">
          <Plus size={16} /> Thêm tài khoản
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">Đang tải...</div>
      ) : (
        <div className="space-y-5">
          {PLATFORMS.map(platform => (
            <div key={platform}>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: PLATFORM_COLORS[platform] }} />
                <h3 className="font-semibold text-slate-700">{PLATFORM_LABELS[platform]}</h3>
                <span className="text-xs text-slate-400">({groupedAccounts[platform].length})</span>
              </div>
              {groupedAccounts[platform].length === 0 ? (
                <div className="card p-6 text-center text-sm text-slate-400">
                  Chưa có tài khoản {PLATFORM_LABELS[platform]} nào
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {groupedAccounts[platform].map(account => (
                    <AccountCard
                      key={account.id}
                      account={account}
                      onTest={() => handleTest(account)}
                      onEdit={() => { setEditing(account); setShowForm(true); }}
                      onDelete={() => handleDelete(account)}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <AccountFormModal
          account={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); loadAccounts(); }}
        />
      )}
    </div>
  );
}

function AccountCard({ account, onTest, onEdit, onDelete }) {
  const statusInfo = {
    active: { class: 'badge-success', label: 'Đã kết nối', icon: CheckCircle, color: 'text-emerald-500' },
    error: { class: 'badge-error', label: 'Lỗi', icon: AlertCircle, color: 'text-red-500' },
    expiring: { class: 'badge-warning', label: 'Sắp hết hạn', icon: AlertCircle, color: 'text-amber-500' },
    disabled: { class: 'badge-info', label: 'Đã tắt', icon: AlertCircle, color: 'text-slate-400' },
  }[account.status] || { class: 'badge-info', label: account.status, icon: AlertCircle, color: 'text-slate-400' };

  const Icon = statusInfo.icon;

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-semibold text-slate-800 truncate">{account.account_name}</h4>
            <Icon size={14} className={statusInfo.color} />
          </div>
          <div className="text-xs text-slate-500 truncate">ID: {account.account_id}</div>
        </div>
        <span className={`badge ${statusInfo.class}`}>{statusInfo.label}</span>
      </div>

      {account.status_message && (
        <div className="text-xs text-red-500 bg-red-50 p-2 rounded mb-3 line-clamp-2">{account.status_message}</div>
      )}

      <div className="text-xs text-slate-400 mb-3">
        {account.last_sync_at ? `Đồng bộ ${timeAgo(account.last_sync_at)}` : 'Chưa đồng bộ'}
      </div>

      <div className="flex items-center gap-1.5">
        <button onClick={onTest} className="btn btn-outline btn-sm flex-1" title="Test kết nối">
          <RefreshCw size={12} /> Test
        </button>
        <button onClick={onEdit} className="btn btn-outline btn-sm" title="Sửa">
          <Edit size={12} />
        </button>
        <button onClick={onDelete} className="btn btn-danger btn-sm" title="Xóa">
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

function AccountFormModal({ account, onClose, onSaved }) {
  const [platform, setPlatform] = useState(account?.platform || 'google');
  const [accountName, setAccountName] = useState(account?.account_name || '');
  const [credentials, setCredentials] = useState({});
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const fields = PLATFORM_FIELDS[platform];
  const isFacebookBMMode = platform === 'facebook' && credentials.bm_id && !credentials.ad_account_id;

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await accountsApi.test(platform, credentials);
      if (res.data.success) {
        setTestResult({ success: true, message: res.data.message, data: res.data.data });
        toast.success('Kết nối thành công');
      } else {
        setTestResult({ success: false, message: res.data.message });
        toast.error(res.data.message);
      }
    } catch (err) {
      setTestResult({ success: false, message: err.message });
      toast.error(err.message);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!isFacebookBMMode && !accountName) return toast.error('Vui lòng nhập tên tài khoản');

    setSaving(true);
    try {
      if (account) {
        await accountsApi.update(account.id, {
          account_name: accountName,
          credentials: Object.keys(credentials).length > 0 ? credentials : undefined,
        });
        toast.success('Đã cập nhật');
      } else {
        await accountsApi.create({ platform, account_name: accountName, credentials });
        toast.success(isFacebookBMMode ? 'Đã thêm tài khoản Facebook từ BM' : 'Đã thêm tài khoản');
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white rounded-t-2xl z-10">
          <h2 className="text-lg font-semibold">{account ? 'Sửa tài khoản' : 'Thêm tài khoản mới'}</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-md"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {!account && (
            <div>
              <label className="label">Nền tảng</label>
              <div className="grid grid-cols-3 gap-2">
                {PLATFORMS.map(p => (
                  <button
                    key={p}
                    onClick={() => { setPlatform(p); setCredentials({}); setTestResult(null); }}
                    className={`p-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                      platform === p ? 'border-brand-500 bg-brand-50 text-brand-600' : 'border-slate-200 bg-white'
                    }`}
                  >
                    {PLATFORM_LABELS[p]}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="label">
              {isFacebookBMMode ? 'Nhãn Business Manager (không bắt buộc)' : 'Tên hiển thị *'}
            </label>
            <input
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              className="input"
              placeholder={isFacebookBMMode ? 'VD: BM Công ty A (tự đặt tên nếu để trống)' : 'VD: Tài khoản công ty A'}
            />
          </div>

          <div className="border-t border-slate-100 pt-4">
            <div className="text-sm font-semibold text-slate-700 mb-3">Thông tin kết nối</div>
            {platform === 'facebook' && (
              <div className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded p-2 mb-3">
                Nhập <strong>Access Token</strong> và <strong>Business Manager ID</strong> — hệ thống sẽ tự động tìm và thêm tất cả tài khoản ads bạn có quyền truy cập.
              </div>
            )}
            <div className="space-y-3">
              {fields.map(field => (
                <div key={field.key}>
                  <label className="label">
                    {field.label}
                    {field.optional && <span className="text-slate-400 font-normal"> (không bắt buộc)</span>}
                  </label>
                  <input
                    type={field.type}
                    value={credentials[field.key] || ''}
                    onChange={(e) => setCredentials({ ...credentials, [field.key]: e.target.value })}
                    className="input font-mono text-xs"
                    placeholder={account ? '••••••••' : ''}
                  />
                  {field.help && <div className="text-[11px] text-slate-400 mt-1">{field.help}</div>}
                </div>
              ))}
            </div>
          </div>

          {testResult && (
            <div className={`p-3 rounded-lg text-sm ${testResult.success ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
              <div className="font-medium mb-1">{testResult.success ? '✅ Kết nối thành công' : '❌ Kết nối thất bại'}</div>
              <div className="text-xs">{testResult.message}</div>
              {testResult.data?.accounts && (
                <div className="text-xs mt-2 space-y-1">
                  <div className="font-medium">Tài khoản tìm thấy ({testResult.data.accountsFound}):</div>
                  {testResult.data.accounts.map(a => (
                    <div key={a.id} className="flex gap-2">
                      <span className="font-mono text-slate-600">{a.id}</span>
                      <span>{a.name}</span>
                      <span className="text-slate-400">{a.currency}</span>
                    </div>
                  ))}
                </div>
              )}
              {testResult.data && !testResult.data.accounts && (
                <div className="text-xs mt-2 space-y-0.5">
                  {Object.entries(testResult.data).map(([k, v]) => (
                    <div key={k}><span className="text-slate-500">{k}:</span> <span className="font-mono">{String(v)}</span></div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-5 border-t border-slate-100 flex justify-between gap-2 sticky bottom-0 bg-white rounded-b-2xl">
          <button onClick={handleTest} disabled={testing} className="btn btn-outline">
            <RefreshCw size={14} className={testing ? 'animate-spin' : ''} /> Test kết nối
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn btn-outline">Hủy</button>
            <button onClick={handleSave} disabled={saving} className="btn btn-primary">
              {saving ? 'Đang lưu...' : (account ? 'Cập nhật' : (isFacebookBMMode ? 'Thêm tất cả tài khoản' : 'Thêm'))}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmailTab() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [testing, setTesting] = useState(false);

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await settingsApi.get();
      setSettings(res.data.settings);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await settingsApi.update(settings);
      toast.success('Đã lưu cài đặt');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async () => {
    if (!testEmail) return toast.error('Vui lòng nhập email');
    setTesting(true);
    const t = toast.loading('Đang gửi email test...');
    try {
      await settingsApi.testEmail(testEmail);
      toast.success('Đã gửi email test, hãy kiểm tra hòm thư', { id: t });
    } catch (err) {
      toast.error(err.message, { id: t });
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <div className="text-center py-12 text-slate-400">Đang tải...</div>;
  if (!settings) return <div className="text-center py-12 text-slate-400">Không tải được cài đặt</div>;

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h3 className="font-semibold text-slate-700 mb-4 flex items-center gap-2">
          <Mail size={16} /> Email nhận thông báo
        </h3>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="label">Email chính *</label>
            <input
              type="email"
              value={settings.email_primary || ''}
              onChange={(e) => setSettings({ ...settings, email_primary: e.target.value })}
              className="input"
              placeholder="admin@example.com"
            />
          </div>
          <div>
            <label className="label">Email phụ (không bắt buộc)</label>
            <input
              type="email"
              value={settings.email_secondary || ''}
              onChange={(e) => setSettings({ ...settings, email_secondary: e.target.value })}
              className="input"
              placeholder="backup@example.com"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
          <input
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            className="input flex-1"
            placeholder="Nhập email để test gửi"
          />
          <button onClick={handleTestEmail} disabled={testing} className="btn btn-outline">
            <Send size={14} /> {testing ? 'Đang gửi...' : 'Gửi email thử'}
          </button>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="font-semibold text-slate-700 mb-4">Loại thông báo</h3>
        <div className="space-y-3">
          <label className="flex items-center justify-between p-3 bg-slate-50 rounded-lg cursor-pointer">
            <div>
              <div className="text-sm font-medium">Báo cáo sáng hằng ngày</div>
              <div className="text-xs text-slate-500">Tổng hợp hiệu suất các tài khoản gửi vào buổi sáng</div>
            </div>
            <input type="checkbox" checked={settings.daily_report_enabled !== false} onChange={(e) => setSettings({ ...settings, daily_report_enabled: e.target.checked })} className="w-4 h-4" />
          </label>
          <label className="flex items-center justify-between p-3 bg-slate-50 rounded-lg cursor-pointer">
            <div>
              <div className="text-sm font-medium">Thông báo khi Rule kích hoạt</div>
              <div className="text-xs text-slate-500">Gửi email mỗi khi rule trigger thực thi</div>
            </div>
            <input type="checkbox" checked={settings.rule_notification_enabled !== false} onChange={(e) => setSettings({ ...settings, rule_notification_enabled: e.target.checked })} className="w-4 h-4" />
          </label>
          <label className="flex items-center justify-between p-3 bg-slate-50 rounded-lg cursor-pointer">
            <div>
              <div className="text-sm font-medium">Cảnh báo Token sắp hết hạn</div>
              <div className="text-xs text-slate-500">Báo trước 7 ngày khi token API sắp hết</div>
            </div>
            <input type="checkbox" checked={settings.token_expiry_alert_enabled !== false} onChange={(e) => setSettings({ ...settings, token_expiry_alert_enabled: e.target.checked })} className="w-4 h-4" />
          </label>
          <label className="flex items-center justify-between p-3 bg-slate-50 rounded-lg cursor-pointer">
            <div>
              <div className="text-sm font-medium">Cảnh báo lỗi đồng bộ</div>
              <div className="text-xs text-slate-500">Gửi ngay khi không đồng bộ được tài khoản nào đó</div>
            </div>
            <input type="checkbox" checked={settings.sync_error_alert_enabled === true} onChange={(e) => setSettings({ ...settings, sync_error_alert_enabled: e.target.checked })} className="w-4 h-4" />
          </label>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="font-semibold text-slate-700 mb-4">Cấu hình thời gian</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Giờ gửi báo cáo sáng</label>
            <input
              type="time"
              value={(settings.daily_report_time || '07:00').slice(0, 5)}
              onChange={(e) => setSettings({ ...settings, daily_report_time: e.target.value + ':00' })}
              className="input"
            />
            <div className="text-[11px] text-slate-400 mt-1">Múi giờ Việt Nam (Asia/Ho_Chi_Minh)</div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving} className="btn btn-primary">
          {saving ? 'Đang lưu...' : 'Lưu cài đặt'}
        </button>
      </div>
    </div>
  );
}
