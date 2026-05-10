const router = require('express').Router();
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const {
  searchMusic,
  searchCatalog,
  getArtistCatalog,
  resolveCatalogTrack,
  streamMuffonTrack,
  getTrackLyrics,
  recognizeTrack,
} = require('../controllers/music.controller');

const recognizeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

router.get('/muffon/stream/:source/:trackId', streamMuffonTrack);
router.get('/search', searchMusic);
router.post('/search', searchMusic);
router.get('/catalog/search', searchCatalog);
router.get('/catalog/artist', getArtistCatalog);
router.get('/catalog/resolve', resolveCatalogTrack);
router.get('/lyrics', getTrackLyrics);

router.use(authenticate);

router.post('/recognize', recognizeUpload.single('sample'), recognizeTrack);

module.exports = router;
