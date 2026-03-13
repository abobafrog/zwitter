const router = require('express').Router();
const { getProfile, updateProfile, followUser, searchUsers, updateEmail, updatePassword } = require('../controllers/user.controller');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { uploadProfileMedia } = require('../config/cloudinary');
const { getUserTweets } = require('../controllers/user.controller');

router.get('/:username/tweets', optionalAuth, getUserTweets);
router.get('/search', authenticate, searchUsers);
router.get('/:username', optionalAuth, getProfile);

router.patch(
  '/me/profile',
  authenticate,
  uploadProfileMedia.fields([
    { name: 'avatar', maxCount: 1 },
    { name: 'banner', maxCount: 1 },
  ]),
  updateProfile
);

router.patch('/me/email', authenticate, updateEmail);
router.patch('/me/password', authenticate, updatePassword);
router.post('/:id/follow', authenticate, followUser);

module.exports = router;