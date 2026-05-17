import { useState, useEffect } from 'react';
import PlatformTabs from '../components/PlatformTabs';
import DateRangePicker from '../components/DateRangePicker';
import StatCard from '../components/StatCard';
import DualAxisChart from '../components/DualAxisChart';
import { dashboardApi } from '../services/api';
import { formatCurrency, formatNumber, DATE_PRESETS, timeAgo } from '../utils/helpers';
import toast from 'react-hot-toast';
import { Play, Pause, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';

const RESULT_LABELS = {
  google: { 'TrueView': 'TrueView' },
  facebook: {
    'Mess': 'Tin nhắn',
    'Đơn hàng': 'Đơn hàng',
    'Lượt thích trang': 'Lượt thích trang',
    'Tương tác bài viết': 'Tương tác',
    'Video 2s': 'Video 2s',
  },
  tiktok: {
    'Lượt xem': 'Lượt xem',
    'Follow': 'Follow',
    'Đơn hàng': 'Đơn hàng',
  },
};

const COST_LABELS = {
  google: { 'TrueView': 'CPV' },
  facebook: {
    'Mess': 'CP/KQ',
    'Đơn hàng': 'CPA',
    'Lượt thích trang': 'CP/KQ',
    'Tương tác bài viết': 'CP/KQ',
    'Video 2s': 'CPV',
  },
  tiktok: {
    'Lượt xem': 'CPV',
    'Follow': 'CPF',
    'Đơn hàng': 'CPA',
  },
};

const CHART_COLORS = {
  'TrueView': '#D97706',
  'Mess': '#7C3AED',
  'Đơn hàng': '#16A34A',
  'Lượt thích trang': '#2563EB',
  'Tương tác bài viết': '#F59E0B',
  'Video 2s': '#EC4899',
  'Lượt xem': '#D97706',
  'Follow': '#7C3AED',
};

export default function DashboardPage() {
  const [platform, setPlatform] = useState('google');
  const [dateRange, setDateRange] = useState(DATE_PRESETS[4].getValue());
  const [accountId, setAccountId] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hidden, setHidden] = useState({});

  useEffect(() => {
    loadAccounts();
  }, [platform]);

  useEffect(() => {
    loadData();
  }, [platform, dateRange, accountId]);

  const loadAccounts = async () => {
    try {
      const res = await dashboardApi.getAccounts(platform);
      setAccounts(res.data.accounts);
    } catch (err) {
      console.error(err);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const params = {
        date_from: dateRange.from,
        date_to: dateRange.to,
      };
      if (accountId) params.account_id = accountId;

      const res = await dashboardApi.get(platform, params);
      setData(res.data);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const objectives = (data?.objectives || []).slice().sort((a, b) => {
    const aHas = (a.spend || 0) > 0 || (a.active_campaigns || 0) > 0 ? 1 : 0;
    const bHas = (b.spend || 0) > 0 || (b.active_campaigns || 0) > 0 ? 1 : 0;
    if (bHas !== aHas) return bHas - aHas;
    return (b.spend || 0) - (a.spend || 0);
  });
  const charts = data?.charts || {};

  // Currency: ưu tiên theo account đã chọn, fallback từ API, fallback VND
  const selectedAccount = accounts.find(a => String(a.id) === String(accountId));
  const currency = selectedAccount?.currency || data?.currency || 'VND';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">Tổng quan hiệu suất quảng cáo</p>
        </div>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <PlatformTabs value={platform} onChange={setPlatform} />
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="bg-white border border-slate-200 px-3 py-2 rounded-lg text-sm text-slate-700 outline-none focus:border-brand-500 min-w-[180px]"
        >
          <option value="">Tất cả tài khoản</option>
          {accounts.map(a => (
            <option key={a.id} value={a.id}>{a.account_name}</option>
          ))}
        </select>
      </div>

      {loading && !data && (
        <div className="text-center py-20 text-slate-400">Đang tải dữ liệu...</div>
      )}

      {data && objectives.length === 0 && (
        <div className="card p-12 text-center">
          <div className="text-slate-400 text-sm mb-2">Chưa có dữ liệu</div>
          <div className="text-xs text-slate-300">Hãy kết nối tài khoản và đồng bộ data trước</div>
        </div>
      )}

      {/* Objective sections */}
      {objectives.map(obj => {
        const isHidden = hidden[obj.objective];
        const resultLabel = RESULT_LABELS[platform]?.[obj.objective] || obj.objective;
        const costLabel = COST_LABELS[platform]?.[obj.objective] || 'CP/KQ';
        const chartColor = CHART_COLORS[obj.objective] || '#7C3AED';
        const chartData = charts[obj.objective] || [];

        return (
          <div key={obj.objective} className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h2 className="text-base font-semibold text-slate-700">{obj.objective}</h2>
              {platform === 'tiktok' && obj.objective === 'Đơn hàng' && (
                <button
                  onClick={() => setHidden({ ...hidden, [obj.objective]: !isHidden })}
                  className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
                >
                  {isHidden ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                  {isHidden ? 'Hiện' : 'Ẩn'}
                </button>
              )}
            </div>

            {!isHidden && (
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-3">
                <div className="card p-4">
                  <div className="text-xs text-slate-500 mb-3">
                    Chi tiêu (xanh) + {resultLabel} (cam)
                  </div>
                  {chartData.length > 0 ? (
                    <DualAxisChart
                      data={chartData}
                      leftLabel="Chi tiêu"
                      rightLabel={resultLabel}
                      leftColor="#2563EB"
                      rightColor={chartColor}
                    />
                  ) : (
                    <div className="h-64 flex items-center justify-center text-slate-300 text-sm">
                      Chưa có dữ liệu trong khoảng thời gian này
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
                  <StatCard label="Chi tiêu" value={formatCurrency(obj.spend, obj.currency || currency)} size="small" />
                  <StatCard label="Camp đang chạy" value={obj.active_campaigns} size="small" />
                  <StatCard label={resultLabel} value={formatNumber(obj.results)} color="blue" size="small" />
                  <StatCard label={costLabel} value={formatCurrency(obj.cost_per_result, obj.currency || currency)} color="blue" size="small" />
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Recent rules */}
      {data?.recentRules && data.recentRules.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-500" /> Lịch sử Rules gần đây
          </h3>
          <div className="space-y-2">
            {data.recentRules.map(r => (
              <div
                key={r.id}
                className={`flex items-center justify-between p-2.5 rounded-lg text-sm ${
                  r.status === 'success'
                    ? 'bg-emerald-50 text-emerald-800'
                    : r.status === 'failed'
                    ? 'bg-red-50 text-red-800'
                    : 'bg-amber-50 text-amber-800'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{r.rule_name}</span>
                  {r.target_name && <span className="text-slate-500"> → {r.target_name}</span>}
                </div>
                <div className="text-xs text-slate-500 ml-3">{timeAgo(r.executed_at)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
