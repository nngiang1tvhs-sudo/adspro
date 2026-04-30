const logger = require('../utils/logger');
const { error } = require('../utils/response');

/**
 * Middleware xử lý lỗi tập trung
 */
const errorHandler = (err, req, res, next) => {
  logger.error('API Error:', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    body: req.body,
  });

  // Lỗi validation từ Joi
  if (err.isJoi) {
    return error(res, err.details[0].message, 400, 'VALIDATION_ERROR');
  }

  // Lỗi từ PostgreSQL
  if (err.code) {
    if (err.code === '23505') {
      return error(res, 'Dữ liệu đã tồn tại (trùng lặp)', 409, 'DUPLICATE');
    }
    if (err.code === '23503') {
      return error(res, 'Dữ liệu liên kết không tồn tại', 400, 'FK_VIOLATION');
    }
    if (err.code === '23502') {
      return error(res, 'Thiếu thông tin bắt buộc', 400, 'NOT_NULL');
    }
  }

  return error(
    res,
    err.message || 'Lỗi máy chủ',
    err.statusCode || 500,
    err.errorCode || 'INTERNAL_ERROR',
    err.stack
  );
};

const notFoundHandler = (req, res) => {
  return error(res, `Không tìm thấy đường dẫn ${req.originalUrl}`, 404, 'NOT_FOUND');
};

module.exports = { errorHandler, notFoundHandler };
