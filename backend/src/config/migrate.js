const { pool } = require('./database');
require('dotenv').config();

const SCHEMA = `
-- Bật extension uuid
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Bảng người dùng (admin)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  full_name VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP
);

-- Bảng tài khoản quảng cáo đã kết nối
CREATE TABLE IF NOT EXISTS ad_accounts (
  id SERIAL PRIMARY KEY,
  uuid UUID DEFAULT uuid_generate_v4() UNIQUE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  platform VARCHAR(20) NOT NULL CHECK (platform IN ('google', 'facebook', 'tiktok')),
  account_name VARCHAR(255) NOT NULL,
  account_id VARCHAR(255) NOT NULL,
  credentials JSONB NOT NULL,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'error', 'expiring', 'disabled')),
  status_message TEXT,
  last_sync_at TIMESTAMP,
  token_expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(platform, account_id)
);

CREATE INDEX IF NOT EXISTS idx_ad_accounts_user ON ad_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_ad_accounts_platform ON ad_accounts(platform);
CREATE INDEX IF NOT EXISTS idx_ad_accounts_status ON ad_accounts(status);

-- Bảng chiến dịch
CREATE TABLE IF NOT EXISTS campaigns (
  id SERIAL PRIMARY KEY,
  account_id INTEGER REFERENCES ad_accounts(id) ON DELETE CASCADE,
  platform VARCHAR(20) NOT NULL,
  external_id VARCHAR(255) NOT NULL,
  name VARCHAR(500) NOT NULL,
  status VARCHAR(50),
  objective VARCHAR(100),
  budget DECIMAL(15,2),
  budget_type VARCHAR(20),
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  metrics JSONB DEFAULT '{}',
  raw_data JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(account_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_campaigns_account ON campaigns(account_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_objective ON campaigns(objective);

-- Bảng nhóm quảng cáo
CREATE TABLE IF NOT EXISTS ad_groups (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
  account_id INTEGER REFERENCES ad_accounts(id) ON DELETE CASCADE,
  external_id VARCHAR(255) NOT NULL,
  name VARCHAR(500) NOT NULL,
  status VARCHAR(50),
  bid_strategy VARCHAR(100),
  target_cpv DECIMAL(15,2),
  target_cpm DECIMAL(15,2),
  target_cpa DECIMAL(15,2),
  bid_amount DECIMAL(15,2),
  budget DECIMAL(15,2),
  metrics JSONB DEFAULT '{}',
  raw_data JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(campaign_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_ad_groups_campaign ON ad_groups(campaign_id);

-- Bảng quảng cáo
CREATE TABLE IF NOT EXISTS ads (
  id SERIAL PRIMARY KEY,
  ad_group_id INTEGER REFERENCES ad_groups(id) ON DELETE CASCADE,
  campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
  account_id INTEGER REFERENCES ad_accounts(id) ON DELETE CASCADE,
  external_id VARCHAR(255) NOT NULL,
  name VARCHAR(500),
  status VARCHAR(50),
  ad_type VARCHAR(50),
  headline TEXT,
  description TEXT,
  video_url TEXT,
  image_url TEXT,
  landing_url TEXT,
  metrics JSONB DEFAULT '{}',
  raw_data JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(ad_group_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_ads_ad_group ON ads(ad_group_id);

-- Bảng số liệu hằng ngày (cho biểu đồ và báo cáo)
CREATE TABLE IF NOT EXISTS daily_metrics (
  id SERIAL PRIMARY KEY,
  account_id INTEGER REFERENCES ad_accounts(id) ON DELETE CASCADE,
  campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
  ad_group_id INTEGER REFERENCES ad_groups(id) ON DELETE CASCADE,
  ad_id INTEGER REFERENCES ads(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  hour SMALLINT,
  spend DECIMAL(15,2) DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  ctr DECIMAL(8,4) DEFAULT 0,
  cpc DECIMAL(15,2) DEFAULT 0,
  cpm DECIMAL(15,2) DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  cpa DECIMAL(15,2) DEFAULT 0,
  revenue DECIMAL(15,2) DEFAULT 0,
  roas DECIMAL(8,4) DEFAULT 0,
  video_views INTEGER DEFAULT 0,
  cpv DECIMAL(15,2) DEFAULT 0,
  engagements INTEGER DEFAULT 0,
  follows INTEGER DEFAULT 0,
  messages INTEGER DEFAULT 0,
  raw_metrics JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_metrics_date ON daily_metrics(date);
CREATE INDEX IF NOT EXISTS idx_metrics_campaign_date ON daily_metrics(campaign_id, date);
CREATE INDEX IF NOT EXISTS idx_metrics_account_date ON daily_metrics(account_id, date);

-- Bảng Rules tự động hóa
CREATE TABLE IF NOT EXISTS rules (
  id SERIAL PRIMARY KEY,
  uuid UUID DEFAULT uuid_generate_v4() UNIQUE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  platform VARCHAR(20) NOT NULL,
  account_id INTEGER REFERENCES ad_accounts(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  scope VARCHAR(20) NOT NULL CHECK (scope IN ('campaign', 'ad_group', 'ad')),
  conditions JSONB NOT NULL DEFAULT '[]',
  conditions_logic VARCHAR(10) DEFAULT 'AND',
  actions JSONB NOT NULL DEFAULT '[]',
  cooldown_minutes INTEGER DEFAULT 60,
  is_active BOOLEAN DEFAULT TRUE,
  email_notify BOOLEAN DEFAULT TRUE,
  last_run_at TIMESTAMP,
  last_triggered_at TIMESTAMP,
  total_runs INTEGER DEFAULT 0,
  total_triggers INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rules_user ON rules(user_id);
CREATE INDEX IF NOT EXISTS idx_rules_platform ON rules(platform);
CREATE INDEX IF NOT EXISTS idx_rules_active ON rules(is_active);

-- Bảng lịch sử thực thi Rule
CREATE TABLE IF NOT EXISTS rule_history (
  id SERIAL PRIMARY KEY,
  rule_id INTEGER REFERENCES rules(id) ON DELETE CASCADE,
  account_id INTEGER REFERENCES ad_accounts(id) ON DELETE SET NULL,
  target_type VARCHAR(20),
  target_id VARCHAR(255),
  target_name VARCHAR(500),
  status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed', 'skipped', 'warning')),
  message TEXT,
  conditions_evaluated JSONB,
  actions_taken JSONB,
  executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rule_history_rule ON rule_history(rule_id);
CREATE INDEX IF NOT EXISTS idx_rule_history_executed ON rule_history(executed_at DESC);

-- Bảng Audit Log (lịch sử hệ thống)
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  account_id INTEGER REFERENCES ad_accounts(id) ON DELETE SET NULL,
  event_type VARCHAR(50) NOT NULL,
  level VARCHAR(20) NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'success', 'warning', 'error')),
  message TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  ip_address VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event ON audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_level ON audit_logs(level);

-- Bảng Lịch sử đồng bộ
CREATE TABLE IF NOT EXISTS sync_logs (
  id SERIAL PRIMARY KEY,
  account_id INTEGER REFERENCES ad_accounts(id) ON DELETE CASCADE,
  platform VARCHAR(20),
  sync_type VARCHAR(50),
  status VARCHAR(20) CHECK (status IN ('success', 'failed', 'partial')),
  campaigns_synced INTEGER DEFAULT 0,
  ad_groups_synced INTEGER DEFAULT 0,
  ads_synced INTEGER DEFAULT 0,
  duration_ms INTEGER,
  error_message TEXT,
  details JSONB DEFAULT '{}',
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_account ON sync_logs(account_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_started ON sync_logs(started_at DESC);

-- Bảng Cài đặt người dùng (email, etc)
CREATE TABLE IF NOT EXISTS user_settings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  email_primary VARCHAR(255),
  email_secondary VARCHAR(255),
  daily_report_enabled BOOLEAN DEFAULT TRUE,
  daily_report_time TIME DEFAULT '07:00:00',
  weekly_report_enabled BOOLEAN DEFAULT TRUE,
  rule_notification_enabled BOOLEAN DEFAULT TRUE,
  token_expiry_alert_enabled BOOLEAN DEFAULT TRUE,
  sync_error_alert_enabled BOOLEAN DEFAULT FALSE,
  timezone VARCHAR(50) DEFAULT 'Asia/Ho_Chi_Minh',
  email_template TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bảng Nhóm cột tùy chỉnh (lưu cấu hình cột bảng chiến dịch)
CREATE TABLE IF NOT EXISTS column_presets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  platform VARCHAR(20),
  preset_name VARCHAR(100) NOT NULL,
  columns JSONB NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_column_presets_user ON column_presets(user_id, platform);

-- Function tự động cập nhật updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_users_updated_at') THEN
    CREATE TRIGGER set_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_ad_accounts_updated_at') THEN
    CREATE TRIGGER set_ad_accounts_updated_at BEFORE UPDATE ON ad_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_campaigns_updated_at') THEN
    CREATE TRIGGER set_campaigns_updated_at BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_rules_updated_at') THEN
    CREATE TRIGGER set_rules_updated_at BEFORE UPDATE ON rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END$$;
`;

const migrate = async () => {
  console.log('🔧 Bắt đầu migrate database...');
  try {
    await pool.query(SCHEMA);
    console.log('✅ Migrate thành công - Đã tạo tất cả các bảng');

    // Tạo admin mặc định nếu chưa có
    const bcrypt = require('bcryptjs');
    const adminCheck = await pool.query('SELECT id FROM users WHERE username = $1', [process.env.ADMIN_USERNAME || 'admin']);

    if (adminCheck.rowCount === 0) {
      const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', 10);
      const result = await pool.query(
        'INSERT INTO users (username, password_hash, email, full_name) VALUES ($1, $2, $3, $4) RETURNING id',
        [
          process.env.ADMIN_USERNAME || 'admin',
          hashedPassword,
          process.env.ADMIN_EMAIL || 'admin@adspro.local',
          'Administrator'
        ]
      );
      const userId = result.rows[0].id;

      await pool.query(
        'INSERT INTO user_settings (user_id, email_primary) VALUES ($1, $2)',
        [userId, process.env.ADMIN_EMAIL || 'admin@adspro.local']
      );

      console.log('✅ Đã tạo tài khoản admin mặc định');
      console.log(`   Username: ${process.env.ADMIN_USERNAME || 'admin'}`);
      console.log(`   Password: ${process.env.ADMIN_PASSWORD || 'admin123'}`);
    } else {
      console.log('ℹ️  Tài khoản admin đã tồn tại');
    }

    return true;
  } catch (err) {
    console.error('❌ Lỗi migrate:', err);
    throw err;
  }
};

if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { migrate, SCHEMA };
