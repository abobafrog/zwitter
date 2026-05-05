require('dotenv').config();
const { Worker } = require('bullmq');
const prisma = require('../config/prisma');
const logger = require('../utils/logger');
const { redisConnection } = require('../queues');
const {
  sendEmailChangeVerificationNow,
  sendPasswordResetEmailNow,
  sendVerificationEmailNow,
} = require('../services/mail.service');
const { createNotificationImmediate } = require('../services/notification.service');

const concurrency = parseInt(process.env.WORKER_CONCURRENCY, 10) || 5;
const topicSeeds = [
  { name: 'Космос', slug: 'space', keywords: ['космос', 'звезд', 'звёзд', 'орбит', 'галактик', 'планет'] },
  { name: 'Будущее', slug: 'future', keywords: ['будущ', 'интерфейс', 'протокол', 'релиз'] },
  { name: 'Наука', slug: 'science', keywords: ['наук', 'лаборатор', 'исслед', 'сигнал'] },
  { name: 'Искусство', slug: 'art', keywords: ['арт', 'визуал', 'дизайн', 'кадр', 'баннер'] },
  { name: 'Технологии', slug: 'technology', keywords: ['ui', 'ux', 'чат', 'канал', 'мобильн'] },
];

const emailHandlers = {
  verifyEmail: sendVerificationEmailNow,
  passwordReset: sendPasswordResetEmailNow,
  emailChange: sendEmailChangeVerificationNow,
};

const workers = [
  new Worker('email', async (job) => {
    const handler = emailHandlers[job.name];
    if (!handler) throw new Error(`Unknown email job: ${job.name}`);
    return handler(job.data);
  }, { connection: redisConnection, concurrency }),

  new Worker('notification', async (job) => {
    if (job.name !== 'create') throw new Error(`Unknown notification job: ${job.name}`);
    return createNotificationImmediate(job.data);
  }, { connection: redisConnection, concurrency }),

  new Worker('media', async (job) => {
    logger.info('Media job placeholder completed', { job: job.name, id: job.id });
    return { skipped: true, reason: 'cloudinary_transformations_handle_processing' };
  }, { connection: redisConnection, concurrency: Math.max(1, Math.floor(concurrency / 2)) }),

  new Worker('trend', async (job) => {
    if (job.name !== 'recalculate') throw new Error(`Unknown trend job: ${job.name}`);
    const results = await Promise.all(topicSeeds.map(async (topic) => {
      const posts = await prisma.tweet.count({
        where: {
          parentId: null,
          OR: topic.keywords.map((keyword) => ({ content: { contains: keyword, mode: 'insensitive' } })),
        },
      });
      await prisma.topicStat.upsert({
        where: { slug: topic.slug },
        create: { ...topic, posts },
        update: { name: topic.name, keywords: topic.keywords, posts },
      });
      return { slug: topic.slug, posts };
    }));
    return { topics: results };
  }, { connection: redisConnection, concurrency: 1 }),

  new Worker('maintenance', async (job) => {
    if (job.name !== 'vacuumAnalyze') throw new Error(`Unknown maintenance job: ${job.name}`);
    await prisma.$executeRawUnsafe('VACUUM ANALYZE');
    return { analyzed: true };
  }, { connection: redisConnection, concurrency: 1 }),
];

workers.forEach((worker) => {
  worker.on('completed', (job) => logger.info('Queue job completed', { queue: worker.name, job: job.name, id: job.id }));
  worker.on('failed', (job, error) => logger.error('Queue job failed', { queue: worker.name, job: job?.name, id: job?.id, error: error.message }));
});

const shutdown = async (signal) => {
  logger.info(`${signal} received, stopping queue workers`);
  await Promise.all(workers.map((worker) => worker.close()));
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

logger.info('Queue workers started', { concurrency });
