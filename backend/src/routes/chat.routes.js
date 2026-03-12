// src/routes/chat.routes.js
const router = require('express').Router();
const { body } = require('express-validator');
const { getChats, createOrGetChat, getMessages, sendMessage } = require('../controllers/chat.controller');
const { authenticate } = require('../middleware/auth');
const { messageLimiter } = require('../middleware/rateLimiter');
const { uploadMessageImage } = require('../config/cloudinary');
const validate = require('../middleware/validate');

router.use(authenticate);

router.get('/', getChats);

router.post(
  '/',
  [body('targetUserId').notEmpty().withMessage('Укажите пользователя')],
  validate,
  createOrGetChat
);

router.get('/:chatId/messages', getMessages);

router.post(
  '/:chatId/messages',
  messageLimiter,
  uploadMessageImage.single('image'),
  [body('content').trim().isLength({ min: 1, max: 1000 }).withMessage('Сообщение 1-1000 символов')],
  validate,
  sendMessage
);

module.exports = router;
