const prisma = require('../config/prisma');

const notificationInclude = {
  from: {
    select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true },
  },
  tweet: {
    select: {
      id: true,
      content: true,
      author: { select: { username: true, displayName: true } },
    },
  },
};

const getNotifications = async (req, res, next) => {
  try {
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' },
        take: 60,
        include: notificationInclude,
      }),
      prisma.notification.count({ where: { userId: req.user.id, isRead: false } }),
    ]);

    res.json({ notifications, unreadCount });
  } catch (error) {
    next(error);
  }
};

const markAsRead = async (req, res, next) => {
  try {
    const result = await prisma.notification.updateMany({
      where: { userId: req.user.id, isRead: false },
      data: { isRead: true },
    });

    res.json({ message: 'Уведомления прочитаны', updated: result.count });
  } catch (error) {
    next(error);
  }
};

const markOneAsRead = async (req, res, next) => {
  try {
    const notification = await prisma.notification.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!notification) return res.status(404).json({ error: 'Уведомление не найдено' });

    const updated = await prisma.notification.update({
      where: { id: notification.id },
      data: { isRead: true },
      include: notificationInclude,
    });

    res.json({ notification: updated });
  } catch (error) {
    next(error);
  }
};

module.exports = { getNotifications, markAsRead, markOneAsRead };
