/**
 * Helper trả về response chuẩn cho API
 */
const success = (res, data = null, message = 'Thành công', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

const error = (res, message = 'Có lỗi xảy ra', statusCode = 500, errorCode = null, details = null) => {
  const response = {
    success: false,
    message,
  };
  if (errorCode) response.errorCode = errorCode;
  if (details && process.env.NODE_ENV !== 'production') response.details = details;
  return res.status(statusCode).json(response);
};

/**
 * Async handler wrapper - tự động bắt lỗi
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = { success, error, asyncHandler };
