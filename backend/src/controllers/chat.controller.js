// src/controllers/chat.controller.js
const prisma = require('../config/prisma');
const logger = require('../utils/logger');

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
          include: {
            sender: { select: { id: true, username: true, displayName: true } },
          },
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

const getMessages = async (req, res, next) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.id;
    const { cursor, limit = 50 } = req.query;

    const participant = await prisma.chatParticipant.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });

    if (!participant) {
      return res.status(403).json({ error: 'Нет доступа к этому чату' });
    }

    const parsedLimit = Math.min(parseInt(limit) || 50, 100);

    const messages = await prisma.message.findMany({
      where: {
        chatId,
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      include: {
        sender: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
      },
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

    const participant = await prisma.chatParticipant.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });

    if (!participant) {
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
      include: {
        sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    });

    await prisma.chat.update({
      where: { id: chatId },
      data: { updatedAt: new Date() },
    });

    res.status(201).json({ message });
  } catch (error) {
    next(error);
  }
};

module.exports = { getChats, createOrGetChat, getMessages, sendMessage };
