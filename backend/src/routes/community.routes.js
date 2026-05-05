// src/routes/community.routes.js
const router = require('express').Router();
const { body } = require('express-validator');
const { authenticate, optionalAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { uploadProfileMedia } = require('../config/cloudinary');
const {
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
  updateCommunityMemberRole,
  deleteCommunity,
} = require('../controllers/community.controller');

const communityValidation = [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Название: 2-100 символов'),
  body('slug')
    .trim()
    .isLength({ min: 3, max: 50 }).withMessage('Адрес: 3-50 символов')
    .matches(/^[a-zA-Z0-9_]+$/).withMessage('Адрес: только латиница, цифры и _'),
  body('bio').optional().trim().isLength({ max: 180 }).withMessage('Описание до 180 символов'),
];

router.get('/', optionalAuth, listCommunities);
router.get('/mine', authenticate, listMyCommunities);
router.post('/', authenticate, communityValidation, validate, createCommunity);
router.get('/:slug', optionalAuth, getCommunity);
router.get('/:slug/tweets', optionalAuth, getCommunityTweets);
router.get('/:slug/members', authenticate, listCommunityMembers);
router.patch(
  '/:slug',
  authenticate,
  uploadProfileMedia.fields([
    { name: 'avatar', maxCount: 1 },
    { name: 'banner', maxCount: 1 },
  ]),
  [
    body('name').optional().trim().isLength({ min: 2, max: 100 }).withMessage('Название: 2-100 символов'),
    body('bio').optional().trim().isLength({ max: 180 }).withMessage('Описание до 180 символов'),
  ],
  validate,
  updateCommunity
);
router.post(
  '/:slug/members',
  authenticate,
  [body('userIds').isArray({ min: 1 }).withMessage('Выберите минимум одного пользователя')],
  validate,
  addCommunityMembers
);
router.delete('/:slug/members/:userId', authenticate, removeCommunityMember);
router.patch('/:slug/members/:userId/role', authenticate, [body('role').isIn(['member', 'admin']).withMessage('Роль должна быть member или admin')], validate, updateCommunityMemberRole);
router.delete('/:slug', authenticate, deleteCommunity);
router.post('/:slug/join', authenticate, toggleCommunityMembership);

module.exports = router;
