import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Lock, User, ArrowRight, Eye, EyeOff, Flame, ShieldCheck, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import './LoginPage.css';
import phoenixArtwork from '../assets/phoenix-3d.webp';

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (user) return <Navigate to="/campaigns" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    if (!username.trim() || !password) {
      setError('Vui lòng nhập đầy đủ thông tin');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await login(username.trim(), password);
      toast.success('Đăng nhập thành công');
      navigate('/campaigns', { replace: true });
    } catch (err) {
      setError(err.message || 'Đăng nhập thất bại. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fire-login">
      <header className="fire-login-header">
        <div className="fire-logo"><span className="fire-logo-mark"><Flame size={27} strokeWidth={1.8} /></span><span>Ads<span className="fire-logo-accent">Pro</span></span></div>
        <span className="fire-header-caption">Quản lý quảng cáo tập trung</span>
      </header>

      <main className="fire-login-main">
        <section className="fire-login-story" aria-label="AdsPro — Độc quyền bởi Ngọc Giang">
          <img className="login-phoenix" src={phoenixArtwork} alt="" aria-hidden="true" width="1536" height="1024" fetchPriority="high" />
          <div className="fire-story-copy">
            <h1>BỨT PHÁ<br /><span>HIỆU SUẤT.</span></h1>
            <p>Kiểm soát chiến dịch.<br className="fire-mobile-break" /> Làm chủ tăng trưởng.</p>
            <div className="fire-owner"><span className="fire-owner-caption">ĐỘC QUYỀN BỞI</span><strong>NGỌC GIANG<span className="fire-owner-dot">.</span></strong></div>
          </div>
        </section>

        <section className="fire-login-card" aria-labelledby="login-heading">
          <div className="fire-card-brand"><Flame size={24} aria-hidden="true" /> AdsPro</div>
          <h2 id="login-heading">Chào mừng<br /> trở lại<span>.</span></h2>
          <p className="fire-card-description">Đăng nhập để quản lý quảng cáo của bạn.</p>

          <form onSubmit={handleSubmit} className="fire-login-form">
            <div>
              <label htmlFor="login-username">Tên đăng nhập</label>
              <div className="fire-input-wrap"><User size={18} aria-hidden="true" /><input id="login-username" name="username" type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Nhập tên đăng nhập" autoComplete="username" required disabled={loading} /></div>
            </div>
            <div>
              <label htmlFor="login-password">Mật khẩu</label>
              <div className="fire-input-wrap"><Lock size={18} aria-hidden="true" /><input id="login-password" name="password" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Nhập mật khẩu của bạn" autoComplete="current-password" required disabled={loading} aria-describedby={error ? 'login-error' : undefined} /><button className="fire-password-toggle" type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={showPassword} disabled={loading}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
            </div>
            {error && <p id="login-error" className="fire-login-error" role="alert">{error}</p>}
            <button type="submit" className="fire-submit" disabled={loading}>{loading ? <><Loader2 className="fire-spinner" size={19} /> Đang đăng nhập...</> : <>Đăng nhập <ArrowRight size={20} aria-hidden="true" /></>}</button>
          </form>
          <div className="fire-card-security"><ShieldCheck size={16} aria-hidden="true" /><span>Không gian quản trị riêng tư</span></div>
          <div className="fire-card-signature"><span>Độc quyền bởi</span><strong>NGỌC GIANG</strong></div>
        </section>
      </main>
      <footer className="fire-login-footer"><span>© {new Date().getFullYear()} AdsPro</span><span>GOOGLE · FACEBOOK · TIKTOK</span><span>Được tạo nên để bứt phá <Flame size={13} aria-hidden="true" /></span></footer>
    </div>
  );
}
