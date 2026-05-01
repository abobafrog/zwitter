// src/controllers/community.controller.js
const prisma = require('../config/prisma');
const { tweetSelect, withThreadReplyCounts } = require('./tweet.controller');

const communitySelect = (userId) => ({
  id: true,
  slug: true,
  name: true,
  bio: true,
  avatarUrl: true,
  bannerUrl: true,
  isVerified: true,
  ownerId: true,
  createdAt: true,
  owner: {
    select: { id: true, username: true, displayName: true, avatarUrl: true },
  },
  _count: { select: { members: true, tweets: true } },
  members: userId ? { where: { userId }, select: { id: true, role: true } } : false,
});

const normalizeCommunity = ({ members, _count, ...community }, userId) => ({
  ...community,
  username: community.slug,
  displayName: community.name,
  isCommunity: true,
  isMember: userId ? members.length > 0 : false,
  memberRole: userId ? members[0]?.role || null : null,
  _count: {
    followers: _count.members,
    tweets: _count.tweets,
    members: _count.members,
  },
});

const listCommunities = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const q = (req.query.q || '').toString().trim();

    const communities = await prisma.community.findMany({
      where: q
        ? {
            name: { contains: q, mode: 'insensitive' },
          }
        : {},
      orderBy: [{ members: { _count: 'desc' } }, { createdAt: 'desc' }],
      take: 20,
      select: communitySelect(userId),
    });

    res.json({ communities: communities.map((community) => normalizeCommunity(community, userId)) });
  } catch (error) {
    next(error);
  }
};

const listMyCommunities = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const communities = await prisma.community.findMany({
      where: {
        members: {
          some: {
            userId,
            role: { in: ['owner', 'admin'] },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      select: communitySelect(userId),
    });

    res.json({ communities: communities.map((community) => normalizeCommunity(community, userId)) });
  } catch (error) {
    next(error);
  }
};

const createCommunity = async (req, res, next) => {
  try {
    const ownerId = req.user.id;
    const name = req.body.name?.trim();
    const slug = req.body.slug?.trim().toLowerCase();
    const bio = req.body.bio?.trim() || null;

    const existing = await prisma.community.findUnique({ where: { slug } });
    if (existing) return res.status(409).json({ error: 'Адрес сообщества уже занят' });

    const community = await prisma.community.create({
      data: {
        name,
        slug,
        bio,
        ownerId,
        members: {
          create: { userId: ownerId, role: 'owner' },
        },
      },
      select: communitySelect(ownerId),
    });

    res.status(201).json({ community: normalizeCommunity(community, ownerId) });
  } catch (error) {
    next(error);
  }
};

const getCommunity = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { slug } = req.params;
    const community = await prisma.community.findUnique({
      where: { slug: slug.toLowerCase() },
      select: communitySelect(userId),
    });

    if (!community) return res.status(404).json({ error: 'Сообщество не найдено' });
    res.json({ community: normalizeCommunity(community, userId) });
  } catch (error) {
    next(error);
  }
};

const getCommunityTweets = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { slug } = req.params;
    const community = await prisma.community.findUnique({
      where: { slug: slug.toLowerCase() },
      select: { id: true },
    });
    if (!community) return res.status(404).json({ error: 'Сообщество не найдено' });

    const tweets = await prisma.tweet.findMany({
      where: { communityId: community.id, parentId: null },
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

const toggleCommunityMembership = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { slug } = req.params;
    const community = await prisma.community.findUnique({ where: { slug: slug.toLowerCase() } });
    if (!community) return res.status(404).json({ error: 'Сообщество не найдено' });

    if (community.ownerId === userId) {
      return res.status(400).json({ error: 'Владелец не может выйти из своего сообщества' });
    }

    const existing = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId: community.id, userId } },
    });

    if (existing) {
      await prisma.communityMember.delete({ where: { id: existing.id } });
      return res.json({ member: false });
    }

    await prisma.communityMember.create({ data: { communityId: community.id, userId } });
    res.json({ member: true });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listCommunities,
  listMyCommunities,
  createCommunity,
  getCommunity,
  getCommunityTweets,
  toggleCommunityMembership,
};
