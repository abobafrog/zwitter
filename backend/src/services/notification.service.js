const prisma = require('../config/prisma');
const logger = require('../utils/logger');
const { enqueue } = require('../queues');

const notificationPreferenceByType = {
  like: 'notifyLikes',
  reply: 'notifyReplies',
  retweet: 'notifyRetweets',
  follow: 'notifyFollows',
  message: 'notifyMessages',
};

const createNotificationImmediate = async ({ io = null, userId, fromId, type, tweetId = null }) => {
  if (!userId || !fromId || userId === fromId) return null;

  try {
    const preferenceField = notificationPreferenceByType[type];
    if (preferenceField) {
      const target = await prisma.user.findUnique({
        where: { id: userId },
        select: { [preferenceField]: true },
      });
      if (!target?.[preferenceField]) return null;
    }

    const notification = await prisma.notification.create({
      data: { userId, fromId, type, tweetId },
      include: {
        from: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
        tweet: { select: { id: true, content: true } },
      },
    });

    if (io) {
      io.to(`user:${userId}`).emit('notification:new', { notification });
    }

    return notification;
  } catch (error) {
    logger.warn(`Notification skipped: ${error.message}`);
    return null;
  }
};

const createNotification = async ({ req, userId, fromId, type, tweetId = null }) => {
  const io = req?.app?.get('io');
  if (process.env.NOTIFICATION_QUEUE_ENABLED !== 'true') {
    return createNotificationImmediate({ io, userId, fromId, type, tweetId });
  }

  try {
    await enqueue('notification', 'create', { userId, fromId, type, tweetId });
    return null;
  } catch (error) {
    logger.warn(`Notification queue unavailable, creating synchronously: ${error.message}`);
    return createNotificationImmediate({ io, userId, fromId, type, tweetId });
  }
};

module.exports = { createNotification, createNotificationImmediate };
