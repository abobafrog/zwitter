// src/config/prisma.js
const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'event', level: 'error' },
    { emit: 'event', level: 'warn' },
  ],
});

const slowQueryMs = parseInt(process.env.SLOW_QUERY_MS, 10) || 250;

prisma.$on('query', (e) => {
  if (e.duration >= slowQueryMs) {
    logger.warn('Slow Prisma query', {
      durationMs: e.duration,
      query: e.query,
      params: e.params,
    });
    return;
  }

  if (process.env.NODE_ENV === 'development') {
    logger.debug(`Query: ${e.query} | Duration: ${e.duration}ms`);
  }
});

prisma.$on('error', (e) => {
  logger.error('Prisma error:', e);
});

module.exports = prisma;
