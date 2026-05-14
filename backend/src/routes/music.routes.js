const router = require('express').Router();
const multer = require('multer');
const { authenticate, optionalAuth } = require('../middleware/auth');
const {
  searchMusic,
  searchCatalog,
  getArtistCatalog,
  resolveCatalogTrack,
  streamMuffonTrack,
  getTrackLyrics,
  getLikedTracks,
  toggleTrackLike,
  recognizeTrack,
} = require('../controllers/music.controller');

const recognizeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

router.get('/muffon/stream/:source/:trackId', streamMuffonTrack);
router.get('/search', optionalAuth, searchMusic);
router.post('/search', optionalAuth, searchMusic);
router.get('/catalog/search', optionalAuth, searchCatalog);
router.get('/catalog/artist', optionalAuth, getArtistCatalog);
router.get('/catalog/resolve', optionalAuth, resolveCatalogTrack);
router.get('/lyrics', getTrackLyrics);

router.use(authenticate);

router.get('/likes', getLikedTracks);
router.post('/tracks/like', toggleTrackLike);
router.post('/recognize', recognizeUpload.single('sample'), recognizeTrack);

module.exports = router;
