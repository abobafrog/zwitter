// src/controllers/auth.controller.js
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const prisma = require('../config/prisma');
const logger = require('../utils/logger');
const { sendPasswordResetEmail, sendVerificationEmail } = require('../services/mail.service');

const REFRESH_COOKIE = 'zw_refresh';
const refreshTtlDays = parseInt(process.env.JWT_REFRESH_TTL_DAYS, 10) || 7;
const VERIFY_EMAIL = 'verify_email';
const PASSWORD_RESET = 'password_reset';
const verificationTtlHours = parseInt(process.env.EMAIL_VERIFY_TTL_HOURS, 10) || 24;
const passwordResetTtlMinutes = parseInt(process.env.PASSWORD_RESET_TTL_MINUTES, 10) || 60;

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const createRawToken = () => crypto.randomBytes(32).toString('hex');
const createVerificationCode = () => crypto.randomInt(100000, 1000000).toString();
const appUrl = () => process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:3000';

const getCookie = (req, name) => {
  const cookies = req.headers.cookie?.split(';') || [];
  const cookie = cookies.find((item) => item.trim().startsWith(`${name}=`));
  if (!cookie) return null;
  return decodeURIComponent(cookie.split('=').slice(1).join('='));
};

const refreshCookieOptions = () => {
  const secure = process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure,
    sameSite: process.env.COOKIE_SAMESITE || (secure ? 'none' : 'lax'),
    path: '/api/auth',
    maxAge: refreshTtlDays * 24 * 60 * 60 * 1000,
  };
};

const setRefreshCookie = (res, token) => {
  res.cookie(REFRESH_COOKIE, token, refreshCookieOptions());
};

const clearRefreshCookie = (res) => {
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
};

const generateTokens = (userId) => {
  const accessToken = jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  });
  const refreshToken = jwt.sign({ userId, jti: uuidv4() }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });
  return { accessToken, refreshToken };
};

const getPublicUser = async (userId) => prisma.user.findUnique({
  where: { id: userId },
  select: {
    id: true,
    username: true,
    email: true,
    emailVerified: true,
    emailVerifiedAt: true,
    displayName: true,
    avatarUrl: true,
    isVerified: true,
    isCommunity: true,
    createdAt: true,
  },
});

const saveRefreshToken = async (refreshToken, userId) => {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + refreshTtlDays);

  await prisma.refreshToken.create({
    data: { token: hashToken(refreshToken), userId, expiresAt },
  });
};

const createAccountToken = async ({ userId, type, ttlMs, rawToken = createRawToken(), tokenHash = hashToken(rawToken) }) => {
  const expiresAt = new Date(Date.now() + ttlMs);

  await prisma.accountToken.deleteMany({ where: { userId, type } });
  await prisma.accountToken.create({
    data: {
      userId,
      type,
      tokenHash,
      expiresAt,
    },
  });

  return rawToken;
};

const createPasswordResetUrl = (token) => `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;

const sendEmailVerification = async (user) => {
  const code = createVerificationCode();
  await createAccountToken({
    userId: user.id,
    type: VERIFY_EMAIL,
    ttlMs: verificationTtlHours * 60 * 60 * 1000,
    rawToken: code,
    tokenHash: hashToken(`${user.id}:${code}`),
  });

  return sendVerificationEmail({
    to: user.email,
    displayName: user.displayName,
    code,
  });
};

const sendPasswordReset = async (user) => {
  const token = await createAccountToken({
    userId: user.id,
    type: PASSWORD_RESET,
    ttlMs: passwordResetTtlMinutes * 60 * 1000,
  });

  return sendPasswordResetEmail({
    to: user.email,
    displayName: user.displayName,
    url: createPasswordResetUrl(token),
  });
};

const useAccountToken = async ({ token, type }) => {
  const tokenHash = hashToken(token);
  const record = await prisma.accountToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!record || record.type !== type) return null;
  if (record.expiresAt < new Date()) {
    await prisma.accountToken.delete({ where: { id: record.id } }).catch(() => {});
    return null;
  }

  await prisma.accountToken.delete({ where: { id: record.id } });
  return record.user;
};

const useEmailVerificationCode = async ({ email, code }) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return null;

  const record = await prisma.accountToken.findUnique({
    where: { tokenHash: hashToken(`${user.id}:${code}`) },
  });

  if (!record || record.userId !== user.id || record.type !== VERIFY_EMAIL) return null;
  if (record.expiresAt < new Date()) {
    await prisma.accountToken.delete({ where: { id: record.id } }).catch(() => {});
    return null;
  }

  await prisma.accountToken.delete({ where: { id: record.id } });
  return user;
};

const register = async (req, res, next) => {
  try {
    const { username, email, password, displayName } = req.body;

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        username: username.toLowerCase(),
        email: email.toLowerCase(),
        passwordHash,
        displayName: displayName || username,
        emailVerified: false,
      },
      select: {
        id: true,
        username: true,
        email: true,
        emailVerified: true,
        displayName: true,
        avatarUrl: true,
        isVerified: true,
        isCommunity: true,
        createdAt: true,
      },
    });

    let emailSent = false;
    try {
      const result = await sendEmailVerification(user);
      emailSent = result.sent;
    } catch (mailError) {
      logger.error('Verification email send error:', mailError);
    }

    logger.info(`New user registered: ${user.username} (${user.id})`);

    clearRefreshCookie(res);
    res.status(201).json({
      message: emailSent
        ? 'Аккаунт создан. Проверь почту и подтверди email.'
        : 'Аккаунт создан, но письмо не отправилось. Попробуй отправить письмо ещё раз.',
      user,
      emailSent,
    });
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { login: loginInput, password } = req.body;

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: loginInput.toLowerCase() },
          { username: loginInput.toLowerCase() },
        ],
      },
    });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    if (!user.emailVerified) {
      clearRefreshCookie(res);
      return res.status(403).json({
        error: 'Подтверди email, чтобы войти в аккаунт',
        code: 'EMAIL_NOT_VERIFIED',
        email: user.email,
      });
    }

    const { accessToken, refreshToken } = generateTokens(user.id);

    await saveRefreshToken(refreshToken, user.id);
    setRefreshCookie(res, refreshToken);

    logger.info(`User logged in: ${user.username}`);

    const { passwordHash, ...userWithoutPassword } = user;

    res.json({
      message: 'Вход выполнен',
      user: userWithoutPassword,
      accessToken,
    });
  } catch (error) {
    next(error);
  }
};

const refresh = async (req, res, next) => {
  try {
    const refreshToken = req.body?.refreshToken || getCookie(req, REFRESH_COOKIE);
    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token отсутствует' });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const tokenHash = hashToken(refreshToken);

    const stored = await prisma.refreshToken.findUnique({
      where: { token: tokenHash },
    });

    if (!stored || stored.expiresAt < new Date()) {
      clearRefreshCookie(res);
      return res.status(401).json({ error: 'Refresh token недействителен или истёк' });
    }

    await prisma.refreshToken.delete({ where: { id: stored.id } });

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(decoded.userId);
    const user = await getPublicUser(decoded.userId);
    if (!user) {
      clearRefreshCookie(res);
      return res.status(401).json({ error: 'Пользователь не найден' });
    }
    if (!user.emailVerified) {
      clearRefreshCookie(res);
      await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
      return res.status(401).json({ error: 'Email не подтверждён', code: 'EMAIL_NOT_VERIFIED' });
    }

    await saveRefreshToken(newRefreshToken, decoded.userId);
    setRefreshCookie(res, newRefreshToken);

    res.json({ accessToken, user });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      clearRefreshCookie(res);
      return res.status(401).json({ error: 'Недействительный refresh token' });
    }
    next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    const refreshToken = req.body?.refreshToken || getCookie(req, REFRESH_COOKIE);
    if (refreshToken) {
      await prisma.refreshToken.deleteMany({ where: { token: hashToken(refreshToken) } });
    }
    clearRefreshCookie(res);
    logger.info(`User logged out: ${req.user?.username}`);
    res.json({ message: 'Выход выполнен' });
  } catch (error) {
    next(error);
  }
};

const me = async (req, res) => {
  res.json({ user: req.user });
};

const verifyEmail = async (req, res, next) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    const code = req.body.code?.trim();
    if (!email) return res.status(400).json({ error: 'Укажи email' });
    if (!code) return res.status(400).json({ error: 'Код подтверждения отсутствует' });

    const user = await useEmailVerificationCode({ email, code });
    if (!user) return res.status(400).json({ error: 'Код подтверждения недействителен или истёк' });

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
    });

    res.json({ message: 'Email подтверждён. Теперь можно войти.' });
  } catch (error) {
    next(error);
  }
};

const resendVerification = async (req, res, next) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Укажи email' });

    const user = await prisma.user.findUnique({ where: { email } });
    if (user && !user.emailVerified) {
      await sendEmailVerification(user).catch((error) => logger.error('Resend verification error:', error));
    }

    res.json({ message: 'Если email есть и ещё не подтверждён, письмо отправлено.' });
  } catch (error) {
    next(error);
  }
};

const forgotPassword = async (req, res, next) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Укажи email' });

    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      await sendPasswordReset(user).catch((error) => logger.error('Password reset email error:', error));
    }

    res.json({ message: 'Если такой email зарегистрирован, мы отправили письмо для восстановления.' });
  } catch (error) {
    next(error);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const token = req.body.token?.trim();
    const password = req.body.password;
    if (!token) return res.status(400).json({ error: 'Токен отсутствует' });
    if (!password || password.length < 6 || !/\d/.test(password)) {
      return res.status(400).json({ error: 'Пароль минимум 6 символов и 1 цифра' });
    }

    const user = await useAccountToken({ token, type: PASSWORD_RESET });
    if (!user) return res.status(400).json({ error: 'Ссылка восстановления недействительна или истекла' });

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        emailVerified: true,
        emailVerifiedAt: user.emailVerifiedAt || new Date(),
      },
    });
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    await prisma.accountToken.deleteMany({ where: { userId: user.id } });
    clearRefreshCookie(res);

    res.json({ message: 'Пароль обновлён. Теперь можно войти.' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  refresh,
  logout,
  me,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
};
