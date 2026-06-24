import { useState, useEffect } from 'react';
import { settingsApi } from '../services/api';
import toast from 'react-hot-toast';
import { Mail, Bell, Clock, Send, FileText, CheckCircle, AlertCircle } from 'lucide-react';

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
        checked ? 'bg-indigo-500' : 'bg-slate-200'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function SettingRow({ title, description, checked, onChange }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
      <div className="pr-4">
        <div className="text-sm font-medium text-slate-700">{title}</div>
        <div className="text-xs text-slate-400 mt-0.5">{description}</div>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [testing, setTesting] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await settingsApi.get();
      setSettings(res.data.settings);
      setTestEmail(res.data.settings?.email_primary || '');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings.email_primary) return toast.error('Vui lòng nhập email chính');
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
      toast.success('Đã gửi! Kiểm tra hộp thư của bạn', { id: t });
    } catch (err) {
      toast.error(err.message, { id: t });
    } finally {
      setTesting(false);
    }
  };

  const handleSendReport = async () => {
    if (!settings?.email_primary) return toast.error('Vui lòng lưu email chính trước');
    setSending(true);
    const t = toast.loading('Đang gửi báo cáo...');
    try {
      const res = await settingsApi.sendReport();
      toast.success(res.message || 'Đã gửi báo cáo thành công!', { id: t });
    } catch (err) {
      toast.error(err.message || 'Gửi báo cáo thất bại', { id: t });
    } finally {
      setSending(false);
    }
  };

  const update = (field, value) => setSettings(prev => ({ ...prev, [field]: value }));

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-slate-400">Đang tải...</div>;
  }

  if (!settings) {
    return <div className="flex items-center justify-center py-20 text-slate-400">Không tải được cài đặt</div>;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Cài đặt</h1>
        <p className="text-sm text-slate-500 mt-0.5">Quản lý email nhận thông báo và báo cáo tự động</p>
      </div>

      {/* Email nhận thông báo */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-2 text-slate-700 font-semibold">
          <Mail size={16} />
          <span>Email nhận thông báo</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Email chính *</label>
            <input
              type="email"
              value={settings.email_primary || ''}
              onChange={e => update('email_primary', e.target.value)}
              className="input"
              placeholder="your@email.com"
            />
          </div>
          <div>
            <label className="label">Email phụ <span className="text-slate-400 font-normal">(không bắt buộc)</span></label>
            <input
              type="email"
              value={settings.email_secondary || ''}
              onChange={e => update('email_secondary', e.target.value)}
              className="input"
              placeholder="backup@email.com"
            />
          </div>
        </div>

        <div className="bg-slate-50 rounded-lg p-3">
          <div className="text-xs font-medium text-slate-500 mb-2">Gửi email thử để kiểm tra kết nối</div>
          <div className="flex gap-2">
            <input
              type="email"
              value={testEmail}
              onChange={e => setTestEmail(e.target.value)}
              className="input flex-1 text-sm"
              placeholder="Nhập email nhận test"
            />
            <button
              onClick={handleTestEmail}
              disabled={testing}
              className="btn btn-outline whitespace-nowrap"
            >
              <Send size={14} />
              {testing ? 'Đang gửi...' : 'Gửi test'}
            </button>
          </div>
        </div>
      </div>

      {/* Cài đặt thông báo */}
      <div className="card p-5">
        <div className="flex items-center gap-2 text-slate-700 font-semibold mb-1">
          <Bell size={16} />
          <span>Loại thông báo</span>
        </div>
        <p className="text-xs text-slate-400 mb-4">Chọn những thông báo bạn muốn nhận qua email</p>

        <SettingRow
          title="Báo cáo sáng hằng ngày"
          description="Tổng hợp chi tiêu & hiệu suất tất cả tài khoản gửi vào buổi sáng"
          checked={settings.daily_report_enabled !== false}
          onChange={v => update('daily_report_enabled', v)}
        />
        <SettingRow
          title="Thông báo khi Rule kích hoạt"
          description="Gửi email mỗi khi một rule tự động được thực thi"
          checked={settings.rule_notification_enabled !== false}
          onChange={v => update('rule_notification_enabled', v)}
        />
        <SettingRow
          title="Cảnh báo Token sắp hết hạn"
          description="Nhắc nhở trước 7 ngày khi access token API sắp hết hạn"
          checked={settings.token_expiry_alert_enabled !== false}
          onChange={v => update('token_expiry_alert_enabled', v)}
        />
        <SettingRow
          title="Cảnh báo lỗi đồng bộ"
          description="Gửi ngay khi hệ thống không đồng bộ được dữ liệu từ tài khoản"
          checked={settings.sync_error_alert_enabled !== false}
          onChange={v => update('sync_error_alert_enabled', v)}
        />
      </div>

      {/* Thời gian */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center gap-2 text-slate-700 font-semibold">
          <Clock size={16} />
          <span>Thời gian gửi báo cáo</span>
        </div>

        <div className="max-w-xs">
          <label className="label">Giờ gửi báo cáo sáng</label>
          <input
            type="time"
            value={(settings.daily_report_time || '07:00').slice(0, 5)}
            onChange={e => update('daily_report_time', e.target.value + ':00')}
            className="input"
          />
          <div className="text-[11px] text-slate-400 mt-1">Múi giờ Việt Nam (GMT+7)</div>
        </div>
      </div>

      {/* Gửi báo cáo thủ công */}
      <div className="card p-5">
        <div className="flex items-center gap-2 text-slate-700 font-semibold mb-1">
          <FileText size={16} />
          <span>Gửi báo cáo thủ công</span>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Gửi ngay báo cáo tổng hợp chi tiêu hôm qua của tất cả tài khoản đến email chính.
          Không cần chờ đến giờ tự động.
        </p>

        <div className="flex items-center justify-between bg-indigo-50 border border-indigo-100 rounded-lg p-4">
          <div>
            <div className="text-sm font-medium text-indigo-800">Gửi báo cáo ngay bây giờ</div>
            <div className="text-xs text-indigo-500 mt-0.5">
              Gửi đến: <span className="font-medium">{settings.email_primary || '(chưa cài email)'}</span>
              {settings.email_secondary && `, ${settings.email_secondary}`}
            </div>
          </div>
          <button
            onClick={handleSendReport}
            disabled={sending || !settings.email_primary}
            className="btn btn-primary whitespace-nowrap"
          >
            <Send size={14} />
            {sending ? 'Đang gửi...' : 'Gửi báo cáo'}
          </button>
        </div>

        {!settings.email_primary && (
          <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 rounded-lg p-3 mt-3">
            <AlertCircle size={14} />
            Vui lòng nhập và lưu email chính trước khi gửi báo cáo
          </div>
        )}
      </div>

      {/* Lưu */}
      <div className="flex justify-end pb-6">
        <button onClick={handleSave} disabled={saving} className="btn btn-primary px-6">
          {saving ? 'Đang lưu...' : 'Lưu cài đặt'}
        </button>
      </div>
    </div>
  );
}
