// src/middleware/rateLimiter.js
const rateLimit = require('express-rate-limit');

const createLimiter = (windowMs, max, message) =>
  rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
  });

const authLimiter = createLimiter(
  15 * 60 * 1000, // 15 минут
  10,
  'Слишком много попыток входа, попробуйте через 15 минут'
);

const apiLimiter = createLimiter(
  parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  parseInt(process.env.RATE_LIMIT_MAX) || 100,
  'Слишком много запросов, попробуйте позже'
);

const tweetLimiter = createLimiter(
  60 * 1000, // 1 минута
  10,
  'Слишком много твитов, подождите минуту'
);

const messageLimiter = createLimiter(
  60 * 1000,
  30,
  'Слишком много сообщений, подождите'
);

module.exports = { authLimiter, apiLimiter, tweetLimiter, messageLimiter };
