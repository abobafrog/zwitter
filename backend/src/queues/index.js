const { Queue } = require('bullmq');
const logger = require('../utils/logger');

const redisConnection = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
};

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
  removeOnFail: { age: 7 * 24 * 60 * 60, count: 5000 },
};

const queues = {
  email: new Queue('email', { connection: redisConnection, defaultJobOptions }),
  notification: new Queue('notification', { connection: redisConnection, defaultJobOptions }),
  media: new Queue('media', { connection: redisConnection, defaultJobOptions }),
  trend: new Queue('trend', { connection: redisConnection, defaultJobOptions }),
  maintenance: new Queue('maintenance', { connection: redisConnection, defaultJobOptions }),
};

const enqueue = async (queueName, jobName, data, options = {}) => {
  const queue = queues[queueName];
  if (!queue) throw new Error(`Unknown queue: ${queueName}`);
  logger.info('Queue job enqueued', { queue: queueName, job: jobName });
  return queue.add(jobName, data, options);
};

const closeQueues = async () => Promise.all(Object.values(queues).map((queue) => queue.close()));

const scheduleRecurringJobs = async () => {
  await queues.trend.add('recalculate', {}, {
    jobId: 'trend-recalculate-hourly',
    repeat: { pattern: process.env.TREND_RECALCULATE_CRON || '*/30 * * * *' },
  });
  await queues.maintenance.add('vacuumAnalyze', {}, {
    jobId: 'maintenance-vacuum-analyze-weekly',
    repeat: { pattern: process.env.VACUUM_ANALYZE_CRON || '0 3 * * 0' },
  });
};

module.exports = { queues, enqueue, closeQueues, scheduleRecurringJobs, redisConnection };
