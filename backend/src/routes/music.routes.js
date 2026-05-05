const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { coverSubsonicTrack, searchSubsonicMusic, streamSubsonicTrack } = require('../controllers/music.controller');

router.get('/stream/:id', streamSubsonicTrack);
router.get('/cover/:id', coverSubsonicTrack);

router.use(authenticate);

router.get('/subsonic/search', searchSubsonicMusic);
router.post('/subsonic/search', searchSubsonicMusic);

module.exports = router;
