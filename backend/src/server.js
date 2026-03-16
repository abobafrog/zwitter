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
const { apiLimiter } = require('./middleware/rateLimiter');
const { initSocket } = require('./services/socket.service');

// Routes
const authRoutes = require('./routes/auth.routes');
const chatRoutes = require('./routes/chat.routes');
const tweetRoutes = require('./routes/tweet.routes');
const userRoutes = require('./routes/user.routes');
const notificationRoutes = require('./routes/notification.routes');
const { getNotifications } = require('./controllers/notification.controller');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

const app = express();
const httpServer = http.createServer(app);

// Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
});

initSocket(io);

// Make io accessible in routes
app.set('io', io);

// Security
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
app.use(morgan('combined', {
  stream: { write: (message) => logger.http(message.trim()) },
}));

// Rate limiting
app.use('/api/', apiLimiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/tweets', tweetRoutes);
app.use('/api/users', userRoutes);
app.use('/api/notifications', notificationRoutes)

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `Маршрут ${req.method} ${req.path} не найден` });
});

// Error handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

httpServer.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  logger.info(`📡 Socket.IO ready`);
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  httpServer.close(() => process.exit(0));
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', reason);
});

module.exports = app;
