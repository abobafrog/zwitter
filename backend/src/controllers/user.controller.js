// src/controllers/user.controller.js
const prisma = require('../config/prisma');
const bcrypt = require('bcryptjs');
const { createNotification } = require('../services/notification.service');
const { tweetSelect, withThreadReplyCounts } = require('./tweet.controller');
const getProfile = async (req, res, next) => {
  try {
    const { username } = req.params;
    const viewerId = req.user?.id;

    const user = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      select: {
        id: true, username: true, displayName: true,
        bio: true, avatarUrl: true, bannerUrl: true,
        birthDate: true, isVerified: true, isCommunity: true, createdAt: true,
        _count: { select: { tweets: true, following: true, followers: true } },
        followers: viewerId ? { where: { followerId: viewerId }, select: { id: true } } : false,
      },
    });

    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    const isFollowing = viewerId ? user.followers?.length > 0 : false;
    const { followers, ...rest } = user;
    res.json({ user: { ...rest, isFollowing } });
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
      await prisma.follow.delete({ where: { id: existing.id } });
      return res.json({ following: false });
    }

    await prisma.follow.create({ data: { followerId, followingId } });
    await createNotification({ req, userId: followingId, fromId: followerId, type: 'follow' });
    res.json({ following: true });
  } catch (error) {
    next(error);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const { displayName, bio, username, birthDate } = req.body;
    const avatarUrl = req.files?.avatar?.[0]?.path;
    const bannerUrl = req.files?.banner?.[0]?.path;

    const data = {};
    if (displayName !== undefined) data.displayName = displayName;
    if (bio !== undefined) data.bio = bio;
    if (birthDate !== undefined) data.birthDate = birthDate;
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
        birthDate: true, isVerified: true, isCommunity: true,
      },
    });

    res.json({ user });
  } catch (error) {
    next(error);
  }
};

const searchUsers = async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 1) return res.json({ users: [] });

    const users = await prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: q.toLowerCase(), mode: 'insensitive' } },
          { displayName: { contains: q, mode: 'insensitive' } },
        ],
        isCommunity: false,
        NOT: { id: req.user.id },
      },
      select: {
        id: true, username: true, displayName: true, avatarUrl: true, isVerified: true, isCommunity: true,
      },
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

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Неверный текущий пароль' });

    const existing = await prisma.user.findUnique({ where: { email: newEmail.toLowerCase() } });
    if (existing) return res.status(409).json({ error: 'Этот email уже занят' });

    await prisma.user.update({
      where: { id: req.user.id },
      data: { email: newEmail.toLowerCase() },
    });

    res.json({ email: newEmail.toLowerCase() });
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

module.exports = { 
  getProfile, 
  updateProfile, 
  followUser, 
  searchUsers, 
  updateEmail, 
  updatePassword, 
  getUserTweets,
  getFollowers,
  getFollowing,
  deleteAccount
};
