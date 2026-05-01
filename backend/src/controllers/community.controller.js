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

const assertCommunityOwner = async (slug, userId) => {
  const community = await prisma.community.findUnique({
    where: { slug: slug.toLowerCase() },
    select: { id: true, slug: true, ownerId: true },
  });

  if (!community) return { error: 'Сообщество не найдено', status: 404 };
  if (community.ownerId !== userId) return { error: 'Управлять сообществом может только владелец', status: 403 };
  return { community };
};

const listCommunities = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const q = (req.query.q || '').toString().trim();

    const communities = await prisma.community.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { slug: { contains: q, mode: 'insensitive' } },
              { bio: { contains: q, mode: 'insensitive' } },
            ],
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

const listCommunityMembers = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { slug } = req.params;
    const access = await assertCommunityOwner(slug, userId);
    if (access.error) return res.status(access.status).json({ error: access.error });

    const members = await prisma.communityMember.findMany({
      where: { communityId: access.community.id },
      orderBy: [{ role: 'desc' }, { createdAt: 'asc' }],
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
      },
    });

    res.json({ members: members.map((member) => ({ ...member.user, role: member.role, joinedAt: member.createdAt })) });
  } catch (error) {
    next(error);
  }
};

const updateCommunity = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { slug } = req.params;
    const access = await assertCommunityOwner(slug, userId);
    if (access.error) return res.status(access.status).json({ error: access.error });

    const name = req.body.name?.trim();
    const bio = req.body.bio?.trim();
    const data = {};

    if (name !== undefined) {
      if (name.length < 2 || name.length > 100) {
        return res.status(400).json({ error: 'Название: 2-100 символов' });
      }
      data.name = name;
    }
    if (bio !== undefined) data.bio = bio || null;
    if (req.files?.avatar?.[0]?.path) data.avatarUrl = req.files.avatar[0].path;
    if (req.files?.banner?.[0]?.path) data.bannerUrl = req.files.banner[0].path;

    const community = await prisma.community.update({
      where: { id: access.community.id },
      data,
      select: communitySelect(userId),
    });

    res.json({ community: normalizeCommunity(community, userId) });
  } catch (error) {
    next(error);
  }
};

const addCommunityMembers = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { slug } = req.params;
    const userIds = [...new Set(req.body.userIds || [])];
    const access = await assertCommunityOwner(slug, userId);
    if (access.error) return res.status(access.status).json({ error: access.error });
    if (userIds.length === 0) return res.status(400).json({ error: 'Выберите пользователей' });

    const users = await prisma.user.findMany({
      where: { id: { in: userIds }, isCommunity: false },
      select: { id: true },
    });
    if (users.length !== userIds.length) {
      return res.status(400).json({ error: 'Один из пользователей не найден' });
    }

    await prisma.communityMember.createMany({
      data: userIds.map((memberUserId) => ({ communityId: access.community.id, userId: memberUserId })),
      skipDuplicates: true,
    });

    const community = await prisma.community.findUnique({
      where: { id: access.community.id },
      select: communitySelect(userId),
    });
    res.json({ community: normalizeCommunity(community, userId) });
  } catch (error) {
    next(error);
  }
};

const removeCommunityMember = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { slug, userId: targetUserId } = req.params;
    const access = await assertCommunityOwner(slug, userId);
    if (access.error) return res.status(access.status).json({ error: access.error });
    if (targetUserId === userId) {
      return res.status(400).json({ error: 'Владелец не может удалить себя из сообщества' });
    }

    await prisma.communityMember.deleteMany({
      where: { communityId: access.community.id, userId: targetUserId },
    });

    const community = await prisma.community.findUnique({
      where: { id: access.community.id },
      select: communitySelect(userId),
    });
    res.json({ community: normalizeCommunity(community, userId) });
  } catch (error) {
    next(error);
  }
};

const deleteCommunity = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { slug } = req.params;
    const access = await assertCommunityOwner(slug, userId);
    if (access.error) return res.status(access.status).json({ error: access.error });

    await prisma.community.delete({ where: { id: access.community.id } });
    res.json({ slug: access.community.slug });
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
  listCommunityMembers,
  updateCommunity,
  addCommunityMembers,
  removeCommunityMember,
  deleteCommunity,
};
