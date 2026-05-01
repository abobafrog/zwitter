const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { getNotifications, markAsRead, markOneAsRead } = require('../controllers/notification.controller');

router.get('/', authenticate, getNotifications);
router.patch('/', authenticate, markAsRead);
router.patch('/:id/read', authenticate, markOneAsRead);

module.exports = router;
