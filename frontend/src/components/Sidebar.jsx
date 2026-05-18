import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Megaphone, Settings2, History, Link2, LogOut, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { campaignsApi } from '../services/api';
import { useState } from 'react';

const NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/campaigns', icon: Megaphone, label: 'Chiến dịch' },
  { to: '/rules', icon: Settings2, label: 'Quản lý Rule' },
  { to: '/history', icon: History, label: 'Lịch sử' },
  { to: '/connect', icon: Link2, label: 'Kết nối tài khoản' },
  { to: '/settings', icon: SlidersHorizontal, label: 'Cài đặt' },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [syncing, setSyncing] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
    toast.success('Đã đăng xuất');
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await campaignsApi.sync();
      toast.success(res.message || 'Đã đồng bộ');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <aside className="w-60 bg-white border-r border-slate-200 flex flex-col h-screen sticky top-0">
      <div className="px-6 py-5 border-b border-slate-100">
        <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">
          AdsPro
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">Quản lý ads tập trung</p>
      </div>

      <div className="px-3 pt-3">
        <button
          onClick={handleSync}
          disabled={syncing}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Đang đồng bộ...' : 'Đồng bộ ngay'}
        </button>
      </div>

      <nav className="flex-1 px-3 py-3 flex flex-col gap-0.5">
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-brand-500 text-white font-medium shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`
            }
          >
            <item.icon size={18} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-slate-100">
        <div className="flex items-center gap-3 px-2">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-white flex items-center justify-center text-sm font-medium">
            {user?.username?.charAt(0).toUpperCase() || 'A'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-slate-700 truncate">{user?.fullName || user?.username}</div>
            <div className="text-xs text-slate-400 truncate">{user?.email || 'admin'}</div>
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
            title="Đăng xuất"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
