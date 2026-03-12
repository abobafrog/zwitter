// src/routes/tweet.routes.js
const router = require('express').Router();
const { body } = require('express-validator');
const { getFeed, createTweet, getTweet, deleteTweet, likeTweet, retweetTweet } = require('../controllers/tweet.controller');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { tweetLimiter } = require('../middleware/rateLimiter');
const { uploadTweetImage } = require('../config/cloudinary');
const validate = require('../middleware/validate');

router.get('/feed', optionalAuth, getFeed);
router.get('/:id', optionalAuth, getTweet);

router.use(authenticate);

router.post(
  '/',
  tweetLimiter,
  uploadTweetImage.single('image'),
  [body('content').trim().isLength({ min: 1, max: 280 }).withMessage('Твит 1-280 символов')],
  validate,
  createTweet
);

router.delete('/:id', deleteTweet);
router.post('/:id/like', likeTweet);
router.post('/:id/retweet', retweetTweet);

module.exports = router;
