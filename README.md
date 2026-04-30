# AdsPro — Quản lý quảng cáo tập trung

Web app quản lý nhiều tài khoản Google Ads, Facebook Ads, TikTok Ads ở cùng 1 nơi. Tự động hóa bằng Rules, gửi báo cáo email, chạy 24/7.

## Tính năng chính

- **Đăng nhập bảo mật** (1 admin, JWT, mã hóa mật khẩu)
- **Dashboard** riêng từng nền tảng với biểu đồ 2 trục, lọc theo tài khoản và ngày tháng
- **Chiến dịch** drill-down 3 cấp (Campaign → Ad Group → Ad), 30+ cột chỉ số, ẩn/hiện cột, kéo thả thứ tự cột, lưu nhóm cột tùy chỉnh, bật/tắt camp trực tiếp
- **Rules tự động hóa** với conditions xếp ngang, 6 phép so sánh, 5 khoảng thời gian dữ liệu, 5 hành động (bật/tắt/email/cảnh báo)
- **Báo cáo sáng email** lúc 7h Việt Nam, tổng hợp từng nền tảng
- **Lịch sử & Audit** đầy đủ (audit log + rule history + sync log)
- **Mã hóa AES-256-GCM** toàn bộ token API trước khi lưu DB

## Hướng dẫn cài đặt

Vui lòng đọc file [`HUONG_DAN_CAI_DAT.md`](./HUONG_DAN_CAI_DAT.md) để cài đặt từ đầu đến cuối.

## Cấu trúc dự án

```
adspro/
├── backend/        # Node.js + Express + PostgreSQL
│   ├── src/
│   │   ├── config/         # Database & migration
│   │   ├── controllers/    # Logic xử lý cho từng route
│   │   ├── middleware/     # Auth, error handler
│   │   ├── routes/         # Định tuyến API
│   │   ├── services/       # Tích hợp Google/FB/TikTok APIs, Rules engine, Email
│   │   ├── utils/          # Logger, encryption, audit, response helper
│   │   ├── jobs/           # Cron jobs tự động
│   │   └── index.js        # Entry point
│   ├── .env.example
│   └── package.json
│
└── frontend/       # React + Vite + Tailwind CSS
    ├── src/
    │   ├── components/     # Sidebar, Charts, DateRangePicker...
    │   ├── pages/          # Login, Dashboard, Campaigns, Rules, History, Connect
    │   ├── services/       # API client (axios)
    │   ├── context/        # AuthContext
    │   ├── utils/          # Helpers (format, date, columns)
    │   └── main.jsx
    └── package.json
```

## Tech Stack

**Backend:** Node.js 18+, Express, PostgreSQL 14+, JWT, bcrypt, AES-256-GCM, node-cron, Resend (email), Winston (logging)

**Frontend:** React 18, Vite, Tailwind CSS, Recharts, Axios, React Router, Lucide Icons, dnd-kit

## Lệnh cơ bản

```bash
# Backend
cd backend
npm install
npm run migrate     # Tạo bảng DB + admin mặc định
npm run dev         # Chạy dev mode (port 5000)
npm start           # Chạy production

# Frontend
cd frontend
npm install
npm run dev         # Chạy dev (port 3000)
npm run build       # Build production
```

## Tài khoản mặc định

- **Username:** `admin`
- **Password:** `admin123`

> ⚠️ **Đổi mật khẩu ngay sau lần đăng nhập đầu** trong phần Settings hoặc bằng tay.

## Hỗ trợ

Nếu gặp lỗi, kiểm tra theo thứ tự:
1. PostgreSQL có chạy không? (`pg_isready`)
2. File `.env` đã điền đúng `DATABASE_URL` chưa?
3. Đã chạy `npm run migrate` chưa?
4. Backend log: xem trong `backend/logs/error.log`

## License

Private — chỉ dành cho mục đích nội bộ.
