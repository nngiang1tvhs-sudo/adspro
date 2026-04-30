const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
const { generateToken } = require('../middleware/auth');
const { success, error, asyncHandler } = require('../utils/response');
const { logEvent, EVENT_TYPES } = require('../utils/audit');

/**
 * POST /api/auth/login
 * Đăng nhập
 */
const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return error(res, 'Vui lòng nhập tên đăng nhập và mật khẩu', 400);
  }

  const result = await query(
    'SELECT id, username, password_hash, email, full_name FROM users WHERE username = $1',
    [username]
  );

  if (result.rowCount === 0) {
    await logEvent({
      eventType: EVENT_TYPES.LOGIN_FAILED,
      level: 'warning',
      message: `Đăng nhập thất bại: tài khoản "${username}" không tồn tại`,
      ipAddress: req.ip,
    });
    return error(res, 'Tên đăng nhập hoặc mật khẩu không đúng', 401);
  }

  const user = result.rows[0];
  const isMatch = await bcrypt.compare(password, user.password_hash);

  if (!isMatch) {
    await logEvent({
      userId: user.id,
      eventType: EVENT_TYPES.LOGIN_FAILED,
      level: 'warning',
      message: `Đăng nhập thất bại: sai mật khẩu cho "${username}"`,
      ipAddress: req.ip,
    });
    return error(res, 'Tên đăng nhập hoặc mật khẩu không đúng', 401);
  }

  // Cập nhật last_login
  await query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

  const token = generateToken(user.id);

  await logEvent({
    userId: user.id,
    eventType: EVENT_TYPES.LOGIN,
    level: 'success',
    message: `Đăng nhập thành công: ${username}`,
    ipAddress: req.ip,
  });

  return success(res, {
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.full_name,
    },
  }, 'Đăng nhập thành công');
});

/**
 * POST /api/auth/logout
 */
const logout = asyncHandler(async (req, res) => {
  await logEvent({
    userId: req.user.id,
    eventType: EVENT_TYPES.LOGOUT,
    level: 'info',
    message: `Đăng xuất: ${req.user.username}`,
    ipAddress: req.ip,
  });
  return success(res, null, 'Đăng xuất thành công');
});

/**
 * GET /api/auth/me
 * Lấy thông tin user hiện tại
 */
const getMe = asyncHandler(async (req, res) => {
  return success(res, {
    user: {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email,
      fullName: req.user.full_name,
    },
  });
});

/**
 * PUT /api/auth/password
 * Đổi mật khẩu
 */
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return error(res, 'Vui lòng nhập đầy đủ thông tin', 400);
  }

  if (newPassword.length < 6) {
    return error(res, 'Mật khẩu mới phải có ít nhất 6 ký tự', 400);
  }

  const result = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  const isMatch = await bcrypt.compare(currentPassword, result.rows[0].password_hash);

  if (!isMatch) {
    return error(res, 'Mật khẩu hiện tại không đúng', 400);
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.user.id]);

  return success(res, null, 'Đổi mật khẩu thành công');
});

module.exports = { login, logout, getMe, changePassword };
