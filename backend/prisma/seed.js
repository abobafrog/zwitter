// prisma/seed.js
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  const password = await bcrypt.hash('password123', 12);

  const alice = await prisma.user.upsert({
    where: { username: 'alice' },
    update: {},
    create: {
      username: 'alice',
      email: 'alice@example.com',
      passwordHash: password,
      displayName: 'Alice Johnson',
      bio: 'Frontend developer 🚀',
      isVerified: true,
    },
  });

  const bob = await prisma.user.upsert({
    where: { username: 'bob' },
    update: {},
    create: {
      username: 'bob',
      email: 'bob@example.com',
      passwordHash: password,
      displayName: 'Bob Smith',
      bio: 'Backend engineer & coffee lover ☕',
    },
  });

  // Create tweets
  await prisma.tweet.createMany({
    data: [
      { content: 'Привет всем! Это мой первый твит 👋', authorId: alice.id },
      { content: 'Работаю над крутым проектом на React + Node.js. Socket.IO просто огонь! 🔥', authorId: alice.id },
      { content: 'Только что задеплоил новый микросервис. CI/CD работает идеально 💪', authorId: bob.id },
      { content: 'PostgreSQL + Prisma = ❤️ Лучшая комбинация для TypeScript', authorId: bob.id },
    ],
    skipDuplicates: true,
  });

  // Create a chat
  const chat = await prisma.chat.create({
    data: {
      isGroup: false,
      participants: {
        create: [{ userId: alice.id }, { userId: bob.id }],
      },
    },
  });

  await prisma.message.createMany({
    data: [
      { chatId: chat.id, senderId: alice.id, receiverId: bob.id, content: 'Привет, Боб! Как дела?', isRead: true },
      { chatId: chat.id, senderId: bob.id, receiverId: alice.id, content: 'Привет, Алиса! Всё отлично, работаю над новым проектом', isRead: true },
      { chatId: chat.id, senderId: alice.id, receiverId: bob.id, content: 'Звучит интересно! Расскажи подробнее 🤔', isRead: false },
    ],
  });

  console.log('✅ Seed completed!');
  console.log('👤 Test users: alice / bob (password: password123)');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
