// src/routes/chat.routes.js
const router = require('express').Router();
const { body } = require('express-validator');
const {
  getChats,
  createOrGetChat,
  createGroupChat,
  getMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  toggleReaction,
} = require('../controllers/chat.controller');
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

router.post(
  '/groups',
  [
    body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Название группы 2-100 символов'),
    body('participantIds').isArray({ min: 2 }).withMessage('Выберите минимум двух участников'),
  ],
  validate,
  createGroupChat
);

router.get('/:chatId/messages', getMessages);

router.patch(
  '/:chatId/messages/:messageId',
  [body('content').trim().isLength({ min: 1, max: 1000 }).withMessage('Сообщение 1-1000 символов')],
  validate,
  editMessage
);

router.delete('/:chatId/messages/:messageId', deleteMessage);

router.post(
  '/:chatId/messages/:messageId/reactions',
  [body('emoji').isString().notEmpty().withMessage('Выберите реакцию')],
  validate,
  toggleReaction
);

router.post(
  '/:chatId/messages',
  messageLimiter,
  uploadMessageImage.single('image'),
  [body('content').trim().isLength({ min: 1, max: 1000 }).withMessage('Сообщение 1-1000 символов')],
  validate,
  sendMessage
);

module.exports = router;
