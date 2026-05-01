// src/controllers/chat.controller.js
const prisma = require('../config/prisma');
const logger = require('../utils/logger');

const BASIC_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '👏', '💯'];

const messageInclude = {
  sender: {
    select: { id: true, username: true, displayName: true, avatarUrl: true },
  },
  reactions: {
    include: {
      user: { select: { id: true, username: true, displayName: true } },
    },
    orderBy: { createdAt: 'asc' },
  },
};

const assertParticipant = async (chatId, userId) => {
  const participant = await prisma.chatParticipant.findUnique({
    where: { chatId_userId: { chatId, userId } },
  });

  return Boolean(participant);
};

const emitMessageUpdated = (req, chatId, message) => {
  const io = req.app.get('io');
  if (io) {
    io.to(`chat:${chatId}`).emit('message:updated', { chatId, message });
  }
};

const getChats = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const chats = await prisma.chat.findMany({
      where: {
        participants: { some: { userId } },
      },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { sender: { select: { id: true, username: true, displayName: true } } },
        },
        _count: {
          select: {
            messages: {
              where: { isRead: false, senderId: { not: userId } },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const formattedChats = chats.map((chat) => ({
      id: chat.id,
      name: chat.name,
      isGroup: chat.isGroup,
      updatedAt: chat.updatedAt,
      unreadCount: chat._count.messages,
      lastMessage: chat.messages[0] || null,
      participants: chat.participants.map((p) => p.user),
      otherUser: chat.isGroup
        ? null
        : chat.participants.find((p) => p.userId !== userId)?.user || null,
    }));

    res.json({ chats: formattedChats });
  } catch (error) {
    next(error);
  }
};

const createOrGetChat = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { targetUserId } = req.body;

    if (userId === targetUserId) {
      return res.status(400).json({ error: 'Нельзя создать чат с собой' });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, username: true, displayName: true, avatarUrl: true },
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    // Check if direct chat already exists
    const existingChat = await prisma.chat.findFirst({
      where: {
        isGroup: false,
        AND: [
          { participants: { some: { userId } } },
          { participants: { some: { userId: targetUserId } } },
        ],
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (existingChat) {
      return res.json({ chat: existingChat, created: false });
    }

    const newChat = await prisma.chat.create({
      data: {
        isGroup: false,
        participants: {
          create: [{ userId }, { userId: targetUserId }],
        },
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
          },
        },
        messages: true,
      },
    });

    logger.info(`Chat created between ${userId} and ${targetUserId}`);
    res.status(201).json({ chat: newChat, created: true });
  } catch (error) {
    next(error);
  }
};

const createGroupChat = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const name = req.body.name?.trim();
    const participantIds = [...new Set([...(req.body.participantIds || []), userId])];

    if (!name || name.length < 2) {
      return res.status(400).json({ error: 'Название группы минимум 2 символа' });
    }
    if (participantIds.length < 3) {
      return res.status(400).json({ error: 'Для группы нужно минимум 3 участника включая вас' });
    }

    const usersCount = await prisma.user.count({
      where: { id: { in: participantIds }, isCommunity: false },
    });
    if (usersCount !== participantIds.length) {
      return res.status(400).json({ error: 'Один из участников не найден' });
    }

    const chat = await prisma.chat.create({
      data: {
        name,
        isGroup: true,
        participants: {
          create: participantIds.map((participantId) => ({ userId: participantId })),
        },
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { sender: { select: { id: true, username: true, displayName: true } } },
        },
      },
    });

    logger.info(`Group chat created by ${userId}: ${chat.id}`);
    res.status(201).json({
      chat: {
        id: chat.id,
        name: chat.name,
        isGroup: chat.isGroup,
        updatedAt: chat.updatedAt,
        unreadCount: 0,
        lastMessage: chat.messages[0] || null,
        participants: chat.participants.map((p) => p.user),
        otherUser: null,
      },
      created: true,
    });
  } catch (error) {
    next(error);
  }
};

const getMessages = async (req, res, next) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.id;
    const { cursor, limit = 50 } = req.query;

    if (!(await assertParticipant(chatId, userId))) {
      return res.status(403).json({ error: 'Нет доступа к этому чату' });
    }

    const parsedLimit = Math.min(parseInt(limit) || 50, 100);

    const messages = await prisma.message.findMany({
      where: {
        chatId,
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      include: messageInclude,
      orderBy: { createdAt: 'desc' },
      take: parsedLimit,
    });

    // Mark messages as read
    await prisma.message.updateMany({
      where: { chatId, senderId: { not: userId }, isRead: false },
      data: { isRead: true },
    });

    const reversed = messages.reverse();
    const nextCursor = messages.length === parsedLimit ? messages[0]?.createdAt?.toISOString() : null;

    res.json({ messages: reversed, nextCursor });
  } catch (error) {
    next(error);
  }
};

const sendMessage = async (req, res, next) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.id;
    const { content } = req.body;
    const imageUrl = req.file?.path || null;

    if (!(await assertParticipant(chatId, userId))) {
      return res.status(403).json({ error: 'Нет доступа к этому чату' });
    }

    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: { participants: true },
    });

    const receiverId = chat.isGroup
      ? null
      : chat.participants.find((p) => p.userId !== userId)?.userId || null;

    const message = await prisma.message.create({
      data: { chatId, senderId: userId, receiverId, content, imageUrl },
      include: messageInclude,
    });

    await prisma.chat.update({
      where: { id: chatId },
      data: { updatedAt: new Date() },
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`chat:${chatId}`).emit('message:new', { message, chatId });
      chat.participants.forEach((participant) => {
        if (participant.userId !== userId) {
          io.to(`user:${participant.userId}`).emit('chat:notification', {
            chatId,
            message,
            from: message.sender,
          });
        }
      });
    }

    res.status(201).json({ message });
  } catch (error) {
    next(error);
  }
};

const editMessage = async (req, res, next) => {
  try {
    const { chatId, messageId } = req.params;
    const userId = req.user.id;
    const content = req.body.content?.trim();

    if (!content || content.length > 1000) {
      return res.status(400).json({ error: 'Сообщение 1-1000 символов' });
    }

    if (!(await assertParticipant(chatId, userId))) {
      return res.status(403).json({ error: 'Нет доступа к этому чату' });
    }

    const existing = await prisma.message.findFirst({
      where: { id: messageId, chatId },
      select: { id: true, senderId: true },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Сообщение не найдено' });
    }
    if (existing.senderId !== userId) {
      return res.status(403).json({ error: 'Можно редактировать только свои сообщения' });
    }

    const message = await prisma.message.update({
      where: { id: messageId },
      data: { content, editedAt: new Date() },
      include: messageInclude,
    });

    emitMessageUpdated(req, chatId, message);
    res.json({ message });
  } catch (error) {
    next(error);
  }
};

const deleteMessage = async (req, res, next) => {
  try {
    const { chatId, messageId } = req.params;
    const userId = req.user.id;

    if (!(await assertParticipant(chatId, userId))) {
      return res.status(403).json({ error: 'Нет доступа к этому чату' });
    }

    const existing = await prisma.message.findFirst({
      where: { id: messageId, chatId },
      select: { id: true, senderId: true },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Сообщение не найдено' });
    }
    if (existing.senderId !== userId) {
      return res.status(403).json({ error: 'Можно удалить только свои сообщения' });
    }

    await prisma.message.delete({ where: { id: messageId } });

    const io = req.app.get('io');
    if (io) {
      io.to(`chat:${chatId}`).emit('message:deleted', { chatId, messageId });
    }

    res.json({ messageId });
  } catch (error) {
    next(error);
  }
};

const toggleReaction = async (req, res, next) => {
  try {
    const { chatId, messageId } = req.params;
    const userId = req.user.id;
    const emoji = req.body.emoji;

    if (!BASIC_EMOJIS.includes(emoji)) {
      return res.status(400).json({ error: 'Такой реакции нет в базовом наборе' });
    }

    if (!(await assertParticipant(chatId, userId))) {
      return res.status(403).json({ error: 'Нет доступа к этому чату' });
    }

    const messageExists = await prisma.message.findFirst({
      where: { id: messageId, chatId },
      select: { id: true },
    });

    if (!messageExists) {
      return res.status(404).json({ error: 'Сообщение не найдено' });
    }

    const existing = await prisma.messageReaction.findUnique({
      where: { messageId_userId_emoji: { messageId, userId, emoji } },
    });

    if (existing) {
      await prisma.messageReaction.delete({ where: { id: existing.id } });
    } else {
      await prisma.messageReaction.create({ data: { messageId, userId, emoji } });
    }

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: messageInclude,
    });

    emitMessageUpdated(req, chatId, message);
    res.json({ message });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getChats,
  createOrGetChat,
  createGroupChat,
  getMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  toggleReaction,
};
