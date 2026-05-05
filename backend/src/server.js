// src/server.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const { metricsHandler, metricsMiddleware } = require('./middleware/metrics');
const { apiLimiter } = require('./middleware/rateLimiter');
const { initSocket } = require('./services/socket.service');
const prisma = require('./config/prisma');
const { connectRedis, redis } = require('./config/redis');
const { closeQueues, scheduleRecurringJobs } = require('./queues');

// Routes
const authRoutes = require('./routes/auth.routes');
const chatRoutes = require('./routes/chat.routes');
const tweetRoutes = require('./routes/tweet.routes');
const userRoutes = require('./routes/user.routes');
const notificationRoutes = require('./routes/notification.routes');
const communityRoutes = require('./routes/community.routes');
const musicRoutes = require('./routes/music.routes');
const serviceRoutes = require('./routes/service.routes');
const paymentRoutes = require('./routes/payment.routes');
const { getNotifications } = require('./controllers/notification.controller');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

const app = express();
app.set('trust proxy', 1);
const httpServer = http.createServer(app);
const allowedOrigins = (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const corsOrigin = (origin, callback) => {
  if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
  return callback(new Error('Not allowed by CORS'));
};

// Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  maxHttpBufferSize: parseInt(process.env.SOCKET_MAX_PAYLOAD_BYTES, 10) || 128 * 1024,
});

// Make io accessible in routes
app.set('io', io);

// Security
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://res.cloudinary.com', 'https://lh3.googleusercontent.com'],
      mediaSrc: ["'self'", ...allowedOrigins, 'blob:'],
      frameSrc: ["'self'"],
      connectSrc: ["'self'", ...allowedOrigins, 'wss:', 'ws:'],
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
}));

app.use(cors({
  origin: corsOrigin,
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
app.use(morgan('combined', {
  stream: { write: (message) => logger.http(message.trim()) },
}));
app.use(metricsMiddleware);

// Rate limiting
app.use('/api/', apiLimiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/ready', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    if (!redis.isOpen) throw new Error('Redis is not connected');
    res.json({ status: 'ready', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(503).json({ status: 'not_ready', error: error.message });
  }
});

app.get('/metrics', metricsHandler);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/tweets', tweetRoutes);
app.use('/api/users', userRoutes);
app.use('/api/notifications', notificationRoutes)
app.use('/api/communities', communityRoutes);
app.use('/api/music', musicRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/payments', paymentRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `Маршрут ${req.method} ${req.path} не найден` });
});

// Error handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const start = async () => {
  await connectRedis();
  if (process.env.JOB_QUEUE_ENABLED !== 'false') await scheduleRecurringJobs();
  await initSocket(io);
  httpServer.listen(PORT, () => {
    logger.info(`🚀 Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
    logger.info(`📡 Socket.IO ready`);
  });
};

start().catch((error) => {
  logger.error('Server startup failed:', error);
  process.exit(1);
});

const shutdown = async (signal) => {
  logger.info(`${signal} received, shutting down gracefully`);
  io.close();
  httpServer.close(async () => {
    await prisma.$disconnect();
    await closeQueues();
    if (redis.isOpen) await redis.quit();
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', reason);
});

module.exports = app;
