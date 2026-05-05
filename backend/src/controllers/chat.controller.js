// src/controllers/chat.controller.js
const prisma = require('../config/prisma');
const logger = require('../utils/logger');
const { enqueue } = require('../queues');

const BASIC_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '👏', '💯'];
const isCallSystemMessage = (message) => message?.content?.startsWith('Звонок начался');

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

const emitMessageUpdated = (req, chatId, message) => {
  const io = req.app.get('io');
  if (io) {
    io.to(`chat:${chatId}`).emit('message:updated', { chatId, message });
  }
};

const chatParticipantInclude = {
  participants: {
    orderBy: { joinedAt: 'asc' },
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
};

const formatChat = (chat, userId, unreadCount = 0) => ({
  id: chat.id,
  name: chat.name,
  description: chat.description,
  avatarUrl: chat.avatarUrl,
  ownerId: chat.ownerId,
  isGroup: chat.isGroup,
  updatedAt: chat.updatedAt,
  unreadCount,
  lastMessage: chat.messages?.[0] || null,
  participants: chat.participants.map((p) => ({
    ...p.user,
    role: p.userId === chat.ownerId ? 'owner' : p.role || 'member',
  })),
  otherUser: chat.isGroup
    ? null
    : (() => {
        const other = chat.participants.find((p) => p.userId !== userId);
        return other ? { ...other.user, role: other.userId === chat.ownerId ? 'owner' : other.role || 'member' } : null;
      })(),
});

const emitChatUpdated = (req, chat) => {
  const io = req.app.get('io');
  if (io) {
    chat.participants.forEach((participant) => {
      const participantUserId = participant.userId || participant.id;
      io.to(`user:${participantUserId}`).emit('chat:updated', { chatId: chat.id, chat });
    });
  }
};

const getParticipantRole = (chat, userId) => {
  const ownerId = chat.ownerId || chat.participants[0]?.userId;
  if (ownerId === userId) return 'owner';
  return chat.participants.find((participant) => participant.userId === userId)?.role || null;
};

const assertGroupOwner = async (chatId, userId) => {
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    include: { participants: { orderBy: { joinedAt: 'asc' } } },
  });

  if (!chat || !chat.isGroup) return { error: 'Группа не найдена', status: 404 };
  const isParticipant = chat.participants.some((participant) => participant.userId === userId);
  if (!isParticipant) return { error: 'Нет доступа к этой группе', status: 403 };
  const ownerId = chat.ownerId || chat.participants[0]?.userId;
  if (ownerId !== userId) return { error: 'Управлять группой может только создатель', status: 403 };

  return { chat, ownerId };
};

const assertGroupManager = async (chatId, userId) => {
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    include: { participants: { orderBy: { joinedAt: 'asc' } } },
  });

  if (!chat || !chat.isGroup) return { error: 'Группа не найдена', status: 404 };
  const role = getParticipantRole(chat, userId);
  if (!role) return { error: 'Нет доступа к этой группе', status: 403 };
  if (!['owner', 'admin'].includes(role)) {
    return { error: 'Нужны права администратора группы', status: 403 };
  }

  return { chat, ownerId: chat.ownerId || chat.participants[0]?.userId, role };
};

const getFormattedChat = async (chatId, userId) => {
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    include: chatParticipantInclude,
  });
  return chat ? formatChat(chat, userId) : null;
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

    const formattedChats = chats.map((chat) => formatChat(chat, userId, chat._count.messages));

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
      select: { id: true, username: true, displayName: true, avatarUrl: true, messagePrivacy: true },
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    if (!(await canSendDirectMessage(userId, targetUserId))) {
      return res.status(403).json({ error: 'Пользователь ограничил входящие сообщения' });
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
    if (participantIds.length < 2) {
      return res.status(400).json({ error: 'Для группы нужен минимум 1 участник кроме вас' });
    }

    const users = await prisma.user.findMany({
      where: { id: { in: participantIds }, isCommunity: false },
      select: { id: true, username: true, displayName: true, blockGroupInvites: true },
    });
    if (users.length !== participantIds.length) {
      return res.status(400).json({ error: 'Один из участников не найден' });
    }

    const blockedUsers = users.filter((participant) => participant.id !== userId && participant.blockGroupInvites);
    if (blockedUsers.length > 0) {
      const names = blockedUsers.map((participant) => participant.displayName || `@${participant.username}`).join(', ');
      return res.status(403).json({ error: `${names} запретил добавление в группы` });
    }

    const chat = await prisma.chat.create({
      data: {
        name,
        ownerId: userId,
        isGroup: true,
        participants: {
          create: participantIds.map((participantId) => ({
            userId: participantId,
            role: participantId === userId ? 'owner' : 'member',
          })),
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
      chat: formatChat(chat, userId),
      created: true,
    });
  } catch (error) {
    next(error);
  }
};

const updateGroupChat = async (req, res, next) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.id;
    const access = await assertGroupManager(chatId, userId);
    if (access.error) return res.status(access.status).json({ error: access.error });

    const name = req.body.name?.trim();
    const description = req.body.description?.trim();
    const data = {};

    if (name !== undefined) {
      if (name.length < 2 || name.length > 100) {
        return res.status(400).json({ error: 'Название группы 2-100 символов' });
      }
      data.name = name;
    }
    if (description !== undefined) data.description = description || null;
    if (req.file?.path) data.avatarUrl = req.file.path;

    await prisma.chat.update({ where: { id: chatId }, data });
    const chat = await getFormattedChat(chatId, userId);
    emitChatUpdated(req, chat);
    res.json({ chat });
  } catch (error) {
    next(error);
  }
};

const addGroupParticipants = async (req, res, next) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.id;
    const participantIds = [...new Set(req.body.participantIds || [])];
    const access = await assertGroupManager(chatId, userId);
    if (access.error) return res.status(access.status).json({ error: access.error });
    if (participantIds.length === 0) return res.status(400).json({ error: 'Выберите участников' });

    const users = await prisma.user.findMany({
      where: { id: { in: participantIds }, isCommunity: false },
      select: { id: true, username: true, displayName: true, blockGroupInvites: true },
    });
    if (users.length !== participantIds.length) {
      return res.status(400).json({ error: 'Один из пользователей не найден' });
    }

    const blockedUsers = users.filter((participant) => participant.blockGroupInvites);
    if (blockedUsers.length > 0) {
      const names = blockedUsers.map((participant) => participant.displayName || `@${participant.username}`).join(', ');
      return res.status(403).json({ error: `${names} запретил добавление в группы` });
    }

    await prisma.chatParticipant.createMany({
      data: participantIds.map((participantId) => ({ chatId, userId: participantId })),
      skipDuplicates: true,
    });

    const chat = await getFormattedChat(chatId, userId);
    emitChatUpdated(req, chat);
    res.json({ chat });
  } catch (error) {
    next(error);
  }
};

const removeGroupParticipant = async (req, res, next) => {
  try {
    const { chatId, userId: targetUserId } = req.params;
    const userId = req.user.id;
    const access = await assertGroupManager(chatId, userId);
    if (access.error) return res.status(access.status).json({ error: access.error });
    if (targetUserId === access.ownerId) {
      return res.status(400).json({ error: 'Создателя группы нельзя удалить из участников' });
    }
    const targetParticipant = access.chat.participants.find((participant) => participant.userId === targetUserId);
    const targetRole = targetUserId === access.ownerId ? 'owner' : targetParticipant?.role || 'member';
    if (access.role !== 'owner' && targetRole === 'admin') {
      return res.status(403).json({ error: 'Только создатель может удалить администратора' });
    }

    await prisma.chatParticipant.deleteMany({ where: { chatId, userId: targetUserId } });
    const chat = await getFormattedChat(chatId, userId);
    emitChatUpdated(req, chat);
    res.json({ chat });
  } catch (error) {
    next(error);
  }
};

const updateGroupParticipantRole = async (req, res, next) => {
  try {
    const { chatId, userId: targetUserId } = req.params;
    const ownerId = req.user.id;
    const { role } = req.body;
    const access = await assertGroupOwner(chatId, ownerId);
    if (access.error) return res.status(access.status).json({ error: access.error });
    if (targetUserId === access.ownerId) {
      return res.status(400).json({ error: 'Создателя группы нельзя перевести в другую роль' });
    }

    const participant = access.chat.participants.find((item) => item.userId === targetUserId);
    if (!participant) {
      return res.status(404).json({ error: 'Участник не найден' });
    }

    await prisma.chatParticipant.update({
      where: { chatId_userId: { chatId, userId: targetUserId } },
      data: { role: role === 'admin' ? 'admin' : 'member' },
    });

    const chat = await getFormattedChat(chatId, ownerId);
    emitChatUpdated(req, chat);
    res.json({ chat });
  } catch (error) {
    next(error);
  }
};

const deleteGroupChat = async (req, res, next) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.id;
    const access = await assertGroupOwner(chatId, userId);
    if (access.error) return res.status(access.status).json({ error: access.error });

    await prisma.chat.delete({ where: { id: chatId } });
    const io = req.app.get('io');
    if (io) {
      access.chat.participants.forEach((participant) => {
        io.to(`user:${participant.userId}`).emit('chat:deleted', { chatId });
      });
    }
    res.json({ chatId });
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
    const rawContent = req.body.content?.trim() || '';
    const file = req.file || null;
    const isImage = file?.mimetype?.startsWith('image/');
    const imageUrl = isImage ? file.path : null;
    const content = file && !isImage
      ? [rawContent, `[[file:${file.originalname}|${file.path}]]`].filter(Boolean).join('\n\n')
      : rawContent;

    if (!content && !imageUrl) {
      return res.status(400).json({ error: 'Сообщение должно содержать текст, фото или вложение' });
    }

    if (!(await assertParticipant(chatId, userId))) {
      return res.status(403).json({ error: 'Нет доступа к этому чату' });
    }

    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: { participants: { include: { user: { select: { notifyMessages: true } } } } },
    });

    const receiverId = chat.isGroup
      ? null
      : chat.participants.find((p) => p.userId !== userId)?.userId || null;
    if (receiverId && !(await canSendDirectMessage(userId, receiverId))) {
      return res.status(403).json({ error: 'Пользователь ограничил входящие сообщения' });
    }

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
        if (participant.userId !== userId && participant.user?.notifyMessages !== false) {
          io.to(`user:${participant.userId}`).emit('chat:notification', {
            chatId,
            message,
            from: message.sender,
          });
        }
      });
    }
    if (imageUrl && process.env.JOB_QUEUE_ENABLED !== 'false') {
      enqueue('media', 'messageImageUploaded', { messageId: message.id, imageUrl })
        .catch((error) => logger.warn(`Media queue skipped: ${error.message}`));
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
      select: { id: true, senderId: true, content: true },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Сообщение не найдено' });
    }
    if (isCallSystemMessage(existing)) {
      return res.status(403).json({ error: 'Системное сообщение звонка нельзя изменять' });
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
      select: { id: true, senderId: true, content: true },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Сообщение не найдено' });
    }
    if (isCallSystemMessage(existing)) {
      return res.status(403).json({ error: 'Системное сообщение звонка нельзя удалить' });
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
  updateGroupChat,
  addGroupParticipants,
  removeGroupParticipant,
  updateGroupParticipantRole,
  deleteGroupChat,
  getMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  toggleReaction,
};
