// src/services/socket.service.js
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');
const logger = require('../utils/logger');

const connectedUsers = new Map(); // userId -> Set of socketIds

const initSocket = (io) => {
  // Auth middleware for socket
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, username: true, displayName: true, avatarUrl: true },
      });

      if (!user) return next(new Error('User not found'));
      socket.user = user;
      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user.id;
    logger.info(`Socket connected: ${socket.user.username} (${socket.id})`);

    // Track connections
    if (!connectedUsers.has(userId)) {
      connectedUsers.set(userId, new Set());
    }
    connectedUsers.get(userId).add(socket.id);

    // Join user's personal room
    socket.join(`user:${userId}`);

    // Broadcast online status
    socket.broadcast.emit('user:online', { userId });

    // Join chat rooms
    socket.on('chat:join', async (chatId) => {
      try {
        const participant = await prisma.chatParticipant.findUnique({
          where: { chatId_userId: { chatId, userId } },
        });
        if (participant) {
          socket.join(`chat:${chatId}`);
          logger.debug(`${socket.user.username} joined chat ${chatId}`);
        }
      } catch (error) {
        logger.error('chat:join error:', error);
      }
    });

    socket.on('chat:leave', (chatId) => {
      socket.leave(`chat:${chatId}`);
    });

    // Real-time message sending
    socket.on('message:send', async (data) => {
      try {
        const { chatId, content, imageUrl } = data;

        if (!content?.trim() || content.length > 1000) {
          return socket.emit('error', { message: 'Некорректное сообщение' });
        }

        const participant = await prisma.chatParticipant.findUnique({
          where: { chatId_userId: { chatId, userId } },
        });

        if (!participant) {
          return socket.emit('error', { message: 'Нет доступа к чату' });
        }

        const chat = await prisma.chat.findUnique({
          where: { id: chatId },
          include: { participants: true },
        });

        const receiverId = chat.isGroup
          ? null
          : chat.participants.find((p) => p.userId !== userId)?.userId || null;

        const message = await prisma.message.create({
          data: { chatId, senderId: userId, receiverId, content: content.trim(), imageUrl: imageUrl || null },
          include: {
            sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
          },
        });

        await prisma.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });

        // Broadcast to chat room
        io.to(`chat:${chatId}`).emit('message:new', { message, chatId });

        // Notify offline participants
        chat.participants.forEach((p) => {
          if (p.userId !== userId) {
            io.to(`user:${p.userId}`).emit('chat:notification', {
              chatId,
              message,
              from: socket.user,
            });
          }
        });
      } catch (error) {
        logger.error('message:send error:', error);
        socket.emit('error', { message: 'Не удалось отправить сообщение' });
      }
    });

    // Typing indicator
    socket.on('typing:start', ({ chatId }) => {
      socket.to(`chat:${chatId}`).emit('typing:start', { userId, chatId, user: socket.user });
    });

    socket.on('typing:stop', ({ chatId }) => {
      socket.to(`chat:${chatId}`).emit('typing:stop', { userId, chatId });
    });

    // Mark messages as read
    socket.on('messages:read', async ({ chatId }) => {
      try {
        await prisma.message.updateMany({
          where: { chatId, senderId: { not: userId }, isRead: false },
          data: { isRead: true },
        });
        socket.to(`chat:${chatId}`).emit('messages:read', { chatId, readBy: userId });
      } catch (error) {
        logger.error('messages:read error:', error);
      }
    });

    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.user.username} (${socket.id})`);
      const userSockets = connectedUsers.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          connectedUsers.delete(userId);
          socket.broadcast.emit('user:offline', { userId });
        }
      }
    });
  });

  return io;
};

const getOnlineUsers = () => Array.from(connectedUsers.keys());

module.exports = { initSocket, getOnlineUsers };
