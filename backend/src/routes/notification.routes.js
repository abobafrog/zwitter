const router = require('express').Router();
const { authenticate, optionalAuth } = require('../middleware/auth');
const { getNotifications, markAsRead} = require('../controllers/notification.controller');
router.get('/', authenticate, getNotifications);
router.patch('/', authenticate, markAsRead)


module.exports = router;
