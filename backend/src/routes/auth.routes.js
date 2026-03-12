// src/routes/auth.routes.js
const router = require('express').Router();
const { body } = require('express-validator');
const { register, login, refresh, logout, me } = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');
const prisma = require('../config/prisma');
const registerValidation = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 50 }).withMessage('Логин: 3-50 символов')
    .matches(/^[a-zA-Z0-9_]+$/).withMessage('Логин: только латиница, цифры и _'),
  body('email').isEmail().withMessage('Введите корректный email').normalizeEmail(),
  body('password')
    .isLength({ min: 6 }).withMessage('Пароль минимум 6 символов')
    .matches(/\d/).withMessage('Пароль должен содержать цифру'),
  body('displayName').optional().trim().isLength({ max: 100 }),
];

const loginValidation = [
  body('login').trim().notEmpty().withMessage('Введите логин или email'),
  body('password').notEmpty().withMessage('Введите пароль'),
];

router.post('/register', authLimiter, registerValidation, validate, register);
router.post('/login', authLimiter, loginValidation, validate, login);
router.post('/refresh', refresh);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, me);
router.get('/check', async (req, res) => {
  const { username, email } = req.query;
  const prisma = require('../config/prisma');

  const result = {};

  if (username) {
    const user = await prisma.user.findUnique({ where: { username: username.toLowerCase() } });
    result.usernameTaken = !!user;
  }

  if (email) {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    result.emailTaken = !!user;
  }

  res.json(result);
});

module.exports = router; // эта строка уже есть, не дублируй
module.exports = router;
router.get('/check-user', async (req, res) => {
  const { login } = req.query;
  if (!login || login.trim().length < 3) return res.json({ exists: false });

  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: login.toLowerCase().trim() },
          { email: login.toLowerCase().trim() },
        ],
      },
      select: { id: true }, // только факт существования, без данных
    });
    res.json({ exists: !!user });
  } catch {
    res.json({ exists: false });
  }
});