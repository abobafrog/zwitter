// src/controllers/tweet.controller.js
const { Prisma } = require('@prisma/client');
const prisma = require('../config/prisma');
const logger = require('../utils/logger');
const { createNotification } = require('../services/notification.service');

const tweetSelect = (userId) => ({
  id: true,
  content: true,
  imageUrl: true,
  createdAt: true,
  viewsCount: true,
  parentId: true,
  communityId: true,
  author: {
    select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true, isCommunity: true },
  },
  community: {
    select: { id: true, slug: true, name: true, avatarUrl: true, isVerified: true },
  },
  parent: {
    select: {
      id: true,
      content: true,
      author: { select: { username: true, displayName: true } },
      community: { select: { slug: true, name: true } },
    },
  },
  _count: { select: { likes: true, retweets: true, replies: true, bookmarks: true } },
  likes: userId ? { where: { userId }, select: { id: true } } : false,
  retweets: userId ? { where: { userId }, select: { id: true } } : false,
  bookmarks: userId ? { where: { userId }, select: { id: true } } : false,
});

const markViewed = async (req, tweets) => {
  if (!tweets.length || !req.user) return;

  const tweetIds = [...new Set(tweets.map((t) => t.id))];
  const alreadyViewed = await prisma.tweetView.findMany({
    where: { tweetId: { in: tweetIds }, userId: req.user.id },
    select: { tweetId: true },
  });

  const alreadyViewedIds = new Set(alreadyViewed.map((v) => v.tweetId));
  const newIds = tweetIds.filter((id) => !alreadyViewedIds.has(id));
  if (!newIds.length) return;

  await prisma.tweetView.createMany({
    data: newIds.map((tweetId) => ({ tweetId, userId: req.user.id })),
    skipDuplicates: true,
  });

  await prisma.tweet.updateMany({
    where: { id: { in: newIds } },
    data: { viewsCount: { increment: 1 } },
  });
};

const formatPostsLabel = (count) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word = mod10 === 1 && mod100 !== 11
    ? 'пост'
    : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
      ? 'поста'
      : 'постов';

  return `${count} ${word}`;
};

const collectTweets = (items) => {
  const result = [];
  const visit = (item) => {
    if (!item) return;
    result.push(item);
    if (Array.isArray(item.replies)) item.replies.forEach(visit);
  };
  items.filter(Boolean).forEach(visit);
  return result;
};

const withThreadReplyCounts = async (items) => {
  const source = Array.isArray(items) ? items : [items];
  const tweets = collectTweets(source);
  const ids = [...new Set(tweets.map((tweet) => tweet.id).filter(Boolean))];
  if (!ids.length) return items;

  const rows = await prisma.$queryRaw`
    WITH RECURSIVE descendants(root_id, id) AS (
      SELECT parent_id AS root_id, id
      FROM tweets
      WHERE parent_id IN (${Prisma.join(ids)})
      UNION ALL
      SELECT descendants.root_id, tweets.id
      FROM tweets
      INNER JOIN descendants ON tweets.parent_id = descendants.id
    )
    SELECT root_id AS "rootId", COUNT(*)::int AS count
    FROM descendants
    GROUP BY root_id
  `;
  const counts = new Map(rows.map((row) => [row.rootId, row.count]));

  tweets.forEach((tweet) => {
    tweet._count = {
      ...(tweet._count || {}),
      replies: counts.get(tweet.id) || 0,
    };
  });

  return items;
};

const getFeed = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { cursor, limit = 20 } = req.query;
    const mode = (req.query.mode || req.query.filter || 'all').toString();
    const followingOnly = mode === 'following' || mode === 'subscriptions';
    const parsedLimit = Math.min(parseInt(limit, 10) || 20, 50);
    const cursorDate = cursor ? new Date(cursor) : null;

    let timelineUserIds = null;
    if (followingOnly) {
      if (!userId) return res.json({ tweets: [], nextCursor: null });

      const follows = await prisma.follow.findMany({
        where: { followerId: userId },
        select: { followingId: true },
      });
      timelineUserIds = [...new Set([userId, ...follows.map((follow) => follow.followingId)])];
    }

    const tweets = await prisma.tweet.findMany({
      where: {
        parentId: null,
        ...(timelineUserIds ? { authorId: { in: timelineUserIds } } : {}),
        ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
      },
      select: tweetSelect(userId),
      orderBy: { createdAt: 'desc' },
      take: parsedLimit,
    });

    const retweets = await prisma.retweet.findMany({
      where: {
        ...(timelineUserIds ? { userId: { in: timelineUserIds } } : {}),
        ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: parsedLimit,
      include: {
        tweet: { select: tweetSelect(userId) },
        user: { select: { username: true, displayName: true } },
      },
    });

    const retweetedTweets = retweets.map((rt) => ({
      ...rt.tweet,
      isRetweet: true,
      retweetedBy: rt.user,
      retweetedAt: rt.createdAt,
    }));

    const feedItems = [...tweets, ...retweetedTweets]
      .sort((a, b) => new Date(b.retweetedAt || b.createdAt) - new Date(a.retweetedAt || a.createdAt))
      .slice(0, parsedLimit);

    await markViewed(req, feedItems);
    await withThreadReplyCounts(feedItems);

    const nextCursor = feedItems.length === parsedLimit
      ? new Date(feedItems[feedItems.length - 1].retweetedAt || feedItems[feedItems.length - 1].createdAt).toISOString()
      : null;

    res.json({ tweets: feedItems, nextCursor });
  } catch (error) {
    next(error);
  }
};

const getExplore = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const rawTopic = (req.query.topic || req.query.q || '').toString().trim();
    const topicSeeds = [
      { name: 'Космос', keywords: ['космос', 'звезд', 'звёзд', 'орбит', 'галактик', 'планет'] },
      { name: 'Будущее', keywords: ['будущ', 'интерфейс', 'протокол', 'релиз'] },
      { name: 'Наука', keywords: ['наук', 'лаборатор', 'исслед', 'сигнал'] },
      { name: 'Искусство', keywords: ['арт', 'визуал', 'дизайн', 'кадр', 'баннер'] },
      { name: 'Технологии', keywords: ['ui', 'ux', 'чат', 'канал', 'мобильн'] },
    ];
    const matchedTopic = topicSeeds.find((topic) => topic.name.toLowerCase() === rawTopic.toLowerCase());
    const searchTerms = rawTopic
      ? [...new Set([rawTopic, ...(matchedTopic?.keywords || [])])]
      : [];

    const where = {
      parentId: null,
      ...(searchTerms.length
        ? { OR: searchTerms.map((term) => ({ content: { contains: term, mode: 'insensitive' } })) }
        : {}),
    };

    const userCardSelect = {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      bio: true,
      isVerified: true,
      isCommunity: true,
      _count: { select: { followers: true, tweets: true } },
      followers: userId ? { where: { followerId: userId }, select: { id: true } } : false,
    };

    const communityCardSelect = {
      id: true,
      slug: true,
      name: true,
      bio: true,
      avatarUrl: true,
      isVerified: true,
      _count: { select: { members: true, tweets: true } },
      members: userId ? { where: { userId }, select: { id: true, role: true } } : false,
    };

    const [tweets, users, communities, allTweets] = await Promise.all([
      prisma.tweet.findMany({
        where,
        select: tweetSelect(userId),
        orderBy: [{ viewsCount: 'desc' }, { createdAt: 'desc' }],
        take: 30,
      }),
      prisma.user.findMany({
        where: { isCommunity: false },
        orderBy: [{ followers: { _count: 'desc' } }, { createdAt: 'desc' }],
        take: 8,
        select: userCardSelect,
      }),
      prisma.community.findMany({
        orderBy: [{ members: { _count: 'desc' } }, { createdAt: 'desc' }],
        take: 8,
        select: communityCardSelect,
      }),
      prisma.tweet.findMany({ where: { parentId: null }, select: { content: true } }),
    ]);

    const corpus = allTweets.map((tweet) => tweet.content.toLowerCase());
    const trends = topicSeeds.map((topic) => {
      const count = corpus.filter((content) => topic.keywords.some((keyword) => content.includes(keyword))).length;
      return {
        name: topic.name,
        posts: count,
        label: formatPostsLabel(count),
      };
    }).sort((a, b) => b.posts - a.posts);

    const normalizedUsers = users.map(({ followers, ...user }) => ({
      ...user,
      isFollowing: userId ? followers.length > 0 : false,
    }));
    const normalizedCommunities = communities.map(({ members, _count, ...community }) => ({
      ...community,
      username: community.slug,
      displayName: community.name,
      isCommunity: true,
      isMember: userId ? members.length > 0 : false,
      memberRole: userId ? members[0]?.role || null : null,
      _count: { followers: _count.members, tweets: _count.tweets, members: _count.members },
    }));

    await markViewed(req, tweets);
    await withThreadReplyCounts(tweets);
    res.json({ tweets, users: normalizedUsers, communities: normalizedCommunities, trends });
  } catch (error) {
    next(error);
  }
};

const createTweet = async (req, res, next) => {
  try {
    const { content, parentId, communityId } = req.body;
    const imageUrl = req.file?.path || null;
    let parent = null;
    let community = null;

    if (parentId) {
      parent = await prisma.tweet.findUnique({ where: { id: parentId } });
      if (!parent) return res.status(404).json({ error: 'Твит не найден' });
    }

    if (communityId && !parentId) {
      community = await prisma.community.findUnique({
        where: { id: communityId },
        include: { members: { where: { userId: req.user.id }, select: { role: true } } },
      });
      if (!community) return res.status(404).json({ error: 'Сообщество не найдено' });

      const role = community.members[0]?.role;
      if (!['owner', 'admin'].includes(role)) {
        return res.status(403).json({ error: 'Публиковать от лица сообщества может владелец или админ' });
      }
    }

    const tweet = await prisma.tweet.create({
      data: {
        content,
        imageUrl,
        authorId: req.user.id,
        communityId: community?.id || null,
        parentId: parentId || null,
      },
      select: tweetSelect(req.user.id),
    });

    if (parent) {
      await createNotification({
        req,
        userId: parent.authorId,
        fromId: req.user.id,
        type: 'reply',
        tweetId: parent.id,
      });
    }

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
          take: 30,
        },
      },
    });

    if (!tweet) return res.status(404).json({ error: 'Твит не найден' });
    await markViewed(req, [tweet]);
    await withThreadReplyCounts(tweet);
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
    await createNotification({ req, userId: tweet.authorId, fromId: userId, type: 'like', tweetId: id });
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
    await createNotification({ req, userId: tweet.authorId, fromId: userId, type: 'retweet', tweetId: id });
    res.json({ retweeted: true });
  } catch (error) {
    next(error);
  }
};

const bookmarkTweet = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const tweet = await prisma.tweet.findUnique({ where: { id } });
    if (!tweet) return res.status(404).json({ error: 'Твит не найден' });

    const existing = await prisma.bookmark.findUnique({
      where: { userId_tweetId: { userId, tweetId: id } },
    });

    if (existing) {
      await prisma.bookmark.delete({ where: { id: existing.id } });
      return res.json({ bookmarked: false });
    }

    await prisma.bookmark.create({ data: { userId, tweetId: id } });
    res.json({ bookmarked: true });
  } catch (error) {
    next(error);
  }
};

const getBookmarks = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { cursor, limit = 20 } = req.query;
    const parsedLimit = Math.min(parseInt(limit, 10) || 20, 50);

    const bookmarks = await prisma.bookmark.findMany({
      where: {
        userId,
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: parsedLimit,
      include: { tweet: { select: tweetSelect(userId) } },
    });

    const tweets = bookmarks.map((bookmark) => ({
      ...bookmark.tweet,
      bookmarkedAt: bookmark.createdAt,
    }));

    const nextCursor = bookmarks.length === parsedLimit
      ? bookmarks[bookmarks.length - 1].createdAt.toISOString()
      : null;

    await withThreadReplyCounts(tweets);
    res.json({ tweets, nextCursor });
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
        content: { contains: q.trim(), mode: 'insensitive' },
        parentId: null,
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: tweetSelect(userId),
    });

    await withThreadReplyCounts(tweets);
    res.json({ tweets });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getFeed,
  getExplore,
  createTweet,
  getTweet,
  deleteTweet,
  likeTweet,
  retweetTweet,
  bookmarkTweet,
  getBookmarks,
  searchTweets,
  tweetSelect,
  withThreadReplyCounts,
};
