// src/routes/community.routes.js
const router = require('express').Router();
const { body } = require('express-validator');
const { authenticate, optionalAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
  listCommunities,
  listMyCommunities,
  createCommunity,
  getCommunity,
  getCommunityTweets,
  toggleCommunityMembership,
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
router.post('/:slug/join', authenticate, toggleCommunityMembership);

module.exports = router;
