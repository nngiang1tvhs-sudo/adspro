# HƯỚNG DẪN CÀI ĐẶT ADSPRO TỪ A → Z

> Hướng dẫn này dành cho người **chưa biết code**. Đọc kỹ và làm theo từng bước.

## Bước 1: Cài các phần mềm cần thiết

### 1.1. Cài Node.js (môi trường chạy backend & frontend)

1. Vào trang **https://nodejs.org**
2. Bấm nút **LTS** (bản ổn định) để tải xuống
3. Mở file vừa tải, bấm **Next** liên tục cho đến khi cài xong
4. Mở **Command Prompt** (Windows: nhấn `Win + R`, gõ `cmd`, Enter), gõ:
   ```
   node --version
   ```
   Nếu thấy hiện ra số version (VD: `v20.10.0`) thì OK.

### 1.2. Cài PostgreSQL (database)

1. Vào **https://www.postgresql.org/download/windows/**
2. Bấm **Download the installer**
3. Tải bản mới nhất (PostgreSQL 16), cài đặt:
   - Để mặc định các tùy chọn
   - **Quan trọng:** Khi yêu cầu Password, đặt là `postgres` (dễ nhớ, sau này có thể đổi)
   - Port để mặc định `5432`
4. Sau khi cài xong, mở **pgAdmin 4** từ menu Start → Đăng nhập với mật khẩu `postgres`
5. Tạo database mới:
   - Click chuột phải vào **Databases** → **Create** → **Database...**
   - Đặt tên: `adspro`
   - Click **Save**

### 1.3. Cài Git (để tải code về & deploy)

1. Vào **https://git-scm.com/download/win**
2. Tải về, cài đặt (để mặc định tất cả)
3. Kiểm tra trong cmd: `git --version`

### 1.4. Cài VS Code (để xem & chỉnh sửa code)

1. Vào **https://code.visualstudio.com/**
2. Tải bản Windows, cài đặt

---

## Bước 2: Lấy code AdsPro về máy

1. Giải nén file `adspro.zip` (mà bạn nhận được) ra ổ C, ví dụ: `C:\adspro`
2. Mở **VS Code** → **File → Open Folder** → Chọn thư mục `C:\adspro`

---

## Bước 3: Cài đặt backend

### 3.1. Mở Terminal trong VS Code

Trong VS Code, bấm **Ctrl + `** (dấu phía trên Tab) để mở Terminal.

### 3.2. Cài đặt thư viện

```bash
cd backend
npm install
```

Chờ vài phút cho Node.js tải các thư viện. Nếu báo lỗi mạng, gõ lại lần nữa.

### 3.3. Tạo file cấu hình `.env`

```bash
copy .env.example .env
```

Sau đó mở file `.env` trong VS Code, điền các giá trị:

```env
# Server
PORT=5000
NODE_ENV=development

# Database — sửa nếu mật khẩu PostgreSQL của bạn khác "postgres"
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/adspro

# JWT — đổi thành chuỗi ngẫu nhiên dài (50+ ký tự)
JWT_SECRET=hay_doi_chuoi_nay_thanh_chuoi_ngau_nhien_dai_50_ky_tu_de_bao_mat
JWT_EXPIRES_IN=7d

# Admin mặc định (sẽ tự tạo khi migrate lần đầu)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
ADMIN_EMAIL=email_cua_ban@example.com

# Email service (Resend) — đăng ký miễn phí tại resend.com
RESEND_API_KEY=re_xxxxxxxxxxxxxxx
EMAIL_FROM=AdsPro <onboarding@resend.dev>
EMAIL_TO=email_nhan_bao_cao@example.com

# Encryption key — đổi thành chuỗi ngẫu nhiên 32+ ký tự
ENCRYPTION_KEY=cung_doi_chuoi_nay_de_bao_mat_token_api

# Cron schedule (giờ Việt Nam)
DAILY_REPORT_CRON=0 7 * * *
SYNC_CRON=*/15 * * * *
RULES_CRON=*/5 * * * *
TIMEZONE=Asia/Ho_Chi_Minh

FRONTEND_URL=http://localhost:3000
```

> **Đăng ký Resend (miễn phí 3000 email/tháng):**
> 1. Vào https://resend.com → Sign Up
> 2. Vào **API Keys** → Create
> 3. Copy key dạng `re_xxxxxxxxxxx` paste vào `RESEND_API_KEY`

### 3.4. Tạo bảng database & tài khoản admin

```bash
npm run migrate
```

Nếu thành công sẽ thấy:
```
✅ Migrate thành công - Đã tạo tất cả các bảng
✅ Đã tạo tài khoản admin mặc định
   Username: admin
   Password: admin123
```

### 3.5. Chạy backend

```bash
npm run dev
```

Nếu thành công sẽ thấy:
```
🚀 AdsPro Backend chạy tại http://localhost:5000
```

**Để cửa sổ này mở, không tắt!** Mở cửa sổ Terminal mới (bấm dấu **+** phía trên Terminal) cho bước tiếp theo.

---

## Bước 4: Cài đặt frontend

### 4.1. Mở Terminal mới, cd vào thư mục frontend

```bash
cd frontend
npm install
```

Chờ vài phút.

### 4.2. Chạy frontend

```bash
npm run dev
```

Nếu thành công sẽ thấy:
```
VITE v5.x.x ready in xxx ms
➜ Local: http://localhost:3000/
```

### 4.3. Mở trình duyệt

- Mở Chrome/Edge → vào địa chỉ `http://localhost:3000`
- Đăng nhập:
  - Username: `admin`
  - Password: `admin123`

🎉 **AdsPro đã chạy được!**

---

## Bước 5: Kết nối tài khoản quảng cáo

### 5.1. Google Ads

#### Lấy Developer Token

1. Vào **https://ads.google.com/aw/apicenter** (đăng nhập bằng tài khoản MCC)
2. Bấm **Apply for token** → điền form yêu cầu
3. Sau khi được duyệt (1-3 ngày), copy **Developer Token**

#### Lấy Client ID + Client Secret

1. Vào **https://console.cloud.google.com/**
2. Tạo project mới (hoặc dùng project có sẵn)
3. Vào **APIs & Services → Library** → tìm **Google Ads API** → **Enable**
4. Vào **APIs & Services → Credentials** → **Create Credentials → OAuth client ID**
5. Application type: **Desktop app**
6. Sau khi tạo, copy **Client ID** và **Client Secret**

#### Lấy Refresh Token (phức tạp nhất)

1. Tải file `oauth2_helper.html` từ folder `helpers/` (Claude sẽ tạo riêng nếu cần)
2. Hoặc dùng công cụ online: **https://developers.google.com/oauthplayground**
   - Bấm bánh răng phải trên → check **Use your own OAuth credentials**
   - Điền Client ID + Client Secret vừa tạo
   - Step 1: chọn scope `https://www.googleapis.com/auth/adwords`
   - Authorize APIs → đăng nhập tài khoản Google Ads
   - Step 2: bấm **Exchange authorization code for tokens**
   - Copy **Refresh Token**

#### Lấy Customer ID

- Vào Google Ads, góc trên phải sẽ thấy số dạng `123-456-7890` → đó là Customer ID

#### Thêm vào AdsPro

1. Vào **AdsPro → Kết nối tài khoản → Thêm tài khoản**
2. Chọn nền tảng **Google Ads**
3. Điền:
   - Tên hiển thị: tự đặt (VD: Tài khoản công ty A)
   - Developer Token, Client ID, Client Secret, Refresh Token, Customer ID
4. Bấm **Test kết nối** trước → nếu thành công thì bấm **Thêm**

### 5.2. Facebook Ads

1. Tạo Facebook App tại **https://developers.facebook.com/apps**
2. Thêm sản phẩm **Marketing API**
3. Vào **Business Settings → Users → System Users → Add**
4. Tạo System User → **Generate New Token** → chọn scope `ads_management`, `ads_read`, `business_management`
5. Token này sẽ **không hết hạn** — copy lại
6. Vào **Ad Accounts → Add Ad Account**, thêm tài khoản quảng cáo và assign cho System User
7. Lấy **Ad Account ID** từ Ads Manager (định dạng `act_123456789`)

Thêm vào AdsPro với: App ID, App Secret (từ App Dashboard), Access Token (System User), Ad Account ID.

### 5.3. TikTok Ads

1. Vào **https://ads.tiktok.com/marketing_api/homepage**
2. Đăng ký developer → tạo App
3. Lấy **App ID** và **App Secret**
4. Authorize app với tài khoản quảng cáo của bạn → nhận **Authorization Code**
5. Đổi code lấy **Access Token** + **Refresh Token** qua API:
   ```
   POST https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/
   Body: { "app_id", "secret", "auth_code" }
   ```
6. Lấy **Advertiser ID** từ TikTok Ads Manager

Thêm vào AdsPro với 5 trường trên.

---

## Bước 6: Kiểm tra hoạt động

1. Vào **Dashboard** — chọn nền tảng → xem biểu đồ + chỉ số
2. Vào **Chiến dịch** — bấm **Làm mới** để đồng bộ data lần đầu
3. Vào **Quản lý Rule** — tạo rule đầu tiên (VD: Tắt camp khi CPV > 500đ)
4. Vào **Kết nối tài khoản → Cài đặt email** — nhập email + bấm **Gửi email thử**

---

## Bước 7: Deploy lên Railway (chạy 24/7)

### 7.1. Chuẩn bị code

```bash
# Tại folder gốc adspro
git init
git add .
git commit -m "Initial commit"
```

Tạo repo trên GitHub:
1. Vào **https://github.com/new** → tạo repo `adspro` (Private)
2. Trong VS Code Terminal:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/adspro.git
   git push -u origin main
   ```

### 7.2. Deploy lên Railway

1. Vào **https://railway.app** → đăng ký bằng GitHub
2. Bấm **New Project → Deploy from GitHub repo** → chọn repo adspro
3. Railway sẽ tạo 2 services:

#### Service Backend
- **Settings → Root Directory:** `backend`
- **Settings → Start Command:** `npm start`
- **Variables:** copy toàn bộ từ `.env` của bạn vào (Railway tự cung cấp `DATABASE_URL` cho PostgreSQL)
- **Add database:** New → Database → **PostgreSQL** → Railway tự kết nối

#### Service Frontend
- **Settings → Root Directory:** `frontend`
- **Settings → Build Command:** `npm run build`
- **Settings → Start Command:** `npx serve -s dist -l 3000`
- **Variables:** `VITE_API_URL=https://your-backend.up.railway.app/api`

4. Railway tự deploy trong 5-10 phút.
5. Truy cập URL frontend (Railway cấp dạng `*.up.railway.app`).

---

## Bước 8: Đổi mật khẩu admin (BẮT BUỘC!)

Hiện tại tool chưa có UI đổi pass, dùng cách này:

1. Mở pgAdmin → Database `adspro` → Tools → Query Tool
2. Chạy SQL sau (đã đổi `MAT_KHAU_MOI` thành mật khẩu của bạn):

```sql
-- Tạo hash bcrypt cho mật khẩu mới (dùng tool online: https://bcrypt-generator.com/)
-- Hash 10 rounds, dán vào dưới
UPDATE users
SET password_hash = '$2a$10$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
WHERE username = 'admin';
```

Hoặc dùng Node.js:
```bash
cd backend
node -e "const bcrypt = require('bcryptjs'); console.log(bcrypt.hashSync('mat_khau_moi_cua_ban', 10));"
```

Copy hash → paste vào câu UPDATE bên trên.

---

## Câu hỏi thường gặp

### Tôi quên mật khẩu admin?
Reset bằng SQL:
```sql
UPDATE users SET password_hash = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy' WHERE username = 'admin';
-- Mật khẩu giờ sẽ là: admin123
```

### Backend không chạy được?
1. PostgreSQL có chạy không? Mở Services của Windows → tìm `postgresql` → Start
2. Đã chạy `npm run migrate` chưa?
3. Xem log lỗi trong `backend/logs/error.log`

### Email không gửi được?
1. `RESEND_API_KEY` đúng chưa?
2. Email người gửi (`EMAIL_FROM`) đã verify domain trên Resend chưa?
3. Thử dùng email mặc định: `EMAIL_FROM=onboarding@resend.dev`

### Không kết nối được Google Ads?
- Developer Token đã được Google duyệt chưa? (Tab `Test access` chỉ giới hạn).
- Customer ID đúng định dạng (chỉ số, không gạch ngang).
- Nếu tài khoản nằm trong MCC, cần điền thêm `Login Customer ID`.

---

## Hỗ trợ

Nếu vẫn gặp khó khăn, gửi screenshot lỗi cùng đoạn log từ `backend/logs/error.log` để được hỗ trợ.
