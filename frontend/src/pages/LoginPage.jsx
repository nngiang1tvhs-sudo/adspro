import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Lock, User, ArrowUpRight, ArrowRight, Eye, EyeOff, Flame, ShieldCheck, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import './LoginPage.css';

function PhoenixArtwork() {
  return (
    <svg className="login-phoenix" viewBox="0 0 700 660" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="phoenix-fire" x1="100" y1="100" x2="490" y2="610" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFDB78" /><stop offset=".35" stopColor="#FF8A1E" /><stop offset=".7" stopColor="#F43C13" /><stop offset="1" stopColor="#6D160D" />
        </linearGradient>
        <linearGradient id="phoenix-edge" x1="160" y1="80" x2="540" y2="450" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFF0BB" /><stop offset=".4" stopColor="#FFAE3B" /><stop offset="1" stopColor="#F45114" />
        </linearGradient>
        <radialGradient id="phoenix-aura"><stop stopColor="#F95512" stopOpacity=".35" /><stop offset="1" stopColor="#F95512" stopOpacity="0" /></radialGradient>
      </defs>
      <circle cx="320" cy="330" r="315" fill="url(#phoenix-aura)" />
      <g fill="url(#phoenix-fire)" stroke="url(#phoenix-edge)" strokeWidth="1.2" strokeLinejoin="round">
        <path d="M403 319 107 68 165 264 355 373Z" /><path d="M362 348 34 187 154 360 318 413Z" />
        <path d="M334 390 38 327 197 456 310 449Z" /><path d="M314 434 123 466 214 517 323 467Z" />
        <path d="M387 333 296 114 427 264 467 300Z" /><path d="M430 290 388 148 504 272 487 315Z" />
        <path d="M484 271 526 229 555 243 584 282 553 271 532 302 504 333 463 391 410 489 329 556 221 600 302 514 346 434 364 360 409 318Z" />
        <path d="M448 369 460 465 402 550 303 610 373 511 393 429Z" />
        <path d="M400 455 332 572 181 640 255 569 304 497Z" />
      </g>
      <g stroke="#FFE8A5" strokeOpacity=".65" strokeWidth="1.1">
        <path d="m107 68 248 305M34 187l284 226M38 327l272 122M296 114l131 150M388 148l116 124M526 229l-63 162M393 429l-90 181" />
      </g>
      <path d="m530 260 13 1-8 5Z" fill="#FFF4BF" />
      <g fill="#FFA43B"><circle cx="168" cy="113" r="2" /><circle cx="581" cy="352" r="2.5" /><circle cx="139" cy="434" r="2" /><circle cx="468" cy="554" r="1.5" /><circle cx="314" cy="84" r="1.5" /><path d="m95 293 3-11 2 8ZM553 170l5-15-1 12ZM501 494l3-13 1 9Z" /></g>
    </svg>
  );
}

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
      <div className="login-ambient login-ambient-one" aria-hidden="true" />
      <div className="login-ambient login-ambient-two" aria-hidden="true" />
      <header className="fire-login-header">
        <div className="fire-logo"><span className="fire-logo-mark"><Flame size={27} strokeWidth={1.8} /></span><span>Ads<span className="fire-logo-accent">Pro</span></span></div>
        <span className="fire-header-caption"><span /> KHÔNG GIAN QUẢN TRỊ</span>
      </header>

      <main className="fire-login-main">
        <section className="fire-login-story" aria-label="AdsPro — Độc quyền bởi Ngọc Giang">
          <PhoenixArtwork />
          <div className="fire-story-copy">
            <span className="fire-eyebrow"><span /> IGNITE YOUR PERFORMANCE</span>
            <h1>BỨT PHÁ<br /><span>HIỆU SUẤT.</span></h1>
            <p>Kiểm soát chiến dịch.<br className="fire-mobile-break" /> Làm chủ tăng trưởng.</p>
            <div className="fire-owner"><span className="fire-owner-caption">ĐỘC QUYỀN BỞI</span><strong>NGỌC GIANG<span className="fire-owner-dot">.</span></strong></div>
          </div>
        </section>

        <section className="fire-login-card" aria-labelledby="login-heading">
          <div className="fire-card-top"><span className="fire-card-icon"><Flame size={21} /></span><ArrowUpRight size={21} aria-hidden="true" /></div>
          <div className="fire-card-eyebrow">TRUNG TÂM ĐIỀU HÀNH</div>
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
