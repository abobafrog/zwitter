const crypto = require('crypto');
const { Readable } = require('stream');

const MUSIC_CLIENT = 'zwitter-feishin-music';
const MUSIC_API_VERSION = '1.16.1';
const STREAM_TTL_MS = 1000 * 60 * 20;

const fallbackTracks = [
  {
    id: 'glam-synth',
    title: 'Glam Synth',
    artist: 'Zwitter Audio',
    album: 'Local Library',
    duration: '0:04',
    source: 'local',
    audioUrl: '/audio/glam-synth.wav',
  },
  {
    id: 'neon-dance',
    title: 'Neon Dance',
    artist: 'Zwitter Audio',
    album: 'Local Library',
    duration: '0:04',
    source: 'local',
    audioUrl: '/audio/neon-dance.wav',
  },
  {
    id: 'space-ballad',
    title: 'Space Ballad',
    artist: 'Zwitter Audio',
    album: 'Local Library',
    duration: '0:04',
    source: 'local',
    audioUrl: '/audio/space-ballad.wav',
  },
];

const getConfig = (req) => {
  const requestBaseUrl = req?.body?.serverUrl || req?.query?.serverUrl;
  const requestUsername = req?.body?.username || req?.query?.username;
  const requestPassword = req?.body?.password || req?.query?.password;
  if (requestBaseUrl && requestUsername && requestPassword) {
    return {
      baseUrl: requestBaseUrl.replace(/\/+$/, ''),
      username: requestUsername,
      password: requestPassword,
      source: 'request',
    };
  }

  const baseUrl = process.env.SUBSONIC_URL || process.env.NAVIDROME_URL || process.env.MUSIC_SERVER_URL;
  const username = process.env.SUBSONIC_USERNAME || process.env.NAVIDROME_USERNAME || process.env.MUSIC_SERVER_USERNAME;
  const password = process.env.SUBSONIC_PASSWORD || process.env.NAVIDROME_PASSWORD || process.env.MUSIC_SERVER_PASSWORD;
  if (!baseUrl || !username || !password) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ''), username, password, source: 'env' };
};

const getSigningSecret = () => process.env.MUSIC_PROXY_SECRET || process.env.JWT_SECRET || 'dev-music-secret';

const packConfig = (config) => {
  if (config?.source !== 'request') return '';
  return Buffer.from(JSON.stringify({
    baseUrl: config.baseUrl,
    username: config.username,
    password: config.password,
  })).toString('base64url');
};

const unpackConfig = (token) => {
  if (!token) return null;
  try {
    const parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    return getConfig({ body: { serverUrl: parsed.baseUrl, username: parsed.username, password: parsed.password } });
  } catch (error) {
    return null;
  }
};

const signMusicUrl = (id, expires, configToken = '') => (
  crypto.createHmac('sha256', getSigningSecret()).update(`${id}:${expires}:${configToken}`).digest('hex')
);

const isValidSignature = (id, expires, signature, configToken = '') => {
  if (!id || !expires || !signature || Number(expires) < Date.now()) return false;
  const expected = signMusicUrl(id, expires, configToken);
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
};

const authParams = ({ username, password }) => {
  const salt = crypto.randomBytes(6).toString('hex');
  const token = crypto.createHash('md5').update(`${password}${salt}`).digest('hex');
  return {
    u: username,
    t: token,
    s: salt,
    v: MUSIC_API_VERSION,
    c: MUSIC_CLIENT,
    f: 'json',
  };
};

const subsonicUrl = (config, endpoint, params = {}) => {
  const url = new URL(`${config.baseUrl}/rest/${endpoint}.view`);
  Object.entries({ ...authParams(config), ...params }).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  });
  return url;
};

const formatDuration = (seconds) => {
  const value = Number(seconds) || 0;
  if (!value) return '';
  const minutes = Math.floor(value / 60);
  const rest = String(value % 60).padStart(2, '0');
  return `${minutes}:${rest}`;
};

const signedPath = (req, kind, id, config) => {
  const expires = Date.now() + STREAM_TTL_MS;
  const configToken = packConfig(config);
  const signature = signMusicUrl(id, expires, configToken);
  const extra = configToken ? `&config=${encodeURIComponent(configToken)}` : '';
  return `${req.baseUrl}/${kind}/${encodeURIComponent(id)}?expires=${expires}&signature=${signature}${extra}`;
};

const normalizeSong = (req, song, config) => {
  const id = song.id;
  return {
    id,
    title: song.title || 'Untitled track',
    artist: song.artist || song.albumArtist || 'Unknown artist',
    album: song.album || '',
    channelTitle: song.artist || song.albumArtist || 'OpenSubsonic',
    duration: formatDuration(song.duration),
    source: 'opensubsonic',
    audioUrl: signedPath(req, 'stream', id, config),
    thumbnailUrl: song.coverArt ? signedPath(req, 'cover', song.coverArt, config) : '',
  };
};

const searchSubsonicMusic = async (req, res) => {
  const config = getConfig(req);
  if (!config) {
    return res.json({
      tracks: fallbackTracks,
      source: 'local',
      message: 'Введите адрес Navidrome/OpenSubsonic, логин и пароль прямо в музыкальном сервисе.',
    });
  }

  try {
    const query = (req.query.q || '').toString().trim();
    const url = subsonicUrl(config, 'search3', {
      query,
      songCount: Math.min(Number(req.query.limit) || 24, 50),
      artistCount: 0,
      albumCount: 0,
    });
    const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`Subsonic responded ${response.status}`);
    const data = await response.json();
    const status = data['subsonic-response'];
    if (status?.status === 'failed') throw new Error(status?.error?.message || 'Subsonic request failed');
    const songs = status?.searchResult3?.song || [];
    const tracks = songs.filter((song) => song.id).map((song) => normalizeSong(req, song, config));

    return res.json({
      tracks,
      source: 'opensubsonic',
      message: tracks.length ? undefined : 'Музыкальный сервер не вернул треки по этому запросу.',
    });
  } catch (error) {
    return res.status(502).json({
      tracks: fallbackTracks,
      source: 'local',
      message: 'OpenSubsonic/Navidrome временно недоступен, показаны локальные демо-треки.',
    });
  }
};

const proxySubsonicMedia = async (req, res, endpoint) => {
  const { id } = req.params;
  const { expires, signature, config: configToken = '' } = req.query;
  const config = configToken ? unpackConfig(configToken) : getConfig();
  if (!config || !isValidSignature(id, expires, signature, configToken)) {
    return res.status(403).json({ message: 'Недействительная ссылка на музыку.' });
  }

  try {
    const response = await fetch(subsonicUrl(config, endpoint, { id }));
    if (!response.ok || !response.body) throw new Error(`Subsonic responded ${response.status}`);
    res.status(response.status);
    const contentType = response.headers.get('content-type');
    const contentLength = response.headers.get('content-length');
    if (contentType) res.setHeader('Content-Type', contentType);
    if (contentLength) res.setHeader('Content-Length', contentLength);
    res.setHeader('Cache-Control', 'private, max-age=300');
    return Readable.fromWeb(response.body).pipe(res);
  } catch (error) {
    return res.status(502).json({ message: 'Не удалось получить медиа с музыкального сервера.' });
  }
};

const streamSubsonicTrack = (req, res) => proxySubsonicMedia(req, res, 'stream');
const coverSubsonicTrack = (req, res) => proxySubsonicMedia(req, res, 'getCoverArt');

module.exports = { searchSubsonicMusic, streamSubsonicTrack, coverSubsonicTrack };
