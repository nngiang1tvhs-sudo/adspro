# 🚀 QUICK START — Chạy AdsPro lần đầu

> Hướng dẫn nhanh. Đọc kỹ `HUONG_DAN_CAI_DAT.md` để có chi tiết đầy đủ.

## Đã cài đầy đủ Node.js + PostgreSQL?

### Bước 1: Tạo database
Mở **pgAdmin 4** → tạo database tên `adspro`

### Bước 2: Backend
```bash
cd backend
copy .env.example .env
```

Mở file `.env` → sửa `DATABASE_URL` cho đúng mật khẩu PostgreSQL của bạn.

```bash
npm install
npm run migrate
npm run dev
```

→ Backend chạy tại http://localhost:5000

### Bước 3: Frontend (mở Terminal MỚI)
```bash
cd frontend
npm install
npm run dev
```

→ Frontend chạy tại http://localhost:3000

### Bước 4: Đăng nhập
- Username: `admin`
- Password: `admin123`

### Bước 5: Kết nối tài khoản
Vào **Kết nối tài khoản → Thêm tài khoản** → chọn nền tảng → điền credentials → Test → Thêm.

---

## Mỗi lần dùng

Mỗi lần khởi động máy, để chạy lại tool:
1. Mở 2 Terminal trong VS Code
2. Terminal 1: `cd backend && npm run dev`
3. Terminal 2: `cd frontend && npm run dev`
4. Mở trình duyệt: http://localhost:3000

## Chạy 24/7?
Đọc phần **Bước 7** trong `HUONG_DAN_CAI_DAT.md` để deploy lên Railway.

