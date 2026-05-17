// src/controllers/user.controller.js
const prisma = require('../config/prisma');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { createNotification } = require('../services/notification.service');
const { sendEmailChangeVerification } = require('../services/mail.service');
const { enqueue } = require('../queues');
const logger = require('../utils/logger');
const { tweetSelect, withThreadReplyCounts } = require('./tweet.controller');
const { redis } = require('../config/redis');
const { isAdmin } = require('../utils/moderation');

const EMAIL_CHANGE = 'email_change';
const emailChangeTtlMinutes = parseInt(process.env.EMAIL_CHANGE_TTL_MINUTES, 10) || 30;
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const createVerificationCode = () => crypto.randomInt(100000, 1000000).toString();
const invalidateExploreCache = () => {
  if (redis.isOpen) redis.del('explore:response:v2:anon').catch(() => {});
};

const settingsSelect = {
  blockGroupInvites: true,
  messagePrivacy: true,
  notifyLikes: true,
  notifyReplies: true,
  notifyRetweets: true,
  notifyFollows: true,
  notifyMessages: true,
};

const parseBooleanSetting = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  return Boolean(value);
};

const reportSelect = {
  id: true,
  reason: true,
  details: true,
  status: true,
  adminNote: true,
  createdAt: true,
  reviewedAt: true,
  reporter: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
  targetUser: { select: { id: true, username: true, displayName: true, avatarUrl: true, isBanned: true } },
  reviewedBy: { select: { id: true, username: true, displayName: true } },
};

const getProfile = async (req, res, next) => {
  try {
    const { username } = req.params;
    const viewerId = req.user?.id;
    const viewerIsAdmin = isAdmin(req.user);

    const user = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      select: {
        id: true, username: true, displayName: true,
        bio: true, avatarUrl: true, bannerUrl: true,
        birthDate: true, isVerified: true, isCommunity: true, role: true, isBanned: true, bannedAt: true, banReason: true, ...settingsSelect, createdAt: true,
        _count: { select: { tweets: true, following: true, followers: true } },
        followers: viewerId ? { where: { followerId: viewerId }, select: { id: true } } : false,
      },
    });

    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    const isFollowing = viewerId ? user.followers?.length > 0 : false;
    const { followers, ...rest } = user;
    const isSelf = viewerId === user.id;
    res.json({
      user: {
        ...rest,
        isFollowing,
        banReason: viewerIsAdmin || isSelf ? rest.banReason : null,
        bannedAt: viewerIsAdmin || isSelf ? rest.bannedAt : null,
        role: viewerIsAdmin || isSelf ? rest.role : 'user',
      },
    });
  } catch (error) {
    next(error);
  }
};



const followUser = async (req, res, next) => {
  try {
    const { id: followingId } = req.params;
    const followerId = req.user.id;

    if (followerId === followingId) {
      return res.status(400).json({ error: 'Нельзя подписаться на себя' });
    }

    const target = await prisma.user.findUnique({ where: { id: followingId } });
    if (!target) return res.status(404).json({ error: 'Пользователь не найден' });

    const existing = await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
    });

    if (existing) {
      await prisma.$transaction([
        prisma.follow.delete({ where: { id: existing.id } }),
        prisma.user.update({ where: { id: followerId }, data: { followingCount: { decrement: 1 } } }),
        prisma.user.update({ where: { id: followingId }, data: { followersCount: { decrement: 1 } } }),
      ]);
      invalidateExploreCache();
      return res.json({ following: false });
    }

    await prisma.$transaction([
      prisma.follow.create({ data: { followerId, followingId } }),
      prisma.user.update({ where: { id: followerId }, data: { followingCount: { increment: 1 } } }),
      prisma.user.update({ where: { id: followingId }, data: { followersCount: { increment: 1 } } }),
    ]);
    invalidateExploreCache();
    await createNotification({ req, userId: followingId, fromId: followerId, type: 'follow' });
    res.json({ following: true });
  } catch (error) {
    next(error);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const {
      displayName,
      bio,
      username,
      birthDate,
      blockGroupInvites,
      messagePrivacy,
      notifyLikes,
      notifyReplies,
      notifyRetweets,
      notifyFollows,
      notifyMessages,
    } = req.body;
    const avatarUrl = req.files?.avatar?.[0]?.path;
    const bannerUrl = req.files?.banner?.[0]?.path;

    const data = {};
    if (displayName !== undefined) data.displayName = displayName;
    if (bio !== undefined) data.bio = bio;
    if (birthDate !== undefined) data.birthDate = birthDate;
    if (blockGroupInvites !== undefined) data.blockGroupInvites = parseBooleanSetting(blockGroupInvites);
    if (messagePrivacy !== undefined) {
      if (!['everyone', 'following', 'none'].includes(messagePrivacy)) {
        return res.status(400).json({ error: 'Некорректная настройка сообщений' });
      }
      data.messagePrivacy = messagePrivacy;
    }
    if (notifyLikes !== undefined) data.notifyLikes = parseBooleanSetting(notifyLikes);
    if (notifyReplies !== undefined) data.notifyReplies = parseBooleanSetting(notifyReplies);
    if (notifyRetweets !== undefined) data.notifyRetweets = parseBooleanSetting(notifyRetweets);
    if (notifyFollows !== undefined) data.notifyFollows = parseBooleanSetting(notifyFollows);
    if (notifyMessages !== undefined) data.notifyMessages = parseBooleanSetting(notifyMessages);
    if (avatarUrl) data.avatarUrl = avatarUrl;
    if (bannerUrl) data.bannerUrl = bannerUrl;

    if (username) {
      const existing = await prisma.user.findFirst({
        where: { username: username.toLowerCase(), NOT: { id: req.user.id } },
      });
      if (existing) return res.status(409).json({ error: 'Никнейм уже занят' });
      data.username = username.toLowerCase();
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data,
      select: {
        id: true, username: true, displayName: true,
        bio: true, avatarUrl: true, bannerUrl: true,
        birthDate: true, isVerified: true, isCommunity: true, ...settingsSelect,
      },
    });
    if ((avatarUrl || bannerUrl) && process.env.JOB_QUEUE_ENABLED !== 'false') {
      enqueue('media', 'profileMediaUploaded', { userId: req.user.id, avatarUrl, bannerUrl })
        .catch((error) => logger.warn(`Media queue skipped: ${error.message}`));
    }

    res.json({ user });
  } catch (error) {
    next(error);
  }
};

const searchUsers = async (req, res, next) => {
  try {
    const q = (req.query.q || '').toString().trim();
    const includeSelf = ['1', 'true', 'yes'].includes((req.query.includeSelf || '').toString().toLowerCase());
    if (!q) return res.json({ users: [] });

    const users = await prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: q, mode: 'insensitive' } },
          { displayName: { contains: q, mode: 'insensitive' } },
          { bio: { contains: q, mode: 'insensitive' } },
        ],
        isCommunity: false,
        ...(includeSelf ? {} : { NOT: { id: req.user.id } }),
      },
      select: {
        id: true, username: true, displayName: true, bio: true, avatarUrl: true, isVerified: true, isCommunity: true, blockGroupInvites: true,
        _count: { select: { followers: true, tweets: true } },
      },
      orderBy: [{ followers: { _count: 'desc' } }, { createdAt: 'desc' }],
      take: 10,
    });

    res.json({ users });
  } catch (error) {
    next(error);
  }
};
const getFollowers = async (req, res, next) => {
  try {
    const { username } = req.params;
    const user = await prisma.user.findUnique({ 
      where: { username: username.toLowerCase() } 
    });
    if (!user) return res.status(404).json({ error: 'Не найден' });

    const followers = await prisma.follow.findMany({
      where: { followingId: user.id },
      include: {
        follower: { 
          select: { id: true, username: true, displayName: true, avatarUrl: true, bio: true, isCommunity: true } 
        },
      },
    });

    res.json({ users: followers.map((f) => f.follower) });
  } catch (error) { 
    next(error); 
  }
};

const getFollowing = async (req, res, next) => {
  try {
    const { username } = req.params;
    const user = await prisma.user.findUnique({ 
      where: { username: username.toLowerCase() } 
    });
    if (!user) return res.status(404).json({ error: 'Не найден' });

    const following = await prisma.follow.findMany({
      where: { followerId: user.id },
      include: {
        following: { 
          select: { id: true, username: true, displayName: true, avatarUrl: true, bio: true, isCommunity: true } 
        },
      },
    });

    res.json({ users: following.map((f) => f.following) });
  } catch (error) { 
    next(error); 
  }
};
const updateEmail = async (req, res, next) => {
  try {
    const { newEmail, currentPassword } = req.body;
    const normalizedEmail = newEmail?.trim().toLowerCase();
    if (!normalizedEmail) return res.status(400).json({ error: 'Укажи новый email' });

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Неверный текущий пароль' });
    if (normalizedEmail === user.email) {
      return res.status(400).json({ error: 'Новый email совпадает с текущим' });
    }

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) return res.status(409).json({ error: 'Этот email уже занят' });

    const code = createVerificationCode();
    await prisma.accountToken.deleteMany({ where: { userId: user.id, type: EMAIL_CHANGE } });
    await prisma.accountToken.create({
      data: {
        userId: user.id,
        type: EMAIL_CHANGE,
        tokenHash: hashToken(`${user.id}:${normalizedEmail}:${code}`),
        payload: JSON.stringify({ email: normalizedEmail }),
        expiresAt: new Date(Date.now() + emailChangeTtlMinutes * 60 * 1000),
      },
    });

    const result = await sendEmailChangeVerification({
      to: normalizedEmail,
      displayName: user.displayName,
      code,
    });

    res.json({
      pendingEmail: normalizedEmail,
      emailSent: result.sent,
      message: result.sent
        ? 'Код подтверждения отправлен на новый email'
        : 'Запрос создан, но письмо не отправилось. Проверь настройки почты.',
    });
  } catch (error) {
    next(error);
  }
};

const confirmEmailUpdate = async (req, res, next) => {
  try {
    const newEmail = req.body.newEmail?.trim().toLowerCase();
    const code = req.body.code?.trim();
    if (!newEmail || !code) return res.status(400).json({ error: 'Укажи новый email и код' });

    const existing = await prisma.user.findUnique({ where: { email: newEmail } });
    if (existing && existing.id !== req.user.id) return res.status(409).json({ error: 'Этот email уже занят' });

    const tokenHash = hashToken(`${req.user.id}:${newEmail}:${code}`);
    const record = await prisma.accountToken.findUnique({ where: { tokenHash } });
    if (!record || record.userId !== req.user.id || record.type !== EMAIL_CHANGE) {
      return res.status(400).json({ error: 'Код подтверждения недействителен' });
    }
    if (record.expiresAt < new Date()) {
      await prisma.accountToken.delete({ where: { id: record.id } }).catch(() => {});
      return res.status(400).json({ error: 'Код подтверждения истёк' });
    }

    const payload = JSON.parse(record.payload || '{}');
    if (payload.email !== newEmail) return res.status(400).json({ error: 'Код выпущен для другого email' });

    await prisma.$transaction([
      prisma.user.update({
        where: { id: req.user.id },
        data: { email: newEmail, emailVerified: true, emailVerifiedAt: new Date() },
      }),
      prisma.accountToken.deleteMany({ where: { userId: req.user.id, type: EMAIL_CHANGE } }),
    ]);

    res.json({ email: newEmail, message: 'Email изменён и подтверждён' });
  } catch (error) {
    next(error);
  }
};

const updatePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Неверный текущий пароль' });

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash },
    });

    res.json({ message: 'Пароль изменён' });
  } catch (error) {
    next(error);
  }
};
const getUserTweets = async (req, res, next) => {
  try {
    const { username } = req.params;
    const viewerId = req.user?.id;
    const tab = req.query.tab === 'replies' ? 'replies' : 'tweets';

    const user = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      select: { id: true },
    });
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    if (tab === 'replies') {
      const replies = await prisma.tweet.findMany({
        where: { authorId: user.id, parentId: { not: null } },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: {
          ...tweetSelect(viewerId),
          parent: {
            select: {
              id: true,
              content: true,
              author: { select: { username: true, displayName: true } },
              community: { select: { slug: true, name: true } },
            },
          },
        },
      });

      await withThreadReplyCounts(replies);
      return res.json({ tweets: replies });
    }

    const tweets = await prisma.tweet.findMany({
      where: { authorId: user.id, parentId: null },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: tweetSelect(viewerId),
    });

    const retweets = await prisma.retweet.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: {
        tweet: { select: tweetSelect(viewerId) },
        user: { select: { username: true, displayName: true } },
      },
    });

    const retweetedTweets = retweets.map((rt) => ({
      ...rt.tweet,
      isRetweet: true,
      retweetedBy: rt.user,
      retweetedAt: rt.createdAt,
    }));

    const all = [...tweets, ...retweetedTweets].sort(
      (a, b) => new Date(b.retweetedAt || b.createdAt) - new Date(a.retweetedAt || a.createdAt)
    );

    await withThreadReplyCounts(all);
    res.json({ tweets: all });
  } catch (error) {
    next(error);
  }
};

const deleteAccount = async (req, res, next) => {
  try {
    const { currentPassword } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    const valid = await bcrypt.compare(currentPassword || '', user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Неверный текущий пароль' });

    await prisma.user.delete({ where: { id: req.user.id } });
    res.json({ message: 'Аккаунт удалён' });
  } catch (error) {
    next(error);
  }
};

const reportUser = async (req, res, next) => {
  try {
    const targetUserId = req.params.id;
    const reporterId = req.user.id;
    const reason = req.body.reason?.trim();
    const details = req.body.details?.trim() || null;

    if (!reason) return res.status(400).json({ error: 'Укажи причину жалобы' });
    if (targetUserId === reporterId) return res.status(400).json({ error: 'Нельзя пожаловаться на себя' });

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, username: true, role: true },
    });
    if (!targetUser) return res.status(404).json({ error: 'Пользователь не найден' });

    const report = await prisma.userReport.upsert({
      where: { reporterId_targetUserId: { reporterId, targetUserId } },
      update: { reason, details, status: 'open', adminNote: null, reviewedAt: null, reviewedById: null },
      create: { reporterId, targetUserId, reason, details },
      select: reportSelect,
    });

    res.status(201).json({ report, message: 'Жалоба на пользователя отправлена' });
  } catch (error) {
    next(error);
  }
};

const moderateUser = async (req, res, next) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ error: 'Только администратор может менять статус пользователя' });

    const targetUserId = req.params.id;
    const action = req.body.action === 'unban' ? 'unban' : 'ban';
    const reason = req.body.reason?.trim() || null;

    if (targetUserId === req.user.id) {
      return res.status(400).json({ error: 'Нельзя заблокировать самого себя' });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, role: true, isBanned: true },
    });
    if (!targetUser) return res.status(404).json({ error: 'Пользователь не найден' });
    if (targetUser.role === 'admin') return res.status(403).json({ error: 'Нельзя заблокировать другого администратора' });

    const user = await prisma.user.update({
      where: { id: targetUserId },
      data: action === 'ban'
        ? { isBanned: true, bannedAt: new Date(), banReason: reason || 'Аккаунт заблокирован администратором' }
        : { isBanned: false, bannedAt: null, banReason: null },
      select: {
        id: true, username: true, displayName: true, role: true, isBanned: true, bannedAt: true, banReason: true,
      },
    });

    await prisma.refreshToken.deleteMany({ where: { userId: targetUserId } });

    res.json({
      user,
      message: action === 'ban' ? 'Пользователь заблокирован' : 'Пользователь разблокирован',
    });
  } catch (error) {
    next(error);
  }
};

const listUserReports = async (req, res, next) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ error: 'Доступ только для администратора' });
    const status = req.query.status?.toString().trim() || 'open';

    const reports = await prisma.userReport.findMany({
      where: status === 'all' ? {} : { status },
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
      select: reportSelect,
    });

    res.json({ reports });
  } catch (error) {
    next(error);
  }
};

const reviewUserReport = async (req, res, next) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ error: 'Доступ только для администратора' });

    const status = req.body.status === 'rejected' ? 'rejected' : 'resolved';
    const adminNote = req.body.adminNote?.trim() || null;

    const report = await prisma.userReport.update({
      where: { id: req.params.id },
      data: {
        status,
        adminNote,
        reviewedAt: new Date(),
        reviewedById: req.user.id,
      },
      select: reportSelect,
    });

    res.json({ report, message: status === 'resolved' ? 'Жалоба обработана' : 'Жалоба отклонена' });
  } catch (error) {
    next(error);
  }
};

module.exports = { 
  getProfile, 
  updateProfile, 
  followUser, 
  searchUsers, 
  updateEmail, 
  confirmEmailUpdate,
  updatePassword, 
  getUserTweets,
  getFollowers,
  getFollowing,
  deleteAccount,
  reportUser,
  moderateUser,
  listUserReports,
  reviewUserReport,
};
