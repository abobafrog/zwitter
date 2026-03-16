// src/controllers/tweet.controller.js
const prisma = require('../config/prisma');
const logger = require('../utils/logger');

const tweetSelect = (userId) => ({
  id: true,
  content: true,
  imageUrl: true,
  createdAt: true,
  viewsCount: true,
  parentId: true,
  author: {
    select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true },
  },
  _count: { select: { likes: true, retweets: true, replies: true } },
  likes: userId ? { where: { userId }, select: { id: true } } : false,
  retweets: userId ? { where: { userId }, select: { id: true } } : false,
});

const getFeed = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { cursor, limit = 20 } = req.query;
    const parsedLimit = Math.min(parseInt(limit) || 20, 50);

    const tweets = await prisma.tweet.findMany({
      where: {
        parentId: null,
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      select: tweetSelect(userId),
      orderBy: { createdAt: 'desc' },
      take: parsedLimit,
    });
// После того как получили твиты — увеличиваем просмотры
// Записываем просмотры только для новых
if (tweets.length > 0 && req.user) {
  const tweetIds = tweets.map((t) => t.id);
  
  // Находим уже просмотренные этим пользователем
  const alreadyViewed = await prisma.tweetView.findMany({
    where: {
      tweetId: { in: tweetIds },
      userId: req.user.id,
    },
    select: { tweetId: true },
  });

  const alreadyViewedIds = new Set(alreadyViewed.map((v) => v.tweetId));
  const newIds = tweetIds.filter((id) => !alreadyViewedIds.has(id));

  if (newIds.length > 0) {
    // Создаём записи просмотров
    await prisma.tweetView.createMany({
      data: newIds.map((tweetId) => ({
        tweetId,
        userId: req.user.id,
      })),
      skipDuplicates: true,
    });

    // Увеличиваем счётчик только для новых просмотров
    await prisma.tweet.updateMany({
      where: { id: { in: newIds } },
      data: { viewsCount: { increment: 1 } },
    });
  }
}

const nextCursor = tweets.length === parsedLimit
  ? tweets[tweets.length - 1].createdAt.toISOString()
  : null;

res.json({ tweets, nextCursor });
} catch (error) {
  next(error);
}
};

const createTweet = async (req, res, next) => {
  try {
    const { content, parentId } = req.body;
    const imageUrl = req.file?.path || null;

    if (parentId) {
      const parent = await prisma.tweet.findUnique({ where: { id: parentId } });
      if (!parent) return res.status(404).json({ error: 'Твит не найден' });
    }

    const tweet = await prisma.tweet.create({
      data: { content, imageUrl, authorId: req.user.id, parentId: parentId || null },
      select: tweetSelect(req.user.id),
    });

    logger.info(`Tweet created by ${req.user.username}: ${tweet.id}`);
    res.status(201).json({ tweet });
  } catch (error) {
    next(error);
  }
};

const getTweet = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const tweet = await prisma.tweet.findUnique({
      where: { id },
      select: {
        ...tweetSelect(userId),
        replies: {
          select: tweetSelect(userId),
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!tweet) return res.status(404).json({ error: 'Твит не найден' });
    res.json({ tweet });
  } catch (error) {
    next(error);
  }
};

const deleteTweet = async (req, res, next) => {
  try {
    const { id } = req.params;
    const tweet = await prisma.tweet.findUnique({ where: { id } });

    if (!tweet) return res.status(404).json({ error: 'Твит не найден' });
    if (tweet.authorId !== req.user.id) return res.status(403).json({ error: 'Нет прав' });

    await prisma.tweet.delete({ where: { id } });
    res.json({ message: 'Твит удалён' });
  } catch (error) {
    next(error);
  }
};

const likeTweet = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const tweet = await prisma.tweet.findUnique({ where: { id } });
    if (!tweet) return res.status(404).json({ error: 'Твит не найден' });

    const existing = await prisma.like.findUnique({
      where: { userId_tweetId: { userId, tweetId: id } },
    });

    if (existing) {
      await prisma.like.delete({ where: { id: existing.id } });
      return res.json({ liked: false });
    }

    await prisma.like.create({ data: { userId, tweetId: id } });
    res.json({ liked: true });
  } catch (error) {
    next(error);
  }
};

const retweetTweet = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const tweet = await prisma.tweet.findUnique({ where: { id } });
    if (!tweet) return res.status(404).json({ error: 'Твит не найден' });

    const existing = await prisma.retweet.findUnique({
      where: { userId_tweetId: { userId, tweetId: id } },
    });

    if (existing) {
      await prisma.retweet.delete({ where: { id: existing.id } });
      return res.json({ retweeted: false });
    }

    await prisma.retweet.create({ data: { userId, tweetId: id } });
    res.json({ retweeted: true });
  } catch (error) {
    next(error);
  }
};

const bookmarkTweet = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
  } catch (error) {
    next(error);
  }
};

const searchTweets = async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q?.trim()) return res.json({ tweets: [] });

    const userId = req.user?.id;

    const tweets = await prisma.tweet.findMany({
      where: {
        content: { contains: q, mode: 'insensitive' },
        parentId: null,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: tweetSelect(userId),
    });

    res.json({ tweets });
  } catch (error) {
    next(error);
  }
};

module.exports = { getFeed, createTweet, getTweet, deleteTweet, likeTweet, retweetTweet, searchTweets };