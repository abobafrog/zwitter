// src/routes/chat.routes.js
const router = require('express').Router();
const { body } = require('express-validator');
const {
  getChats,
  createOrGetChat,
  createGroupChat,
  updateGroupChat,
  addGroupParticipants,
  removeGroupParticipant,
  deleteGroupChat,
  getMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  toggleReaction,
} = require('../controllers/chat.controller');
const { authenticate } = require('../middleware/auth');
const { messageLimiter } = require('../middleware/rateLimiter');
const { uploadMessageImage } = require('../config/cloudinary');
const { uploadProfileMedia } = require('../config/cloudinary');
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
    body('participantIds').isArray({ min: 1 }).withMessage('Выберите минимум одного участника'),
  ],
  validate,
  createGroupChat
);

router.patch(
  '/:chatId/group',
  uploadProfileMedia.single('avatar'),
  [
    body('name').optional().trim().isLength({ min: 2, max: 100 }).withMessage('Название группы 2-100 символов'),
    body('description').optional().trim().isLength({ max: 180 }).withMessage('Описание до 180 символов'),
  ],
  validate,
  updateGroupChat
);

router.post(
  '/:chatId/group/participants',
  [body('participantIds').isArray({ min: 1 }).withMessage('Выберите минимум одного участника')],
  validate,
  addGroupParticipants
);

router.delete('/:chatId/group/participants/:userId', removeGroupParticipant);
router.delete('/:chatId/group', deleteGroupChat);

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
