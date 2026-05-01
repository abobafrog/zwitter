const prisma = require('../config/prisma');
const logger = require('../utils/logger');

const createNotification = async ({ req, userId, fromId, type, tweetId = null }) => {
  if (!userId || !fromId || userId === fromId) return null;

  try {
    const notification = await prisma.notification.create({
      data: { userId, fromId, type, tweetId },
      include: {
        from: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
        tweet: { select: { id: true, content: true } },
      },
    });

    const io = req?.app?.get('io');
    if (io) {
      io.to(`user:${userId}`).emit('notification:new', { notification });
    }

    return notification;
  } catch (error) {
    logger.warn(`Notification skipped: ${error.message}`);
    return null;
  }
};

module.exports = { createNotification };
