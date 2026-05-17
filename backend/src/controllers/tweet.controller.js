// src/controllers/tweet.controller.js
const { Prisma } = require('@prisma/client');
const prisma = require('../config/prisma');
const { redis } = require('../config/redis');
const logger = require('../utils/logger');
const { createNotification } = require('../services/notification.service');
const { enqueue } = require('../queues');
const { isAdmin } = require('../utils/moderation');

const topicSeeds = [
  { name: 'Космос', slug: 'space', keywords: ['космос', 'звезд', 'звёзд', 'орбит', 'галактик', 'планет'] },
  { name: 'Будущее', slug: 'future', keywords: ['будущ', 'интерфейс', 'протокол', 'релиз'] },
  { name: 'Наука', slug: 'science', keywords: ['наук', 'лаборатор', 'исслед', 'сигнал'] },
  { name: 'Искусство', slug: 'art', keywords: ['арт', 'визуал', 'дизайн', 'кадр', 'баннер'] },
  { name: 'Технологии', slug: 'technology', keywords: ['ui', 'ux', 'чат', 'канал', 'мобильн'] },
];
const EXPLORE_CACHE_TTL_SECONDS = parseInt(process.env.EXPLORE_CACHE_TTL_SECONDS, 10) || 30;
const EXPLORE_CACHE_KEY = 'explore:response:v2:anon';
const FEED_CACHE_TTL_SECONDS = parseInt(process.env.FEED_CACHE_TTL_SECONDS, 10) || 10;
const FILE_MARKER = /\[\[file:(.+?)\|(.+?)\]\]/g;

const invalidateExploreCache = async () => {
  if (!redis.isOpen) return;
  const feedKeys = await redis.keys('feed:anon:v2:*');
  await redis.del(['explore:trends:v1', EXPLORE_CACHE_KEY, ...feedKeys]);
};

const encodeCursor = (item) => Buffer.from(JSON.stringify({
  createdAt: new Date(item.retweetedAt || item.createdAt).toISOString(),
  id: item.cursorId || item.id,
})).toString('base64url');

const decodeCursor = (cursor) => {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!parsed.createdAt || !parsed.id) return null;
    return { createdAt: new Date(parsed.createdAt), id: parsed.id };
  } catch {
    const legacyDate = new Date(cursor);
    return Number.isNaN(legacyDate.getTime()) ? null : { createdAt: legacyDate, id: null };
  }
};

const buildStableCursorWhere = (cursor) => {
  if (!cursor) return {};
  if (!cursor.id) return { createdAt: { lt: cursor.createdAt } };
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  };
};

const tweetSelect = (userId) => ({
  id: true,
  content: true,
  imageUrl: true,
  createdAt: true,
  viewsCount: true,
  likesCount: true,
  retweetsCount: true,
  repliesCount: true,
  bookmarksCount: true,
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
  likes: userId ? { where: { userId }, select: { id: true } } : false,
  retweets: userId ? { where: { userId }, select: { id: true } } : false,
  bookmarks: userId ? { where: { userId }, select: { id: true } } : false,
});

const postReportSelect = {
  id: true,
  reason: true,
  details: true,
  status: true,
  adminNote: true,
  createdAt: true,
  reviewedAt: true,
  reporter: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
  reviewedBy: { select: { id: true, username: true, displayName: true } },
  targetUser: { select: { id: true, username: true, displayName: true, avatarUrl: true, isBanned: true } },
  tweet: {
    select: {
      id: true,
      content: true,
      imageUrl: true,
      createdAt: true,
      author: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
    },
  },
};

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

  tweets.forEach((tweet) => {
    if (newIds.includes(tweet.id)) tweet.viewsCount = (tweet.viewsCount || 0) + 1;
  });
};

const applyTweetCounts = (tweets) => {
  const items = collectTweets(Array.isArray(tweets) ? tweets : [tweets]);
  items.forEach((tweet) => {
    const likes = Math.max(0, tweet.likesCount || 0);
    const retweets = Math.max(0, tweet.retweetsCount || 0);
    const replies = Math.max(0, tweet.repliesCount || 0);
    const bookmarks = Math.max(0, tweet.bookmarksCount || 0);
    tweet._count = {
      likes,
      retweets,
      replies,
      bookmarks,
      ...(tweet._count || {}),
    };
  });
  return tweets;
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

const hydrateTopicStats = async () => {
  await Promise.all(topicSeeds.map((topic) => prisma.topicStat.upsert({
    where: { slug: topic.slug },
    create: topic,
    update: { name: topic.name, keywords: topic.keywords },
  })));
};

const getCachedTrends = async () => {
  const cacheKey = 'explore:trends:v1';
  if (redis.isOpen) {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  }

  await hydrateTopicStats();
  const rows = await prisma.topicStat.findMany({
    orderBy: [{ posts: 'desc' }, { updatedAt: 'desc' }],
    take: 10,
  });
  const trends = rows.map((row) => ({
    name: row.name,
    slug: row.slug,
    posts: row.posts,
    label: formatPostsLabel(row.posts),
  }));
  if (redis.isOpen) await redis.set(cacheKey, JSON.stringify(trends), { EX: 60 });
  return trends;
};

const updateTopicStatsForTweet = async (content) => {
  const normalized = content.toLowerCase();
  const matchedTopics = topicSeeds.filter((topic) => (
    topic.keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))
    || normalized.includes(`#${topic.name.toLowerCase()}`)
  ));
  if (!matchedTopics.length) return;

  await Promise.all(matchedTopics.map((topic) => prisma.topicStat.upsert({
    where: { slug: topic.slug },
    create: { ...topic, posts: 1 },
    update: { posts: { increment: 1 }, name: topic.name, keywords: topic.keywords },
  })));
  await invalidateExploreCache();
};

const normalizeHashtags = (value = '') => {
  const seen = new Set();
  return value.replace(/#[\p{L}\p{N}_-]+/gu, (tag) => {
    const key = tag.toLowerCase();
    if (seen.has(key)) return '';
    seen.add(key);
    return tag;
  }).replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+\n/g, '\n').trim();
};

const stripFileMarkers = (value = '') => value.replace(FILE_MARKER, '').replace(/\n{3,}/g, '\n\n').trim();

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
    const cursorValue = decodeCursor(cursor);
    const cacheKey = `feed:anon:v2:${mode}:${parsedLimit}`;

    if (!userId && !cursorValue && !followingOnly && redis.isOpen) {
      const cached = await redis.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));
    }

    let timelineUserIds = null;
    if (followingOnly) {
      if (!userId) return res.json({ tweets: [], nextCursor: null });

      const follows = await prisma.follow.findMany({
        where: { followerId: userId },
        select: { followingId: true },
      });
      timelineUserIds = [...new Set(follows.map((follow) => follow.followingId))];
      if (!timelineUserIds.length) return res.json({ tweets: [], nextCursor: null });
    }

    const tweets = await prisma.tweet.findMany({
      where: {
        parentId: null,
        ...(timelineUserIds ? { authorId: { in: timelineUserIds } } : {}),
        ...buildStableCursorWhere(cursorValue),
      },
      select: tweetSelect(userId),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: parsedLimit,
    });

    const retweets = await prisma.retweet.findMany({
      where: {
        ...(timelineUserIds ? { userId: { in: timelineUserIds } } : {}),
        ...buildStableCursorWhere(cursorValue),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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
      cursorId: rt.id,
    }));

    const feedItems = [...tweets, ...retweetedTweets]
      .sort((a, b) => {
        const dateDiff = new Date(b.retweetedAt || b.createdAt) - new Date(a.retweetedAt || a.createdAt);
        if (dateDiff !== 0) return dateDiff;
        return (b.cursorId || b.id).localeCompare(a.cursorId || a.id);
      })
      .slice(0, parsedLimit);

    await markViewed(req, feedItems);
    applyTweetCounts(feedItems);

    const nextCursor = feedItems.length === parsedLimit
      ? encodeCursor(feedItems[feedItems.length - 1])
      : null;

    const payload = { tweets: feedItems, nextCursor };
    if (!userId && !cursorValue && !followingOnly && redis.isOpen) {
      await redis.set(cacheKey, JSON.stringify(payload), { EX: FEED_CACHE_TTL_SECONDS });
    }

    res.json(payload);
  } catch (error) {
    next(error);
  }
};

const getExplore = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const rawTopic = (req.query.topic || req.query.q || '').toString().trim();
    if (!userId && !rawTopic && redis.isOpen) {
      const cached = await redis.get(EXPLORE_CACHE_KEY);
      if (cached) return res.json(JSON.parse(cached));
    }
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
      followersCount: true,
      tweetsCount: true,
      followers: userId ? { where: { followerId: userId }, select: { id: true } } : false,
    };

    const communityCardSelect = {
      id: true,
      slug: true,
      name: true,
      bio: true,
      avatarUrl: true,
      isVerified: true,
      membersCount: true,
      tweetsCount: true,
      members: userId ? { where: { userId }, select: { id: true, role: true } } : false,
    };

    const [tweets, users, communities, trends] = await Promise.all([
      prisma.tweet.findMany({
        where,
        select: tweetSelect(userId),
        orderBy: [{ viewsCount: 'desc' }, { createdAt: 'desc' }],
        take: 30,
      }),
      prisma.user.findMany({
        where: { isCommunity: false },
        orderBy: [{ followersCount: 'desc' }, { createdAt: 'desc' }],
        take: 8,
        select: userCardSelect,
      }),
      prisma.community.findMany({
        orderBy: [{ membersCount: 'desc' }, { createdAt: 'desc' }],
        take: 8,
        select: communityCardSelect,
      }),
      getCachedTrends(),
    ]);

    const normalizedUsers = users.map(({ followers, ...user }) => ({
      ...user,
      isFollowing: userId ? followers.length > 0 : false,
      _count: { followers: user.followersCount || 0, tweets: user.tweetsCount || 0 },
    }));
    const normalizedCommunities = communities.map(({ members, ...community }) => ({
      ...community,
      username: community.slug,
      displayName: community.name,
      isCommunity: true,
      isMember: userId ? members.length > 0 : false,
      memberRole: userId ? members[0]?.role || null : null,
      _count: {
        followers: community.membersCount || 0,
        tweets: community.tweetsCount || 0,
        members: community.membersCount || 0,
      },
    }));

    await markViewed(req, tweets);
    applyTweetCounts(tweets);
    const payload = { tweets, users: normalizedUsers, communities: normalizedCommunities, trends };
    if (!userId && !rawTopic && redis.isOpen) {
      await redis.set(EXPLORE_CACHE_KEY, JSON.stringify(payload), { EX: EXPLORE_CACHE_TTL_SECONDS });
    }
    res.json(payload);
  } catch (error) {
    next(error);
  }
};

const createTweet = async (req, res, next) => {
  try {
    const { parentId, communityId } = req.body;
    const rawContent = (req.body.content || '').trim();
    const content = normalizeHashtags(rawContent);
    const file = req.file || null;
    const isImage = file?.mimetype?.startsWith('image/');
    const imageUrl = isImage ? file.path : null;
    const finalContent = file && !isImage
      ? [content, `[[file:${file.originalname}|${file.path}]]`].filter(Boolean).join('\n\n')
      : content;
    let parent = null;
    let community = null;

    if (!finalContent && !imageUrl) {
      return res.status(400).json({ error: 'Твит должен содержать текст, фото или вложение' });
    }

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

    const tweet = await prisma.$transaction(async (tx) => {
      const created = await tx.tweet.create({
        data: {
          content: finalContent,
          imageUrl,
          authorId: req.user.id,
          communityId: community?.id || null,
          parentId: parentId || null,
        },
        select: tweetSelect(req.user.id),
      });
      if (parentId) {
        await tx.tweet.update({ where: { id: parentId }, data: { repliesCount: { increment: 1 } } });
      } else {
        await tx.user.update({ where: { id: req.user.id }, data: { tweetsCount: { increment: 1 } } });
        if (community?.id) {
          await tx.community.update({ where: { id: community.id }, data: { tweetsCount: { increment: 1 } } });
        }
      }
      return created;
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

    if (!parentId) {
      updateTopicStatsForTweet(finalContent).catch((error) => logger.error('Topic stat update failed:', error));
      invalidateExploreCache().catch((error) => logger.warn(`Explore cache invalidation failed: ${error.message}`));
    }
    if (imageUrl && process.env.JOB_QUEUE_ENABLED !== 'false') {
      enqueue('media', 'tweetImageUploaded', { tweetId: tweet.id, imageUrl })
        .catch((error) => logger.warn(`Media queue skipped: ${error.message}`));
    }

    logger.info(`Tweet created by ${req.user.username}: ${tweet.id}`);
    res.status(201).json({ tweet });
  } catch (error) {
    next(error);
  }
};

const updateTweet = async (req, res, next) => {
  try {
    const { id } = req.params;
    const rawContent = req.body.content ?? '';
    const normalizedContent = normalizeHashtags(rawContent.trim());
    const file = req.file || null;
    const isImage = file?.mimetype?.startsWith('image/');
    const clearImage = req.body.clearImage === 'true';

    const existing = await prisma.tweet.findUnique({
      where: { id },
      select: { id: true, authorId: true, parentId: true, imageUrl: true, content: true },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Твит не найден' });
    }
    if (existing.authorId !== req.user.id) {
      return res.status(403).json({ error: 'Можно редактировать только свои твиты' });
    }

    const existingFileMarker = existing.content.match(FILE_MARKER)?.[0] || '';
    let nextContent = stripFileMarkers(normalizedContent);
    if (file && !isImage) {
      nextContent = [nextContent, `[[file:${file.originalname}|${file.path}]]`].filter(Boolean).join('\n\n');
    } else if (!file && existingFileMarker) {
      nextContent = [nextContent, existingFileMarker].filter(Boolean).join('\n\n');
    }

    let imageUrl = existing.imageUrl;
    if (clearImage) imageUrl = null;
    if (file && isImage) imageUrl = file.path;

    if (!nextContent && !imageUrl) {
      return res.status(400).json({ error: 'Твит должен содержать текст, фото, ссылку, опрос или вложение' });
    }

    const tweet = await prisma.tweet.update({
      where: { id },
      data: {
        content: nextContent,
        imageUrl,
      },
      select: tweetSelect(req.user.id),
    });

    applyTweetCounts(tweet);
    if (!existing.parentId) {
      invalidateExploreCache().catch((error) => logger.warn(`Explore cache invalidation failed: ${error.message}`));
    }

    res.json({ tweet });
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
    if (tweet.authorId !== req.user.id && !isAdmin(req.user)) return res.status(403).json({ error: 'Нет прав' });

    await prisma.$transaction(async (tx) => {
      await tx.tweet.delete({ where: { id } });
      if (tweet.parentId) {
        await tx.tweet.update({
          where: { id: tweet.parentId },
          data: { repliesCount: { decrement: 1 } },
        }).catch(() => {});
      } else {
        await tx.user.update({ where: { id: tweet.authorId }, data: { tweetsCount: { decrement: 1 } } }).catch(() => {});
        if (tweet.communityId) {
          await tx.community.update({ where: { id: tweet.communityId }, data: { tweetsCount: { decrement: 1 } } }).catch(() => {});
        }
      }
    });
    invalidateExploreCache().catch((error) => logger.warn(`Explore cache invalidation failed: ${error.message}`));
    res.json({ message: 'Твит удалён' });
  } catch (error) {
    next(error);
  }
};

const reportTweet = async (req, res, next) => {
  try {
    const reporterId = req.user.id;
    const tweetId = req.params.id;
    const reason = req.body.reason?.trim();
    const details = req.body.details?.trim() || null;

    if (!reason) return res.status(400).json({ error: 'Укажи причину жалобы' });

    const tweet = await prisma.tweet.findUnique({
      where: { id: tweetId },
      select: { id: true, authorId: true },
    });
    if (!tweet) return res.status(404).json({ error: 'Твит не найден' });
    if (tweet.authorId === reporterId) return res.status(400).json({ error: 'Нельзя пожаловаться на свой твит' });

    const report = await prisma.postReport.upsert({
      where: { reporterId_tweetId: { reporterId, tweetId } },
      update: { reason, details, status: 'open', adminNote: null, reviewedAt: null, reviewedById: null },
      create: {
        reporterId,
        tweetId,
        targetUserId: tweet.authorId,
        reason,
        details,
      },
      select: postReportSelect,
    });

    res.status(201).json({ report, message: 'Жалоба на пост отправлена' });
  } catch (error) {
    next(error);
  }
};

const listTweetReports = async (req, res, next) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ error: 'Доступ только для администратора' });
    const status = req.query.status?.toString().trim() || 'open';

    const reports = await prisma.postReport.findMany({
      where: status === 'all' ? {} : { status },
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
      select: postReportSelect,
    });

    res.json({ reports });
  } catch (error) {
    next(error);
  }
};

const reviewTweetReport = async (req, res, next) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ error: 'Доступ только для администратора' });

    const status = req.body.status === 'rejected' ? 'rejected' : 'resolved';
    const adminNote = req.body.adminNote?.trim() || null;

    const report = await prisma.postReport.update({
      where: { id: req.params.id },
      data: {
        status,
        adminNote,
        reviewedAt: new Date(),
        reviewedById: req.user.id,
      },
      select: postReportSelect,
    });

    res.json({ report, message: status === 'resolved' ? 'Жалоба обработана' : 'Жалоба отклонена' });
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
      const [, updatedTweet] = await prisma.$transaction([
        prisma.like.delete({ where: { id: existing.id } }),
        prisma.tweet.update({
          where: { id },
          data: { likesCount: Math.max(0, (tweet.likesCount || 0) - 1) },
          select: { likesCount: true },
        }),
      ]);
      invalidateExploreCache().catch((error) => logger.warn(`Explore cache invalidation failed: ${error.message}`));
      return res.json({ liked: false, count: updatedTweet.likesCount });
    }

    const [, updatedTweet] = await prisma.$transaction([
      prisma.like.create({ data: { userId, tweetId: id } }),
      prisma.tweet.update({
        where: { id },
        data: { likesCount: { increment: 1 } },
        select: { likesCount: true },
      }),
    ]);
    invalidateExploreCache().catch((error) => logger.warn(`Explore cache invalidation failed: ${error.message}`));
    await createNotification({ req, userId: tweet.authorId, fromId: userId, type: 'like', tweetId: id });
    res.json({ liked: true, count: updatedTweet.likesCount });
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
      const [, updatedTweet] = await prisma.$transaction([
        prisma.retweet.delete({ where: { id: existing.id } }),
        prisma.tweet.update({
          where: { id },
          data: { retweetsCount: Math.max(0, (tweet.retweetsCount || 0) - 1) },
          select: { retweetsCount: true },
        }),
      ]);
      invalidateExploreCache().catch((error) => logger.warn(`Explore cache invalidation failed: ${error.message}`));
      return res.json({ retweeted: false, count: updatedTweet.retweetsCount });
    }

    const [, updatedTweet] = await prisma.$transaction([
      prisma.retweet.create({ data: { userId, tweetId: id } }),
      prisma.tweet.update({
        where: { id },
        data: { retweetsCount: { increment: 1 } },
        select: { retweetsCount: true },
      }),
    ]);
    invalidateExploreCache().catch((error) => logger.warn(`Explore cache invalidation failed: ${error.message}`));
    await createNotification({ req, userId: tweet.authorId, fromId: userId, type: 'retweet', tweetId: id });
    res.json({ retweeted: true, count: updatedTweet.retweetsCount });
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
      const [, updatedTweet] = await prisma.$transaction([
        prisma.bookmark.delete({ where: { id: existing.id } }),
        prisma.tweet.update({
          where: { id },
          data: { bookmarksCount: Math.max(0, (tweet.bookmarksCount || 0) - 1) },
          select: { bookmarksCount: true },
        }),
      ]);
      return res.json({ bookmarked: false, count: updatedTweet.bookmarksCount });
    }

    const [, updatedTweet] = await prisma.$transaction([
      prisma.bookmark.create({ data: { userId, tweetId: id } }),
      prisma.tweet.update({
        where: { id },
        data: { bookmarksCount: { increment: 1 } },
        select: { bookmarksCount: true },
      }),
    ]);
    res.json({ bookmarked: true, count: updatedTweet.bookmarksCount });
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

    applyTweetCounts(tweets);
    res.json({ tweets, nextCursor });
  } catch (error) {
    next(error);
  }
};

const searchTweets = async (req, res, next) => {
  try {
    const q = (req.query.q || '').toString().trim();
    if (!q) return res.json({ tweets: [] });

    const userId = req.user?.id;
    const tweets = await prisma.tweet.findMany({
      where: {
        content: { contains: q, mode: 'insensitive' },
      },
      orderBy: [{ viewsCount: 'desc' }, { createdAt: 'desc' }],
      take: 30,
      select: tweetSelect(userId),
    });

    applyTweetCounts(tweets);
    res.json({ tweets });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getFeed,
  getExplore,
  createTweet,
  updateTweet,
  getTweet,
  deleteTweet,
  reportTweet,
  listTweetReports,
  reviewTweetReport,
  likeTweet,
  retweetTweet,
  bookmarkTweet,
  getBookmarks,
  searchTweets,
  tweetSelect,
  withThreadReplyCounts,
};
