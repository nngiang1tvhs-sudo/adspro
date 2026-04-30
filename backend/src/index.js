require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const routes = require('./routes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const logger = require('./utils/logger');
const { pool } = require('./config/database');
const { migrate } = require('./config/migrate');
const { startAllCrons } = require('./jobs/cronJobs');

const app = express();
const PORT = process.env.PORT || 5000;

// ===== MIDDLEWARE =====
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
app.use(cors({
  origin: process.env.FRONTEND_URL || true,
  credentials: true,
}));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', {
    stream: { write: (msg) => logger.info(msg.trim()) },
    skip: (req) => req.url === '/api/health',
  }));
}

// Rate limit cho login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau 15 phút.',
});
app.use('/api/auth/login', loginLimiter);

// ===== ROUTES =====
app.get('/', (req, res) => {
  res.json({
    name: 'AdsPro Backend API',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api', routes);

// 404 handler
app.use(notFoundHandler);

// Error handler (cuối cùng)
app.use(errorHandler);

// ===== STARTUP =====
const startServer = async () => {
  try {
    // Test DB connection
    const dbTest = await pool.query('SELECT NOW()');
    logger.info(`✅ Database connected at ${dbTest.rows[0].now}`);

    // Auto migrate
    if (process.env.AUTO_MIGRATE !== 'false') {
      logger.info('🔧 Running migrations...');
      await migrate().catch(() => {}); // Migrate có process.exit, nên dùng inline
    }

    // Start cron jobs
    startAllCrons();

    // Start server
    app.listen(PORT, () => {
      logger.info(`🚀 AdsPro Backend chạy tại http://localhost:${PORT}`);
      logger.info(`🌍 Môi trường: ${process.env.NODE_ENV || 'development'}`);
    });

  } catch (err) {
    logger.error('❌ Lỗi khởi động server:', err);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, đang đóng kết nối...');
  pool.end(() => process.exit(0));
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', reason);
});

if (require.main === module) {
  startServer();
}

module.exports = app;
