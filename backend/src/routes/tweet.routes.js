// src/routes/tweet.routes.js
const router = require('express').Router();
const { body } = require('express-validator');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { tweetLimiter, uploadLimiter } = require('../middleware/rateLimiter');
const { uploadAttachment } = require('../config/cloudinary');
const validate = require('../middleware/validate');
const {
  getFeed,
  getExplore,
  createTweet,
  updateTweet,
  getTweet,
  deleteTweet,
  reportTweet,
  listTweetReports,
  reviewTweetReport,
  likeTweet,
  retweetTweet,
  bookmarkTweet,
  getBookmarks,
  searchTweets,
} = require('../controllers/tweet.controller');

router.get('/feed', optionalAuth, getFeed);
router.get('/explore', optionalAuth, getExplore);
router.get('/search', optionalAuth, searchTweets);
router.get('/bookmarks', authenticate, getBookmarks);
router.get('/reports', authenticate, listTweetReports);
router.get('/:id', optionalAuth, getTweet);

router.use(authenticate);

router.post(
  '/',
  tweetLimiter,
  uploadLimiter,
  uploadAttachment.single('attachment'),
  [body('content').optional().trim().isLength({ max: 500 }).withMessage('Твит до 500 символов')],
  validate,
  createTweet
);

router.patch(
  '/:id',
  tweetLimiter,
  uploadLimiter,
  uploadAttachment.single('attachment'),
  [body('content').optional().trim().isLength({ max: 500 }).withMessage('Твит до 500 символов')],
  validate,
  updateTweet
);

router.delete('/:id', deleteTweet);
router.post('/:id/report', reportTweet);
router.patch('/reports/:id', reviewTweetReport);
router.post('/:id/like', likeTweet);
router.post('/:id/retweet', retweetTweet);
router.post('/:id/bookmark', bookmarkTweet);

module.exports = router;
