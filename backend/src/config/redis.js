const { createClient } = require('redis');
const logger = require('../utils/logger');

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const client = createClient({ url: redisUrl });

client.on('error', (error) => {
  logger.error('Redis error:', error);
});

client.on('connect', () => {
  logger.info('Redis connected');
});

let connectPromise = client.connect().catch((error) => {
  connectPromise = null;
  logger.error('Redis initial connection failed:', error);
});

const connectRedis = async () => {
  if (client.isOpen) return client;
  if (!connectPromise) {
    connectPromise = client.connect().catch((error) => {
      connectPromise = null;
      throw error;
    });
  }
  await connectPromise;
  if (!client.isOpen) return connectRedis();
  return client;
};

const duplicateRedisClient = async () => {
  const duplicate = client.duplicate();
  duplicate.on('error', (error) => logger.error('Redis duplicate error:', error));
  await duplicate.connect();
  return duplicate;
};

module.exports = { redis: client, connectRedis, duplicateRedisClient };
