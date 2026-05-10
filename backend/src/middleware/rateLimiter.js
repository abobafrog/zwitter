// src/middleware/rateLimiter.js
const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { redis } = require('../config/redis');

const createLimiter = (windowMs, max, message, keyPrefix) =>
  rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      sendCommand: (...args) => redis.sendCommand(args),
      prefix: `rl:${keyPrefix}:`,
    }),
  });

const authLimiter = createLimiter(
  15 * 60 * 1000, // 15 минут
  parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 60,
  'Слишком много попыток входа, попробуйте через 15 минут',
  'auth'
);

const refreshLimiter = createLimiter(
  15 * 60 * 1000,
  120,
  'Слишком много обновлений сессии, попробуйте позже',
  'refresh'
);

const apiLimiter = createLimiter(
  parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  parseInt(process.env.RATE_LIMIT_MAX, 10) || 2000,
  'Слишком много запросов, попробуйте позже',
  'api'
);

const tweetLimiter = createLimiter(
  60 * 1000, // 1 минута
  parseInt(process.env.TWEET_RATE_LIMIT_MAX, 10) || 40,
  'Слишком много твитов, подождите минуту',
  'tweet'
);

const messageLimiter = createLimiter(
  60 * 1000,
  parseInt(process.env.MESSAGE_RATE_LIMIT_MAX, 10) || 90,
  'Слишком много сообщений, подождите',
  'message'
);

const uploadLimiter = createLimiter(
  60 * 1000,
  parseInt(process.env.UPLOAD_RATE_LIMIT_MAX, 10) || 30,
  'Слишком много загрузок, подождите',
  'upload'
);

module.exports = { authLimiter, refreshLimiter, apiLimiter, tweetLimiter, messageLimiter, uploadLimiter };
