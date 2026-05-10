// prisma/seed.js
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const svgData = (svg) => `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;

const mediaSvg = ({ title, subtitle, a, b, c, planet = true }) => svgData(`
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" viewBox="0 0 1200 720">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${a}"/>
      <stop offset="0.52" stop-color="${b}"/>
      <stop offset="1" stop-color="${c}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="45%" r="55%">
      <stop offset="0" stop-color="#ffffff" stop-opacity=".9"/>
      <stop offset=".22" stop-color="${a}" stop-opacity=".65"/>
      <stop offset="1" stop-color="#020617" stop-opacity="0"/>
    </radialGradient>
    <filter id="blur"><feGaussianBlur stdDeviation="18"/></filter>
  </defs>
  <rect width="1200" height="720" fill="#020617"/>
  <rect width="1200" height="720" fill="url(#bg)" opacity=".55"/>
  <circle cx="260" cy="130" r="2" fill="#e0f2fe"/><circle cx="1040" cy="110" r="2" fill="#e0f2fe"/>
  <circle cx="930" cy="560" r="2" fill="#bae6fd"/><circle cx="160" cy="610" r="1.6" fill="#a5b4fc"/>
  <circle cx="570" cy="180" r="1.6" fill="#f0abfc"/><circle cx="720" cy="640" r="1.5" fill="#67e8f9"/>
  <path d="M-80 520C120 320 290 430 430 300s320-240 620-10 270 390 270 390H-80z" fill="url(#glow)" opacity=".72" filter="url(#blur)"/>
  ${planet ? `<circle cx="860" cy="348" r="160" fill="#020617" opacity=".92"/>
  <circle cx="860" cy="348" r="160" fill="url(#bg)" opacity=".58"/>
  <ellipse cx="860" cy="348" rx="245" ry="48" fill="none" stroke="#67e8f9" stroke-width="8" opacity=".58" transform="rotate(-18 860 348)"/>` : ''}
  <rect x="56" y="500" width="650" height="130" rx="34" fill="#020617" opacity=".54"/>
  <text x="92" y="560" font-family="Inter,Arial,sans-serif" font-size="54" font-weight="800" fill="#f0f9ff">${title}</text>
  <text x="94" y="604" font-family="Inter,Arial,sans-serif" font-size="24" fill="#bfdbfe">${subtitle}</text>
</svg>`);

const avatarSvg = ({ label, a, b }) => svgData(`
<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${a}"/>
      <stop offset="1" stop-color="${b}"/>
    </linearGradient>
  </defs>
  <rect width="320" height="320" rx="160" fill="#020617"/>
  <circle cx="160" cy="160" r="140" fill="url(#g)" opacity=".92"/>
  <circle cx="102" cy="92" r="44" fill="#fff" opacity=".16"/>
  <text x="160" y="184" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="92" font-weight="900" fill="#f8fafc">${label}</text>
</svg>`);

const bannerSvg = ({ title, a, b }) => svgData(`
<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="500" viewBox="0 0 1500 500">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${a}"/>
      <stop offset=".55" stop-color="#0f172a"/>
      <stop offset="1" stop-color="${b}"/>
    </linearGradient>
  </defs>
  <rect width="1500" height="500" fill="url(#g)"/>
  <circle cx="1160" cy="210" r="120" fill="${b}" opacity=".4"/>
  <ellipse cx="1160" cy="210" rx="220" ry="40" fill="none" stroke="#67e8f9" stroke-width="9" opacity=".45" transform="rotate(-12 1160 210)"/>
  <path d="M0 410C260 260 360 460 590 290s440-150 910 25v185H0z" fill="#020617" opacity=".42"/>
  <text x="70" y="250" font-family="Inter,Arial,sans-serif" font-size="64" font-weight="900" fill="#eff6ff">${title}</text>
</svg>`);

const hoursAgo = (hours) => new Date(Date.now() - hours * 60 * 60 * 1000);

async function upsertById(model, id, data) {
  return prisma[model].upsert({
    where: { id },
    update: data,
    create: { id, ...data },
  });
}

async function main() {
  console.log('Seeding Zwiteer demo data...');

  const passwordHash = await bcrypt.hash('password123', 12);

  const usersSeed = [
    {
      username: 'novapulse',
      email: 'novapulse@example.com',
      displayName: 'NovaPulse',
      bio: 'Исследую миры, создаю будущее. UI, космос и быстрые идеи.',
      birthDate: '12.04.1998',
      isVerified: true,
      isCommunity: false,
      avatarUrl: avatarSvg({ label: 'N', a: '#22d3ee', b: '#8b5cf6' }),
      bannerUrl: bannerSvg({ title: 'NovaPulse', a: '#0ea5e9', b: '#8b5cf6' }),
    },
    {
      username: 'stargazer',
      email: 'stargazer@example.com',
      displayName: 'StarGazer',
      bio: 'Фотограф звёздных горизонтов. Каждый кадр — координата памяти.',
      birthDate: '08.11.1996',
      isVerified: true,
      isCommunity: false,
      avatarUrl: avatarSvg({ label: 'S', a: '#60a5fa', b: '#f472b6' }),
      bannerUrl: bannerSvg({ title: 'StarGazer', a: '#1d4ed8', b: '#db2777' }),
    },
    {
      username: 'neptunelab',
      email: 'neptunelab@example.com',
      displayName: 'Neptune Lab',
      bio: 'Лаборатория интерфейсов, протоколов связи и спокойного UX.',
      birthDate: '23.02.1994',
      isVerified: false,
      isCommunity: true,
      avatarUrl: avatarSvg({ label: 'L', a: '#2dd4bf', b: '#2563eb' }),
      bannerUrl: bannerSvg({ title: 'Neptune Lab', a: '#0f766e', b: '#2563eb' }),
    },
    {
      username: 'cyberwave',
      email: 'cyberwave@example.com',
      displayName: 'CyberWave',
      bio: 'Каналы, синтвейв, ночные релизы и немного сетевой магии.',
      birthDate: '30.07.1999',
      isVerified: false,
      isCommunity: false,
      avatarUrl: avatarSvg({ label: 'C', a: '#38bdf8', b: '#a855f7' }),
      bannerUrl: bannerSvg({ title: 'CyberWave', a: '#0369a1', b: '#7e22ce' }),
    },
    {
      username: 'deepspace',
      email: 'deepspace@example.com',
      displayName: 'DeepSpace',
      bio: 'Сообщество дальних орбит, арта, науки и тихих наблюдений.',
      birthDate: '19.09.1992',
      isVerified: true,
      isCommunity: true,
      avatarUrl: avatarSvg({ label: 'D', a: '#818cf8', b: '#0ea5e9' }),
      bannerUrl: bannerSvg({ title: 'DeepSpace', a: '#312e81', b: '#0891b2' }),
    },
    {
      username: 'astrovision',
      email: 'astrovision@example.com',
      displayName: 'AstroVision',
      bio: 'Визуальные заметки о вселенной, дизайне и будущих медиа.',
      birthDate: '05.05.1997',
      isVerified: false,
      isCommunity: true,
      avatarUrl: avatarSvg({ label: 'A', a: '#f0abfc', b: '#38bdf8' }),
      bannerUrl: bannerSvg({ title: 'AstroVision', a: '#86198f', b: '#0284c7' }),
    },
  ];

  const users = {};
  for (const item of usersSeed) {
    users[item.username] = await prisma.user.upsert({
      where: { username: item.username },
      update: { ...item, passwordHash, emailVerified: true, emailVerifiedAt: new Date() },
      create: { ...item, passwordHash, emailVerified: true, emailVerifiedAt: new Date() },
    });
  }

  const communitiesSeed = [
    {
      slug: 'neptune_lab',
      name: 'Neptune Lab',
      bio: 'Канал про интерфейсы, протоколы связи и спокойный UX.',
      owner: 'novapulse',
      avatarUrl: avatarSvg({ label: 'N', a: '#2dd4bf', b: '#2563eb' }),
      bannerUrl: bannerSvg({ title: 'Neptune Lab', a: '#0f766e', b: '#2563eb' }),
    },
    {
      slug: 'deepspace',
      name: 'DeepSpace',
      bio: 'Сообщество дальних орбит, арта, науки и тихих наблюдений.',
      owner: 'stargazer',
      avatarUrl: avatarSvg({ label: 'D', a: '#818cf8', b: '#0ea5e9' }),
      bannerUrl: bannerSvg({ title: 'DeepSpace', a: '#312e81', b: '#0891b2' }),
      isVerified: true,
    },
    {
      slug: 'astrovision',
      name: 'AstroVision',
      bio: 'Визуальные заметки о вселенной, дизайне и будущих медиа.',
      owner: 'astrovision',
      avatarUrl: avatarSvg({ label: 'A', a: '#f0abfc', b: '#38bdf8' }),
      bannerUrl: bannerSvg({ title: 'AstroVision', a: '#86198f', b: '#0284c7' }),
    },
  ];

  const communities = {};
  for (const item of communitiesSeed) {
    const { owner, ...community } = item;
    communities[item.slug] = await prisma.community.upsert({
      where: { slug: item.slug },
      update: { ...community, ownerId: users[owner].id },
      create: { ...community, ownerId: users[owner].id },
    });

    await prisma.communityMember.upsert({
      where: {
        communityId_userId: {
          communityId: communities[item.slug].id,
          userId: users[owner].id,
        },
      },
      update: { role: 'owner' },
      create: {
        communityId: communities[item.slug].id,
        userId: users[owner].id,
        role: 'owner',
      },
    });
  }

  const tweetSeed = [
    {
      id: 'demo-tweet-001',
      author: 'stargazer',
      content: 'Каждый закат — это напоминание, что где-то есть новые звёзды. Снял этот кадр на внешней орбите.',
      imageUrl: mediaSvg({ title: 'Violet Horizon', subtitle: 'orbital sunset log', a: '#7c3aed', b: '#0f172a', c: '#0ea5e9' }),
      createdAt: hoursAgo(2),
      viewsCount: 1840,
    },
    {
      id: 'demo-tweet-002',
      author: 'neptunelab',
      content: 'Мы запустили новый протокол связи. Скорость — световая, задержка — почти медитативная.',
      imageUrl: mediaSvg({ title: 'Signal Protocol', subtitle: 'neon communication layer', a: '#14b8a6', b: '#0f172a', c: '#2563eb' }),
      createdAt: hoursAgo(4),
      viewsCount: 2310,
    },
    {
      id: 'demo-tweet-003',
      author: 'novapulse',
      content: 'Идеальный интерфейс будущего должен быть как кабина корабля: понятно, красиво и без лишнего шума.',
      imageUrl: mediaSvg({ title: 'Future Console', subtitle: 'interface sketch 07', a: '#22d3ee', b: '#0b1023', c: '#8b5cf6', planet: false }),
      createdAt: hoursAgo(6),
      viewsCount: 4420,
    },
    {
      id: 'demo-tweet-004',
      author: 'cyberwave',
      content: 'Ночной релиз: обновили каналы, добавили быстрые реакции и новый glow для карточек.',
      imageUrl: mediaSvg({ title: 'Night Release', subtitle: 'channels and reactions', a: '#38bdf8', b: '#111827', c: '#c026d3' }),
      createdAt: hoursAgo(8),
      viewsCount: 1290,
    },
    {
      id: 'demo-tweet-005',
      author: 'deepspace',
      content: 'Открыли набор в сообщество DeepSpace. Нужны авторы, наблюдатели, дизайнеры и люди, которые любят тишину.',
      imageUrl: mediaSvg({ title: 'DeepSpace Club', subtitle: 'community transmission', a: '#818cf8', b: '#020617', c: '#06b6d4' }),
      createdAt: hoursAgo(10),
      viewsCount: 3780,
    },
    {
      id: 'demo-tweet-006',
      author: 'astrovision',
      content: 'Подборка визуальных идей для профилей: баннер должен рассказывать историю ещё до первого поста.',
      imageUrl: mediaSvg({ title: 'Profile Worlds', subtitle: 'visual identity pack', a: '#f472b6', b: '#111827', c: '#38bdf8', planet: false }),
      createdAt: hoursAgo(13),
      viewsCount: 960,
    },
    {
      id: 'demo-tweet-007',
      author: 'novapulse',
      content: 'Сегодня тестирую мобильную навигацию: снизу — действия, сверху — контекст, внутри — скорость.',
      imageUrl: mediaSvg({ title: 'Mobile Orbit', subtitle: 'bottom navigation test', a: '#0ea5e9', b: '#020617', c: '#6366f1' }),
      createdAt: hoursAgo(16),
      viewsCount: 3120,
    },
    {
      id: 'demo-tweet-008',
      author: 'cyberwave',
      content: 'Если чат не ощущается живым, он просто список сообщений. Добавили ритм, реакции и чуть больше воздуха.',
      imageUrl: mediaSvg({ title: 'Chat Pulse', subtitle: 'messenger moodboard', a: '#06b6d4', b: '#020617', c: '#a21caf', planet: false }),
      createdAt: hoursAgo(20),
      viewsCount: 2070,
    },
    {
      id: 'demo-tweet-009',
      author: 'stargazer',
      content: 'Финальный кадр ночи. Иногда самый красивый свет появляется, когда интерфейс почти исчезает.',
      imageUrl: mediaSvg({ title: 'Last Light', subtitle: 'quiet interface moment', a: '#60a5fa', b: '#030712', c: '#e879f9' }),
      createdAt: hoursAgo(25),
      viewsCount: 5110,
    },
  ];

  const tweets = {};
  for (const item of tweetSeed) {
    const { id, author, ...tweet } = item;
    tweets[id] = await upsertById('tweet', id, {
      ...tweet,
      authorId: users[author].id,
      parentId: null,
    });
  }

  const replies = [
    ['demo-reply-001', 'novapulse', 'demo-tweet-001', 'Этот цветовой переход просто идеален для профиля.'],
    ['demo-reply-002', 'deepspace', 'demo-tweet-002', 'Берём протокол в тесты сообщества.'],
    ['demo-reply-003', 'stargazer', 'demo-tweet-003', 'Кабина корабля — лучшее описание хорошего UI.'],
    ['demo-reply-004', 'astrovision', 'demo-tweet-008', 'Ритм чата решает больше, чем кажется.'],
  ];

  for (const [id, author, parentId, content] of replies) {
    await upsertById('tweet', id, {
      content,
      imageUrl: null,
      authorId: users[author].id,
      parentId,
      createdAt: hoursAgo(1 + replies.findIndex((reply) => reply[0] === id)),
      viewsCount: 0,
    });
  }

  const follows = [
    ['novapulse', 'stargazer'], ['novapulse', 'neptunelab'], ['novapulse', 'deepspace'],
    ['stargazer', 'novapulse'], ['stargazer', 'astrovision'], ['stargazer', 'deepspace'],
    ['neptunelab', 'novapulse'], ['neptunelab', 'cyberwave'], ['cyberwave', 'neptunelab'],
    ['deepspace', 'novapulse'], ['astrovision', 'stargazer'], ['astrovision', 'cyberwave'],
  ];

  for (const [follower, following] of follows) {
    await prisma.follow.upsert({
      where: { followerId_followingId: { followerId: users[follower].id, followingId: users[following].id } },
      update: {},
      create: { followerId: users[follower].id, followingId: users[following].id },
    });
  }

  const likes = [
    ['novapulse', 'demo-tweet-001'], ['neptunelab', 'demo-tweet-001'], ['deepspace', 'demo-tweet-001'],
    ['stargazer', 'demo-tweet-002'], ['cyberwave', 'demo-tweet-002'], ['astrovision', 'demo-tweet-002'],
    ['stargazer', 'demo-tweet-003'], ['neptunelab', 'demo-tweet-003'], ['deepspace', 'demo-tweet-003'],
    ['novapulse', 'demo-tweet-004'], ['astrovision', 'demo-tweet-004'],
    ['novapulse', 'demo-tweet-005'], ['stargazer', 'demo-tweet-005'], ['cyberwave', 'demo-tweet-005'],
    ['novapulse', 'demo-tweet-006'], ['stargazer', 'demo-tweet-006'],
    ['neptunelab', 'demo-tweet-007'], ['cyberwave', 'demo-tweet-007'], ['deepspace', 'demo-tweet-007'],
    ['novapulse', 'demo-tweet-008'], ['astrovision', 'demo-tweet-008'],
    ['deepspace', 'demo-tweet-009'], ['astrovision', 'demo-tweet-009'], ['neptunelab', 'demo-tweet-009'],
  ];

  for (const [user, tweet] of likes) {
    await prisma.like.upsert({
      where: { userId_tweetId: { userId: users[user].id, tweetId: tweet } },
      update: {},
      create: { userId: users[user].id, tweetId: tweet },
    });
  }

  const retweets = [
    ['novapulse', 'demo-tweet-001', hoursAgo(0.5)],
    ['deepspace', 'demo-tweet-002', hoursAgo(3)],
    ['stargazer', 'demo-tweet-003', hoursAgo(5)],
    ['astrovision', 'demo-tweet-005', hoursAgo(9)],
    ['neptunelab', 'demo-tweet-008', hoursAgo(12)],
    ['cyberwave', 'demo-tweet-009', hoursAgo(18)],
  ];

  for (const [user, tweet, createdAt] of retweets) {
    await prisma.retweet.upsert({
      where: { userId_tweetId: { userId: users[user].id, tweetId: tweet } },
      update: { createdAt },
      create: { userId: users[user].id, tweetId: tweet, createdAt },
    });
  }

  const bookmarks = [
    ['novapulse', 'demo-tweet-001'], ['novapulse', 'demo-tweet-002'], ['novapulse', 'demo-tweet-006'],
    ['stargazer', 'demo-tweet-003'], ['stargazer', 'demo-tweet-005'],
    ['neptunelab', 'demo-tweet-008'], ['cyberwave', 'demo-tweet-001'], ['deepspace', 'demo-tweet-009'],
  ];

  for (const [user, tweet] of bookmarks) {
    await prisma.bookmark.upsert({
      where: { userId_tweetId: { userId: users[user].id, tweetId: tweet } },
      update: {},
      create: { userId: users[user].id, tweetId: tweet },
    });
  }

  const notifications = [
    ['demo-notification-001', 'novapulse', 'stargazer', 'like', 'demo-tweet-003', false, hoursAgo(0.6)],
    ['demo-notification-002', 'novapulse', 'deepspace', 'retweet', 'demo-tweet-002', false, hoursAgo(1.1)],
    ['demo-notification-003', 'novapulse', 'astrovision', 'follow', null, true, hoursAgo(3.4)],
    ['demo-notification-004', 'stargazer', 'novapulse', 'reply', 'demo-tweet-001', false, hoursAgo(1.4)],
    ['demo-notification-005', 'neptunelab', 'cyberwave', 'follow', null, true, hoursAgo(5.2)],
  ];

  for (const [id, user, from, type, tweetId, isRead, createdAt] of notifications) {
    await upsertById('notification', id, {
      userId: users[user].id,
      fromId: users[from].id,
      type,
      tweetId,
      isRead,
      createdAt,
    });
  }

  const chat = await prisma.chat.upsert({
    where: { id: 'demo-chat-nova-stargazer' },
    update: { name: null, isGroup: false },
    create: { id: 'demo-chat-nova-stargazer', name: null, isGroup: false },
  });

  for (const user of ['novapulse', 'stargazer']) {
    await prisma.chatParticipant.upsert({
      where: { chatId_userId: { chatId: chat.id, userId: users[user].id } },
      update: {},
      create: { chatId: chat.id, userId: users[user].id },
    });
  }

  const messages = [
    ['demo-msg-001', 'stargazer', 'novapulse', 'Привет, исследователь! Нашёл новый кадр для главной.', null, true, hoursAgo(1.7)],
    ['demo-msg-002', 'novapulse', 'stargazer', 'Вау. Это прямо ложится в новый дизайн.', mediaSvg({ title: 'Shared Frame', subtitle: 'chat attachment', a: '#22d3ee', b: '#020617', c: '#8b5cf6' }), true, hoursAgo(1.5)],
    ['demo-msg-003', 'stargazer', 'novapulse', 'Готово к новому витку?', null, false, hoursAgo(1.2)],
  ];

  for (const [id, sender, receiver, content, imageUrl, isRead, createdAt] of messages) {
    await upsertById('message', id, {
      chatId: chat.id,
      senderId: users[sender].id,
      receiverId: users[receiver].id,
      content,
      imageUrl,
      isRead,
      createdAt,
    });
  }

  console.log('Seed completed.');
  console.log('Demo users: novapulse, stargazer, neptunelab, cyberwave, deepspace, astrovision');
  console.log('Password for all demo users: password123');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
