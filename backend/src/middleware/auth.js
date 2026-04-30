const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const { error } = require('../utils/response');

const JWT_SECRET = process.env.JWT_SECRET || 'adspro_default_secret_change_in_prod';

/**
 * Middleware kiểm tra JWT token
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return error(res, 'Bạn chưa đăng nhập', 401, 'NO_TOKEN');
    }

    const token = authHeader.substring(7);

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return error(res, 'Phiên đăng nhập đã hết hạn', 401, 'TOKEN_EXPIRED');
      }
      return error(res, 'Token không hợp lệ', 401, 'INVALID_TOKEN');
    }

    // Kiểm tra user còn tồn tại
    const result = await query('SELECT id, username, email, full_name FROM users WHERE id = $1', [decoded.userId]);

    if (result.rowCount === 0) {
      return error(res, 'Tài khoản không tồn tại', 401, 'USER_NOT_FOUND');
    }

    req.user = result.rows[0];
    next();
  } catch (err) {
    console.error('Auth error:', err);
    return error(res, 'Lỗi xác thực', 500);
  }
};

/**
 * Tạo JWT token
 */
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

module.exports = { authenticate, generateToken };
