// src/services/socket.service.js
const jwt = require('jsonwebtoken');
const { createAdapter } = require('@socket.io/redis-adapter');
const prisma = require('../config/prisma');
const { redis, duplicateRedisClient } = require('../config/redis');
const logger = require('../utils/logger');
const { activeUsers, websocketConnections } = require('../middleware/metrics');

const connectedUsers = new Map(); // userId -> Set of socketIds
const activeCalls = new Map(); // callId -> call metadata
const ONLINE_TTL_SECONDS = 90;

const socketRateLimits = {
  'typing:start': { limit: parseInt(process.env.SOCKET_TYPING_RATE_LIMIT_MAX, 10) || 120, windowMs: 60 * 1000 },
  'typing:stop': { limit: parseInt(process.env.SOCKET_TYPING_RATE_LIMIT_MAX, 10) || 120, windowMs: 60 * 1000 },
  'messages:read': { limit: parseInt(process.env.SOCKET_READ_RATE_LIMIT_MAX, 10) || 300, windowMs: 60 * 1000 },
  'message:send': { limit: parseInt(process.env.SOCKET_MESSAGE_RATE_LIMIT_MAX, 10) || 600, windowMs: 60 * 1000 },
};

const checkSocketRateLimit = (eventName, socket, userId) => {
  const config = socketRateLimits[eventName];
  if (!config) return true;

  const now = Date.now();
  const key = `rl:${eventName}:${userId}`;
  const current = socket.data.rateLimits?.get(key) || { count: 0, resetAt: now + config.windowMs };
  if (current.resetAt <= now) {
    socket.data.rateLimits.set(key, { count: 1, resetAt: now + config.windowMs });
    return true;
  }
  current.count += 1;
  socket.data.rateLimits.set(key, current);
  return current.count <= config.limit;
};

const withSocketGuard = (eventName, socket, userId, handler) => async (...args) => {
  if (!checkSocketRateLimit(eventName, socket, userId)) {
    return socket.emit('error', { message: 'Слишком много событий, попробуйте позже' });
  }
  return handler(...args);
};

const markUserOnline = async (userId, socketId) => {
  await redis.sAdd(`online:user:${userId}:sockets`, socketId);
  await redis.expire(`online:user:${userId}:sockets`, ONLINE_TTL_SECONDS);
  await redis.sAdd('online:users', userId);
  activeUsers.set(await redis.sCard('online:users'));
};

const markUserOfflineSocket = async (userId, socketId) => {
  await redis.sRem(`online:user:${userId}:sockets`, socketId);
  const socketsLeft = await redis.sCard(`online:user:${userId}:sockets`);
  if (socketsLeft === 0) {
    await redis.sRem('online:users', userId);
  }
  activeUsers.set(await redis.sCard('online:users'));
  return socketsLeft;
};

const messageInclude = {
  sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
  reactions: {
    include: {
      user: { select: { id: true, username: true, displayName: true } },
    },
    orderBy: { createdAt: 'asc' },
  },
};

const isParticipant = async (chatId, userId) => Boolean(await prisma.chatParticipant.findUnique({
  where: { chatId_userId: { chatId, userId } },
  select: { id: true },
}));

const canSendDirectMessage = async (senderId, recipientId) => {
  if (!senderId || !recipientId || senderId === recipientId) return true;
  const recipient = await prisma.user.findUnique({
    where: { id: recipientId },
    select: { messagePrivacy: true },
  });
  if (!recipient) return false;
  if (recipient.messagePrivacy === 'none') return false;
  if (recipient.messagePrivacy === 'following') {
    const followsSender = await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: recipientId, followingId: senderId } },
    });
    return Boolean(followsSender);
  }
  return true;
};

const getCallParticipants = async (chatId, userId) => {
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    include: {
      participants: {
        include: {
          user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        },
      },
    },
  });
  if (!chat || !chat.participants.some((participant) => participant.userId === userId)) return null;
  return chat;
};

const formatDuration = (startedAt) => {
  const totalSeconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
};

const formatCallStart = (startedAt) => new Date(startedAt).toLocaleTimeString('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
});

const initSocket = async (io) => {
  const pubClient = redis;
  const subClient = await duplicateRedisClient();
  io.adapter(createAdapter(pubClient, subClient));

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
    socket.data.rateLimits = new Map();

    // Track connections
    if (!connectedUsers.has(userId)) {
      connectedUsers.set(userId, new Set());
    }
    connectedUsers.get(userId).add(socket.id);
    websocketConnections.inc();
    markUserOnline(userId, socket.id).catch((error) => logger.error('online status error:', error));

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
    socket.on('message:send', withSocketGuard('message:send', socket, userId, async (data) => {
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
          include: { participants: { include: { user: { select: { notifyMessages: true } } } } },
        });

        const receiverId = chat.isGroup
          ? null
          : chat.participants.find((p) => p.userId !== userId)?.userId || null;
        if (receiverId && !(await canSendDirectMessage(userId, receiverId))) {
          return socket.emit('error', { message: 'Пользователь ограничил входящие сообщения' });
        }

        const message = await prisma.message.create({
          data: { chatId, senderId: userId, receiverId, content: content.trim(), imageUrl: imageUrl || null },
          include: messageInclude,
        });

        await prisma.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });

        // Broadcast to chat room
        io.to(`chat:${chatId}`).emit('message:new', { message, chatId });

        // Notify offline participants
        chat.participants.forEach((p) => {
          if (p.userId !== userId && p.user?.notifyMessages !== false) {
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
    }));

    // Typing indicator
    socket.on('typing:start', withSocketGuard('typing:start', socket, userId, async ({ chatId }) => {
      if (!(await isParticipant(chatId, userId))) return;
      socket.to(`chat:${chatId}`).emit('typing:start', { userId, chatId, user: socket.user });
    }));

    socket.on('typing:stop', withSocketGuard('typing:stop', socket, userId, async ({ chatId }) => {
      if (!(await isParticipant(chatId, userId))) return;
      socket.to(`chat:${chatId}`).emit('typing:stop', { userId, chatId });
    }));

    // Mark messages as read
    socket.on('messages:read', withSocketGuard('messages:read', socket, userId, async ({ chatId }) => {
      try {
        if (!(await isParticipant(chatId, userId))) return;
        await prisma.message.updateMany({
          where: { chatId, senderId: { not: userId }, isRead: false },
          data: { isRead: true },
        });
        socket.to(`chat:${chatId}`).emit('messages:read', { chatId, readBy: userId });
      } catch (error) {
        logger.error('messages:read error:', error);
      }
    }));

    socket.on('call:start', async ({ chatId, mode = 'audio' }) => {
      try {
        const chat = await getCallParticipants(chatId, userId);
        if (!chat) return socket.emit('call:error', { chatId, message: 'Нет доступа к чату' });

        const call = {
          id: `${chatId}:${Date.now()}:${userId}`,
          chatId,
          mode: mode === 'video' ? 'video' : 'audio',
          caller: socket.user,
          isGroup: chat.isGroup,
          createdAt: new Date().toISOString(),
        };
        activeCalls.set(call.id, {
          ...call,
          startedAt: Date.now(),
          callerId: userId,
          participantIds: chat.participants.map((participant) => participant.userId),
        });

        chat.participants.forEach((participant) => {
          if (participant.userId !== userId) {
            io.to(`user:${participant.userId}`).emit('call:ring', { call, chat });
          }
        });
        socket.join(`call:${call.id}`);
        socket.emit('call:started', { call });
      } catch (error) {
        logger.error('call:start error:', error);
        socket.emit('call:error', { chatId, message: 'Не удалось начать звонок' });
      }
    });

    socket.on('call:join', async ({ callId, chatId }) => {
      try {
        if (!(await isParticipant(chatId, userId))) return;
        socket.join(`call:${callId}`);
        socket.to(`call:${callId}`).emit('call:peer-joined', { callId, user: socket.user });
      } catch (error) {
        logger.error('call:join error:', error);
      }
    });

    socket.on('call:reject', ({ callId, chatId }) => {
      socket.to(`call:${callId}`).emit('call:rejected', { callId, chatId, user: socket.user });
      socket.to(`chat:${chatId}`).emit('call:rejected', { callId, chatId, user: socket.user });
    });

    socket.on('call:end', async ({ callId, chatId }) => {
      try {
        const call = activeCalls.get(callId);
        if (call && call.participantIds.includes(userId)) {
          activeCalls.delete(callId);
          const chat = await prisma.chat.findUnique({
            where: { id: chatId },
            include: { participants: true },
          });
          if (chat) {
            const duration = formatDuration(call.startedAt);
            const receiverId = chat.isGroup
              ? null
              : chat.participants.find((participant) => participant.userId !== call.callerId)?.userId || null;
            const message = await prisma.message.create({
              data: {
                chatId,
                senderId: call.callerId,
                receiverId,
                content: `Звонок начался ${formatCallStart(call.startedAt)} · завершён ${duration}`,
              },
              include: messageInclude,
            });
            await prisma.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });
            io.to(`chat:${chatId}`).emit('message:new', { message, chatId });
          }
        }
        io.to(`call:${callId}`).emit('call:ended', { callId, chatId, user: socket.user });
        socket.leave(`call:${callId}`);
      } catch (error) {
        logger.error('call:end error:', error);
      }
    });

    socket.on('call:signal', async ({ callId, chatId, targetUserId, signal }) => {
      try {
        if (!(await isParticipant(chatId, userId))) return;
        const payload = { callId, chatId, from: socket.user, signal };
        if (targetUserId) {
          io.to(`user:${targetUserId}`).emit('call:signal', payload);
        } else {
          socket.to(`call:${callId}`).emit('call:signal', payload);
        }
      } catch (error) {
        logger.error('call:signal error:', error);
      }
    });

    socket.on('call:media-state', async ({ callId, chatId, cameraOn, micOn }) => {
      try {
        if (!(await isParticipant(chatId, userId))) return;
        socket.to(`call:${callId}`).emit('call:media-state', {
          callId,
          chatId,
          userId,
          cameraOn: Boolean(cameraOn),
          micOn: micOn !== false,
        });
      } catch (error) {
        logger.error('call:media-state error:', error);
      }
    });

    socket.on('disconnect', async () => {
      logger.info(`Socket disconnected: ${socket.user.username} (${socket.id})`);
      websocketConnections.dec();
      const userSockets = connectedUsers.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          connectedUsers.delete(userId);
        }
      }
      try {
        const socketsLeft = await markUserOfflineSocket(userId, socket.id);
        if (socketsLeft === 0) socket.broadcast.emit('user:offline', { userId });
      } catch (error) {
        logger.error('online cleanup error:', error);
      }
    });
  });

  return io;
};

const getOnlineUsers = async () => {
  if (!redis.isOpen) return Array.from(connectedUsers.keys());
  const userIds = await redis.sMembers('online:users');
  const activeUserIds = [];
  await Promise.all(userIds.map(async (userId) => {
    const socketsLeft = await redis.sCard(`online:user:${userId}:sockets`);
    if (socketsLeft > 0) {
      activeUserIds.push(userId);
    } else {
      await redis.sRem('online:users', userId);
    }
  }));
  return activeUserIds;
};

module.exports = { initSocket, getOnlineUsers };
