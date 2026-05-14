const { Readable } = require('stream');
const { spawn } = require('child_process');
const prisma = require('../config/prisma');

const DEFAULT_MUFFON_API_URL = 'https://muffon.app/api';
const MUFFON_API_URL = (process.env.MUFFON_API_URL || DEFAULT_MUFFON_API_URL).replace(/\/+$/, '');
const MUFFON_API_TOKEN = process.env.MUFFON_API_TOKEN || '';
const MUFFON_API_VERSION = process.env.MUFFON_API_VERSION || '2.4.0';
const AUDD_API_URL = process.env.AUDD_API_URL || 'https://api.audd.io/';
const AUDD_API_TOKEN = process.env.AUDD_API_TOKEN || '';
const ITUNES_SEARCH_URL = 'https://itunes.apple.com/search';
const ITUNES_LOOKUP_URL = 'https://itunes.apple.com/lookup';
const DEFAULT_SOURCES = ['yandexmusic', 'vk', 'odnoklassniki', 'youtubemusic', 'soundcloud'];
const MUFFON_SOURCES = (process.env.MUFFON_SOURCES || DEFAULT_SOURCES.join(','))
  .split(',')
  .map((source) => source.trim().toLowerCase())
  .filter(Boolean);

const SOURCE_LABELS = {
  yandexmusic: 'Yandex Music',
  vk: 'VK Music',
  odnoklassniki: 'OK Music',
  youtubemusic: 'YouTube Music',
  soundcloud: 'SoundCloud',
};

const ALLOWED_SOURCES = new Set(Object.keys(SOURCE_LABELS));
const PREVIEW_ONLY_SOURCES = new Set(
  (process.env.MUFFON_PREVIEW_ONLY_SOURCES || 'yandexmusic')
    .split(',')
    .map((source) => source.trim().toLowerCase())
    .filter(Boolean)
);
const PREVIEW_DURATION_SECONDS = 35;
const DERIVATIVE_TRACK_MARKERS = ['sped up', 'slowed', 'reverb', 'remix', 'tik tok', 'tiktok', 'karaoke', 'instrumental', 'cover', 'edit'];
const EXPLICIT_TRACK_MARKERS = ['explicit', 'uncensored'];

const formatDuration = (seconds) => {
  const value = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(value / 60);
  const rest = String(value % 60).padStart(2, '0');
  return value ? `${minutes}:${rest}` : '';
};

const normalizeText = (value = '') => value
  .toString()
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9а-яё]+/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const stripDerivativeMarkers = (value = '') => {
  let next = value.toString();
  DERIVATIVE_TRACK_MARKERS.forEach((marker) => {
    const pattern = new RegExp(`\\b${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'ig');
    next = next.replace(pattern, ' ');
  });
  return next
    .replace(/\((.*?)\)/g, ' ')
    .replace(/\[(.*?)\]/g, ' ')
    .replace(/\s+-\s+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const musicTrackKey = ({ title = '', artist = '' }) => {
  const normalizedTitle = normalizeText(title).slice(0, 110);
  const normalizedArtist = normalizeText(primaryArtistName(artist)).slice(0, 110);
  if (!normalizedTitle) return '';
  return `${normalizedArtist || 'unknown'}::${normalizedTitle}`;
};

const trackIdentityFrom = (track = {}) => ({
  key: musicTrackKey(track),
  title: (track.title || '').toString().trim().slice(0, 240),
  artist: (track.artist || track.channelTitle || '').toString().trim().slice(0, 240),
  album: (track.album || '').toString().trim().slice(0, 240) || null,
  imageUrl: (track.fullArtworkUrl || track.thumbnailUrl || track.image || '').toString().trim().slice(0, 1000) || null,
  audioUrl: (track.audioUrl || track.previewUrl || track.streamUrl || '').toString().trim().slice(0, 1000) || null,
  provider: (track.provider || track.source || '').toString().trim().slice(0, 80) || null,
  providerLabel: (track.providerLabel || '').toString().trim().slice(0, 120) || null,
  duration: (track.duration || '').toString().trim().slice(0, 20) || null,
  durationSeconds: numberValue(track.durationSeconds) || null,
});

const upsertMusicTrack = async (track, tx = prisma) => {
  const data = trackIdentityFrom(track);
  if (!data.key || !data.title) return null;
  return tx.musicTrack.upsert({
    where: { key: data.key },
    create: data,
    update: {
      title: data.title,
      artist: data.artist,
      album: data.album,
      imageUrl: data.imageUrl,
      audioUrl: data.audioUrl,
      provider: data.provider,
      providerLabel: data.providerLabel,
      duration: data.duration,
      durationSeconds: data.durationSeconds,
    },
  });
};

const hydrateTrackRatings = async (tracks, userId = null) => {
  const items = Array.isArray(tracks) ? tracks : [];
  const keys = [...new Set(items.map((track) => musicTrackKey(track)).filter(Boolean))];
  if (!keys.length) return items;

  const [ratings, userLikes] = await Promise.all([
    prisma.musicTrack.findMany({
      where: { key: { in: keys } },
      select: { key: true, likesCount: true },
    }),
    userId ? prisma.musicTrackLike.findMany({
      where: { userId, track: { key: { in: keys } } },
      select: { track: { select: { key: true } } },
    }) : Promise.resolve([]),
  ]);
  const ratingMap = new Map(ratings.map((item) => [item.key, item.likesCount]));
  const likedKeys = new Set(userLikes.map((item) => item.track.key));

  return items.map((track) => {
    const key = musicTrackKey(track);
    return {
      ...track,
      trackKey: key,
      likesCount: ratingMap.get(key) || 0,
      likedByMe: likedKeys.has(key),
    };
  });
};

const canonicalTrackText = (value = '') => normalizeText(stripDerivativeMarkers(value));
const primaryArtistName = (value = '') => value
  .toString()
  .split(/,|&| feat\. | feat | x | with /i)[0]
  .trim();

const firstValue = (...values) => values.find((value) => value !== undefined && value !== null && value !== '');

const numberValue = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const imageUrlFrom = (image) => {
  if (!image) return '';
  if (typeof image === 'string') return image;
  return firstValue(image.medium, image.large, image.original, image.small, image.extrasmall, image.url) || '';
};

const artistNameFrom = (track) => {
  const artist = track.artist;
  if (typeof artist === 'string') return artist;
  if (Array.isArray(artist)) return artist.map((item) => item?.name || item).filter(Boolean).join(', ');
  if (artist?.name) return artist.name;
  if (Array.isArray(track.artists)) return track.artists.map((item) => item?.name || item).filter(Boolean).join(', ');
  return '';
};

const albumTitleFrom = (album) => {
  if (!album) return '';
  if (typeof album === 'string') return album;
  return album.title || album.name || '';
};

const sourceIdFrom = (track) => {
  const sourceId = track.source?.id || track.source_id || track.sourceId || track.track_id || track.id;
  if (sourceId === undefined || sourceId === null) return '';
  return sourceId.toString();
};

const findTrackItems = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  const candidates = [
    payload.search?.tracks,
    payload.tracks,
    payload.data?.tracks,
    payload.results?.tracks,
    payload.search?.items,
    payload.items,
    payload.collection,
    payload.search?.collection,
  ];
  return candidates.find(Array.isArray) || [];
};

const audioPresentFrom = (track) => (
  track?.audio?.present !== false &&
  track?.audio_present !== false &&
  track?.audioPresent !== false
);

const muffonParams = (extra = {}) => {
  const params = new URLSearchParams({
    version: MUFFON_API_VERSION,
    ...extra,
  });
  if (MUFFON_API_TOKEN) params.set('token', MUFFON_API_TOKEN);
  return params;
};

const muffonUrl = (path, params) => `${MUFFON_API_URL}/${path.replace(/^\/+/, '')}?${params}`;

const fetchMuffonJson = async (url, options = {}, attempts = 1) => {
  let lastResult = null;
  for (let index = 0; index < attempts; index += 1) {
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => ({}));
    lastResult = { response, payload };
    if (response.ok && !payload.error) return lastResult;
    if (index < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 250 * (index + 1)));
  }
  return lastResult;
};

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
};

const normalizeMuffonTrack = (track, source) => {
  const sourceId = sourceIdFrom(track);
  const artist = artistNameFrom(track) || SOURCE_LABELS[source] || 'Muffon';
  const title = track.title || track.name || 'Без названия';
  const durationSeconds = numberValue(track.duration);
  const previewOnly = PREVIEW_ONLY_SOURCES.has(source) || (durationSeconds > 0 && durationSeconds <= PREVIEW_DURATION_SECONDS);
  const explicit = EXPLICIT_TRACK_MARKERS.some((marker) => normalizeText(`${artist} ${title} ${albumTitleFrom(track.album)}`).includes(marker));
  if (!sourceId || !title || !audioPresentFrom(track)) return null;

  return {
    id: `muffon-${source}-${sourceId}`,
    sourceId,
    playerId: track.player_id || track.playerId || '',
    title,
    artist,
    album: albumTitleFrom(track.album),
    channelTitle: artist,
    duration: formatDuration(track.duration),
    durationSeconds,
    source: 'muffon',
    provider: source,
    providerLabel: SOURCE_LABELS[source] || 'Muffon',
    previewOnly,
    explicit,
    sourceLink: track.source?.links?.original || track.source?.links?.streaming || '',
    audioUrl: `/api/music/muffon/stream/${encodeURIComponent(source)}/${encodeURIComponent(sourceId)}`,
    thumbnailUrl: imageUrlFrom(track.image),
    trackKey: musicTrackKey({ title, artist }),
  };
};

const scoreTrack = (track, query) => {
  const normalizedQuery = normalizeText(query);
  const canonicalQuery = canonicalTrackText(query);
  const title = normalizeText(track.title);
  const canonicalTitle = canonicalTrackText(track.title);
  const artist = normalizeText(track.artist);
  const album = normalizeText(track.album);
  const combined = `${title} ${artist} ${album}`;
  const queryTokens = normalizedQuery.split(' ').filter(Boolean);

  let score = 0;

  if (title === normalizedQuery) score += 120;
  if (canonicalTitle === canonicalQuery && canonicalQuery) score += 140;
  if (artist === normalizedQuery) score += 280;
  if (`${artist} ${title}` === normalizedQuery) score += 260;
  if (title.includes(normalizedQuery)) score += 110;
  if (canonicalQuery && canonicalTitle.includes(canonicalQuery)) score += 90;
  if (artist.includes(normalizedQuery)) score += 90;
  if (album.includes(normalizedQuery)) score += 20;

  score += queryTokens.reduce((sum, token) => {
    if (title.includes(token)) return sum + 22;
    if (artist.includes(token)) return sum + 16;
    if (album.includes(token)) return sum + 6;
    return sum;
  }, 0);

  score += Math.min(numberValue(track.durationSeconds), 480) / 12;
  if (track.sourceLink) score += 12;
  if (track.previewOnly) score -= 180;
  if (track.provider === 'soundcloud') score += 8;
  score += Math.min(numberValue(track.likesCount), 250) * 12;
  if (DERIVATIVE_TRACK_MARKERS.some((marker) => combined.includes(marker))) score -= 70;

  return score;
};

const resolveMatchScore = (track, { title = '', artist = '' }) => {
  const normalizedTitle = normalizeText(title);
  const canonicalTitle = canonicalTrackText(title);
  const normalizedArtist = normalizeText(artist);
  const trackTitle = normalizeText(track.title);
  const trackCanonicalTitle = canonicalTrackText(track.title);
  const trackArtist = normalizeText(track.artist);

  let score = 0;

  if (normalizedArtist && trackArtist === normalizedArtist) score += 240;
  else if (normalizedArtist && trackArtist.includes(normalizedArtist)) score += 150;

  if (normalizedTitle && trackTitle === normalizedTitle) score += 260;
  if (canonicalTitle && trackCanonicalTitle === canonicalTitle) score += 320;
  else if (canonicalTitle && trackCanonicalTitle.includes(canonicalTitle)) score += 180;
  else if (normalizedTitle && trackTitle.includes(normalizedTitle)) score += 120;

  if (DERIVATIVE_TRACK_MARKERS.some((marker) => normalizeText(track.title).includes(marker))) score -= 70;
  if (track.sourceLink) score += 10;
  score += Math.min(numberValue(track.likesCount), 250) * 10;
  score += Math.min(numberValue(track.durationSeconds), 480) / 18;

  return score;
};

const artistMatches = (candidate = '', expected = '') => {
  const candidateArtist = normalizeText(primaryArtistName(candidate));
  const expectedArtist = normalizeText(primaryArtistName(expected));
  if (!expectedArtist) return true;
  if (!candidateArtist) return false;
  return (
    candidateArtist === expectedArtist ||
    candidateArtist.includes(expectedArtist) ||
    expectedArtist.includes(candidateArtist)
  );
};

const uniqueTracks = (items) => {
  const seen = new Set();
  return items.filter((track) => {
    if (track.previewOnly) return false;
    const key = `${normalizeText(track.provider)}:${normalizeText(track.title)}:${normalizeText(track.artist)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const bestLyricsCandidate = (items, { title, artist, duration }) => {
  const normalizedTitle = normalizeText(title);
  const normalizedArtist = normalizeText(artist);
  const durationSeconds = numberValue(duration);

  return [...items].sort((left, right) => {
    const score = (item) => {
      let value = 0;
      const itemTitle = normalizeText(item.trackName || item.name);
      const itemArtist = normalizeText(item.artistName);
      const itemDuration = numberValue(item.duration);

      if (itemTitle === normalizedTitle) value += 180;
      if (itemArtist === normalizedArtist) value += 140;
      if (`${itemArtist} ${itemTitle}` === `${normalizedArtist} ${normalizedTitle}`) value += 120;
      if (itemTitle.includes(normalizedTitle)) value += 70;
      if (itemArtist.includes(normalizedArtist)) value += 50;
      if (durationSeconds > 0 && itemDuration > 0) {
        value += Math.max(0, 30 - Math.abs(durationSeconds - itemDuration));
      }
      if (item.syncedLyrics) value += 16;
      if (item.plainLyrics) value += 10;
      return value;
    };

    return score(right) - score(left);
  })[0];
};

const hasProductionTokenIssue = (payload, status) => (
  status === 403 ||
  payload?.error?.code === 403 ||
  normalizeText(payload?.error?.text).includes('forbidden')
);

const searchSource = async ({ source, query, limit }) => {
  const params = muffonParams({
    query,
    page: '1',
    limit: String(limit),
  });

  const { response, payload } = await fetchMuffonJson(muffonUrl(`${source}/search/tracks`, params), {
    signal: AbortSignal.timeout(14000),
  }, 2);
  if (!response.ok || payload.error) {
    const error = new Error(payload?.error?.text || `muffon ${source} responded ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return findTrackItems(payload)
    .map((track) => normalizeMuffonTrack(track, source))
    .filter(Boolean);
};

const findPlayableTracks = async ({ query, limit }) => {
  const sources = MUFFON_SOURCES.filter((source) => ALLOWED_SOURCES.has(source));
  const perSourceLimit = Math.max(8, Math.ceil(limit / Math.max(sources.length, 1)) + 6);
  const results = await Promise.allSettled(
    sources.map((source) => searchSource({ source, query, limit: perSourceLimit }))
  );
  const errors = results.filter((result) => result.status === 'rejected').map((result) => result.reason);
  const tracks = uniqueTracks(
    results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
  )
    .sort((left, right) => scoreTrack(right, query) - scoreTrack(left, query))
    .slice(0, limit);

  return { tracks, errors, sources };
};

const findPlayableTrackCandidates = async ({ queries, limitPerQuery = 16 }) => {
  const settled = await Promise.allSettled(
    queries.map((query) => findPlayableTracks({ query, limit: limitPerQuery }))
  );

  return {
    tracks: uniqueTracks(
      settled.flatMap((result) => (result.status === 'fulfilled' ? result.value.tracks : []))
    ),
    errors: settled.flatMap((result) => (result.status === 'fulfilled' ? result.value.errors : [result.reason])),
  };
};

const searchMusic = async (req, res) => {
  const query = (req.body?.q || req.query?.q || '').toString().trim();
  const limit = Math.max(1, Math.min(Number(req.body?.limit || req.query?.limit) || 24, 50));
  if (!query) {
    return res.json({ tracks: [], source: 'muffon', message: 'Введите название трека или артиста.' });
  }

  try {
    const { tracks: rawTracks, errors, sources } = await findPlayableTracks({ query, limit });
    const tracks = (await hydrateTrackRatings(rawTracks, req.user?.id))
      .sort((left, right) => scoreTrack(right, query) - scoreTrack(left, query));

    if (!tracks.length && errors.some((error) => hasProductionTokenIssue(error.payload, error.status))) {
      return res.status(502).json({
        tracks: [],
        source: 'muffon',
        message: 'Muffon API требует токен. Укажите MUFFON_API_TOKEN или MUFFON_API_URL на локальный muffon-api.',
      });
    }

    return res.json({
      tracks,
      source: 'muffon',
      sources,
      message: tracks.length ? undefined : 'Muffon не вернул подходящих треков. Попробуйте другой запрос или источник.',
    });
  } catch (error) {
    return res.status(502).json({
      tracks: [],
      source: 'muffon',
      message: 'Muffon сейчас недоступен для поиска.',
    });
  }
};

const normalizeCatalogArtist = (item) => ({
  id: item.artistId?.toString() || item.amgArtistId?.toString() || '',
  name: item.artistName || '',
  image: item.artworkUrl100 || '',
  genre: item.primaryGenreName || '',
  link: item.artistLinkUrl || '',
});

const normalizeCatalogTrack = (item) => ({
  id: item.trackId?.toString() || '',
  title: item.trackName || '',
  artist: item.artistName || '',
  album: item.collectionName || '',
  durationMs: numberValue(item.trackTimeMillis),
  duration: formatDuration(Math.round(numberValue(item.trackTimeMillis) / 1000)),
  previewUrl: item.previewUrl || '',
  audioUrl: item.previewUrl || '',
  image: firstValue(item.artworkUrl100, item.artworkUrl60) || '',
  thumbnailUrl: firstValue(item.artworkUrl100, item.artworkUrl60) || '',
  fullArtworkUrl: firstValue(item.artworkUrl100, item.artworkUrl60) || '',
  releaseDate: item.releaseDate || '',
  genre: item.primaryGenreName || '',
  explicit: (item.trackExplicitness || '').toLowerCase() === 'explicit',
  source: 'catalog',
  provider: 'catalog',
  providerLabel: 'Каталог превью',
  previewOnly: Boolean(item.previewUrl),
  trackKey: musicTrackKey({ title: item.trackName || '', artist: item.artistName || '' }),
});

const normalizeCatalogAlbum = (item) => ({
  id: item.collectionId?.toString() || '',
  title: item.collectionName || '',
  artist: item.artistName || '',
  image: firstValue(item.artworkUrl100, item.artworkUrl60) || '',
  trackCount: numberValue(item.trackCount),
  year: item.releaseDate ? new Date(item.releaseDate).getFullYear() : null,
  explicit: (item.collectionExplicitness || '').toLowerCase() === 'explicit',
});

const exactArtistScore = (item, name) => {
  const normalizedName = normalizeText(name);
  const candidate = normalizeText(item.artistName);
  if (!candidate) return 0;
  if (candidate === normalizedName) return 400;
  if (candidate.startsWith(normalizedName)) return 260;
  if (candidate.includes(normalizedName)) return 180;
  return 0;
};

const searchCatalog = async (req, res) => {
  const query = (req.query.q || '').toString().trim();
  if (!query) {
    return res.json({ artists: [], tracks: [], albums: [] });
  }

  try {
    const params = new URLSearchParams({
      term: query,
      media: 'music',
      entity: 'musicArtist,song,album',
      limit: '50',
      country: 'US',
    });
    const { response, payload } = await fetchJson(`${ITUNES_SEARCH_URL}?${params.toString()}`, {
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error('catalog search failed');

    const results = Array.isArray(payload?.results) ? payload.results : [];
    const artists = results.filter((item) => item.wrapperType === 'artist').map(normalizeCatalogArtist);
    const tracks = await hydrateTrackRatings(
      results.filter((item) => item.wrapperType === 'track' && item.kind === 'song').map(normalizeCatalogTrack),
      req.user?.id
    );
    const albums = results.filter((item) => item.wrapperType === 'collection').map(normalizeCatalogAlbum);
    return res.json({ artists, tracks, albums });
  } catch {
    return res.status(502).json({ artists: [], tracks: [], albums: [], message: 'Не удалось загрузить каталог артиста.' });
  }
};

const getArtistCatalog = async (req, res) => {
  const name = (req.query.name || '').toString().trim();
  const artistId = (req.query.artistId || '').toString().trim();
  if (!name && !artistId) {
    return res.status(400).json({ message: 'Нужно имя или artistId.' });
  }

  try {
    let resolvedArtistId = artistId;
    let artist = null;

    if (!resolvedArtistId) {
      const searchParams = new URLSearchParams({
        term: name,
        media: 'music',
        entity: 'musicArtist',
        limit: '10',
        country: 'US',
      });
      const { response, payload } = await fetchJson(`${ITUNES_SEARCH_URL}?${searchParams.toString()}`, {
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw new Error('artist search failed');
      const artists = Array.isArray(payload?.results) ? payload.results : [];
      const ranked = [...artists].sort((left, right) => exactArtistScore(right, name) - exactArtistScore(left, name));
      const match = ranked[0];
      if (!match) return res.json({ artist: null, tracks: [], albums: [] });
      resolvedArtistId = match.artistId?.toString() || '';
      artist = normalizeCatalogArtist(match);
    }

    const [songsResponse, albumsResponse, fallbackSongsResponse, fallbackAlbumsResponse] = await Promise.all([
      fetchJson(`${ITUNES_LOOKUP_URL}?${new URLSearchParams({ id: resolvedArtistId, entity: 'song', limit: '200', country: 'US' }).toString()}`, {
        signal: AbortSignal.timeout(12000),
      }),
      fetchJson(`${ITUNES_LOOKUP_URL}?${new URLSearchParams({ id: resolvedArtistId, entity: 'album', limit: '200', country: 'US' }).toString()}`, {
        signal: AbortSignal.timeout(12000),
      }),
      fetchJson(`${ITUNES_SEARCH_URL}?${new URLSearchParams({ term: name || artist?.name || '', media: 'music', entity: 'song', attribute: 'artistTerm', limit: '200', country: 'US' }).toString()}`, {
        signal: AbortSignal.timeout(12000),
      }),
      fetchJson(`${ITUNES_SEARCH_URL}?${new URLSearchParams({ term: name || artist?.name || '', media: 'music', entity: 'album', attribute: 'artistTerm', limit: '100', country: 'US' }).toString()}`, {
        signal: AbortSignal.timeout(12000),
      }),
    ]);
    if (!songsResponse.response.ok || !albumsResponse.response.ok) throw new Error('artist lookup failed');

    const songResults = Array.isArray(songsResponse.payload?.results) ? songsResponse.payload.results : [];
    const albumResults = Array.isArray(albumsResponse.payload?.results) ? albumsResponse.payload.results : [];
    const artistRecord = artist || normalizeCatalogArtist(songResults[0] || albumResults[0] || {});
    const effectiveArtistName = artistRecord?.name || name;
    const fallbackSongResults = Array.isArray(fallbackSongsResponse.payload?.results) ? fallbackSongsResponse.payload.results : [];
    const fallbackAlbumResults = Array.isArray(fallbackAlbumsResponse.payload?.results) ? fallbackAlbumsResponse.payload.results : [];
    const trackItems = [
      ...songResults.filter((item) => item.wrapperType === 'track' && item.kind === 'song'),
      ...fallbackSongResults.filter((item) => item.wrapperType === 'track' && item.kind === 'song' && normalizeText(item.artistName) === normalizeText(effectiveArtistName)),
    ];
    const albumItems = [
      ...albumResults.filter((item) => item.wrapperType === 'collection'),
      ...fallbackAlbumResults.filter((item) => item.wrapperType === 'collection' && normalizeText(item.artistName) === normalizeText(effectiveArtistName)),
    ];
    const tracks = await hydrateTrackRatings(
      [...new Map(trackItems.map((item) => [item.trackId?.toString(), normalizeCatalogTrack(item)])).values()],
      req.user?.id
    );
    const albums = [...new Map(albumItems.map((item) => [item.collectionId?.toString(), normalizeCatalogAlbum(item)])).values()];

    return res.json({
      artist: artistRecord,
      tracks,
      albums,
    });
  } catch {
    return res.status(502).json({ artist: null, tracks: [], albums: [], message: 'Не удалось загрузить страницу артиста.' });
  }
};

const findCatalogPreviewTrack = async ({ title, artist }) => {
  const params = new URLSearchParams({
    term: [artist, title].filter(Boolean).join(' '),
    media: 'music',
    entity: 'song',
    limit: '15',
    country: 'US',
  });
  const { response, payload } = await fetchJson(`${ITUNES_SEARCH_URL}?${params.toString()}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;

  const results = Array.isArray(payload?.results) ? payload.results : [];
  const ranked = results
    .filter((item) => item.wrapperType === 'track' && item.kind === 'song' && item.previewUrl)
    .map(normalizeCatalogTrack)
    .filter((track) => artistMatches(track.artist, artist))
    .sort((left, right) => resolveMatchScore(right, { title, artist }) - resolveMatchScore(left, { title, artist }));

  return ranked[0] || null;
};

const resolveCatalogTrack = async (req, res) => {
  const title = (req.query.title || '').toString().trim();
  const artist = (req.query.artist || '').toString().trim();
  const query = [artist, title].filter(Boolean).join(' ').trim();
  if (!query) {
    return res.status(400).json({ track: null, message: 'Нужно название трека.' });
  }

  try {
    const catalogPreview = await findCatalogPreviewTrack({ title, artist }).catch(() => null);
    if (catalogPreview) {
      return res.json({ track: catalogPreview });
    }

    const candidateQueries = [...new Set([
      query,
      [title, artist].filter(Boolean).join(' ').trim(),
      title,
      canonicalTrackText(title) !== normalizeText(title) ? [artist, stripDerivativeMarkers(title)].filter(Boolean).join(' ').trim() : '',
    ].filter(Boolean))];

    const { tracks: rawTracks } = await findPlayableTrackCandidates({ queries: candidateQueries, limitPerQuery: 18 });
    const tracks = await hydrateTrackRatings(rawTracks, req.user?.id);
    const ranked = tracks.filter((track) => artistMatches(track.artist, artist)).sort(
      (left, right) => resolveMatchScore(right, { title, artist }) - resolveMatchScore(left, { title, artist })
    );
    const bestMatch = ranked[0] || null;
    return res.json({ track: bestMatch });
  } catch {
    return res.status(502).json({ track: null, message: 'Не удалось подобрать поток для трека.' });
  }
};

const likedTrackToPayload = (item) => ({
  id: `liked-${item.key}`,
  trackKey: item.key,
  title: item.title,
  artist: item.artist,
  album: item.album || '',
  thumbnailUrl: item.imageUrl || '',
  fullArtworkUrl: item.imageUrl || '',
  audioUrl: item.audioUrl || '',
  provider: item.provider || 'catalog',
  providerLabel: item.providerLabel || 'Понравившееся',
  duration: item.duration || '',
  durationSeconds: item.durationSeconds || 0,
  source: item.provider === 'custom' ? 'custom' : 'catalog',
  previewOnly: item.provider === 'catalog',
  likesCount: item.likesCount,
  likedByMe: true,
});

const getLikedTracks = async (req, res) => {
  try {
    const likes = await prisma.musicTrackLike.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      include: { track: true },
      take: 100,
    });

    return res.json({ tracks: likes.map((like) => likedTrackToPayload(like.track)) });
  } catch {
    return res.status(500).json({ tracks: [], message: 'Не удалось загрузить понравившиеся треки.' });
  }
};

const toggleTrackLike = async (req, res) => {
  try {
    const payload = req.body?.track || req.body || {};
    const identity = trackIdentityFrom(payload);
    if (!identity.key || !identity.title) {
      return res.status(400).json({ message: 'Нужны title и artist трека.' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const track = await upsertMusicTrack(payload, tx);
      const existing = await tx.musicTrackLike.findUnique({
        where: { userId_trackId: { userId: req.user.id, trackId: track.id } },
      });

      if (existing) {
        await tx.musicTrackLike.delete({ where: { id: existing.id } });
        const updated = await tx.musicTrack.update({
          where: { id: track.id },
          data: { likesCount: { decrement: 1 } },
          select: { key: true, likesCount: true },
        });
        if (updated.likesCount < 0) {
          const corrected = await tx.musicTrack.update({
            where: { id: track.id },
            data: { likesCount: 0 },
            select: { key: true, likesCount: true },
          });
          return { liked: false, trackKey: corrected.key, likesCount: corrected.likesCount };
        }
        return { liked: false, trackKey: updated.key, likesCount: updated.likesCount };
      }

      await tx.musicTrackLike.create({ data: { userId: req.user.id, trackId: track.id } });
      const updated = await tx.musicTrack.update({
        where: { id: track.id },
        data: { likesCount: { increment: 1 } },
        select: { key: true, likesCount: true },
      });
      return { liked: true, trackKey: updated.key, likesCount: updated.likesCount };
    });

    return res.json(result);
  } catch {
    return res.status(500).json({ message: 'Не удалось обновить сердечко.' });
  }
};

const getTrackLyrics = async (req, res) => {
  const title = (req.query.title || '').toString().trim();
  const artist = (req.query.artist || '').toString().trim();
  const album = (req.query.album || '').toString().trim();
  const duration = Number(req.query.duration) || 0;

  if (!title || !artist) {
    return res.status(400).json({ message: 'Нужны title и artist.' });
  }

  try {
    const titleVariants = [...new Set([
      title,
      stripDerivativeMarkers(title),
      canonicalTrackText(title),
    ].map((item) => item?.trim()).filter(Boolean))];

    const artistVariants = [...new Set([
      artist,
      primaryArtistName(artist),
    ].map((item) => item?.trim()).filter(Boolean))];

    const searches = [];
    for (const titleVariant of titleVariants) {
      for (const artistVariant of artistVariants) {
        const params = new URLSearchParams({
          track_name: titleVariant,
          artist_name: artistVariant,
        });
        if (album && titleVariant === titleVariants[0]) params.set('album_name', album);
        if (duration > 0) params.set('duration', String(duration));
        searches.push(
          fetch(`https://lrclib.net/api/search?${params.toString()}`, {
            signal: AbortSignal.timeout(10000),
          }).then(async (response) => ({
            ok: response.ok,
            payload: await response.json().catch(() => []),
          })).catch(() => ({ ok: false, payload: [] }))
        );
      }
    }

    const settled = await Promise.all(searches);
    const items = settled.flatMap((result) => (result.ok && Array.isArray(result.payload) ? result.payload : []));
    if (!items.length) throw new Error('lyrics lookup failed');

    const match = bestLyricsCandidate(items, {
      title: stripDerivativeMarkers(title),
      artist: primaryArtistName(artist),
      duration,
    });
    if (!match?.plainLyrics && !match?.syncedLyrics) {
      return res.json({
        lyrics: null,
        syncedLyrics: null,
        source: 'lrclib',
        message: 'Текст пока не найден.',
      });
    }

    return res.json({
      lyrics: match.plainLyrics || null,
      syncedLyrics: match.syncedLyrics || null,
      source: 'lrclib',
      track: {
        title: match.trackName || title,
        artist: match.artistName || artist,
        album: match.albumName || album,
        duration: numberValue(match.duration) || duration,
      },
    });
  } catch (error) {
    return res.status(502).json({
      lyrics: null,
      syncedLyrics: null,
      source: 'lrclib',
      message: 'Не удалось получить текст песни.',
    });
  }
};

const audioLinkFrom = (payload) => firstValue(
  payload?.track?.audio?.link,
  payload?.audio?.link,
  payload?.data?.track?.audio?.link,
  payload?.data?.audio?.link,
  payload?.track?.audioUrl,
  payload?.audioUrl
);

const redirectToResolvedAudio = async ({ res, audioLink }) => {
  const response = await fetch(audioLink, {
    redirect: 'manual',
    signal: AbortSignal.timeout(8000),
  });
  const location = response.headers.get('location');
  if (!location || response.status < 300 || response.status >= 400) return false;

  res.setHeader('Cache-Control', 'private, max-age=300');
  res.redirect(302, location);
  return true;
};

const pipeWithWget = ({ res, audioLink }) => {
  const args = ['-q', '-O', '-'];
  args.push(audioLink);

  const child = spawn('wget', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let errorOutput = '';
  child.stderr.on('data', (chunk) => {
    errorOutput += chunk.toString();
  });
  child.on('error', () => {
    if (!res.headersSent) res.status(502).json({ message: 'Не удалось запустить аудиопрокси.' });
  });
  child.on('close', (code) => {
    if (code !== 0 && !res.headersSent) {
      res.status(502).json({ message: 'Не удалось получить аудиопоток muffon.' });
    }
  });

  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('Accept-Ranges', 'bytes');
  return child.stdout.pipe(res);
};

const streamMuffonTrack = async (req, res) => {
  const source = (req.params.source || '').toLowerCase();
  const trackId = req.params.trackId;
  if (!ALLOWED_SOURCES.has(source) || !trackId) {
    return res.status(400).json({ message: 'Некорректный muffon track id.' });
  }

  try {
    const params = muffonParams({ with_audio: 'true' });
    const { response: infoResponse, payload } = await fetchMuffonJson(muffonUrl(`${source}/tracks/${encodeURIComponent(trackId)}`, params), {
      signal: AbortSignal.timeout(14000),
    }, 3);
    const audioLink = audioLinkFrom(payload);
    if (!infoResponse.ok || payload.error || !audioLink) {
      if (hasProductionTokenIssue(payload, infoResponse.status)) {
        return res.status(502).json({ message: 'Muffon API требует токен для получения аудио.' });
      }
      throw new Error(`muffon ${source} audio lookup failed`);
    }

    if (source === 'yandexmusic') {
      const redirected = await redirectToResolvedAudio({ res, audioLink }).catch(() => false);
      if (redirected) return undefined;
      return pipeWithWget({ res, audioLink });
    }

    const headers = {};
    if (req.headers.range) headers.Range = req.headers.range;
    const streamResponse = await fetch(audioLink, {
      headers,
      signal: AbortSignal.timeout(16000),
    });
    if (!streamResponse.ok || !streamResponse.body) throw new Error(`audio stream responded ${streamResponse.status}`);

    res.status(streamResponse.status);
    res.setHeader('Content-Type', streamResponse.headers.get('content-type') || 'audio/mpeg');
    res.setHeader('Cache-Control', 'private, max-age=300');
    ['accept-ranges', 'content-length', 'content-range'].forEach((header) => {
      const value = streamResponse.headers.get(header);
      if (value) res.setHeader(header, value);
    });
    const nodeStream = Readable.fromWeb(streamResponse.body);
    nodeStream.on('error', () => {
      if (!res.headersSent) {
        res.status(502).json({ message: 'Не удалось получить аудиопоток muffon.' });
        return;
      }
      res.destroy();
    });
    req.on('close', () => nodeStream.destroy());
    return nodeStream.pipe(res);
  } catch (error) {
    return res.status(502).json({ message: 'Не удалось получить аудиопоток muffon.' });
  }
};

const recognizeTrack = async (req, res) => {
  const sampleFile = req.file;
  const audioUrl = (req.body?.audioUrl || '').toString().trim();
  const fallbackFromFileName = (filename = '') => {
    const base = filename.replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ').trim();
    const match = base.match(/^(.+?)\s*-\s*(.+)$/);
    if (!match) return null;
    return {
      artist: match[1].trim(),
      title: match[2].trim(),
    };
  };

  if (!AUDD_API_TOKEN) {
    const inferred = fallbackFromFileName(sampleFile?.originalname || '');
    if (inferred) {
      return res.json({
        provider: 'filename',
        match: {
          title: inferred.title,
          artist: inferred.artist,
          album: '',
          releaseDate: '',
          sourceLink: '',
          artworkUrl: '',
          lyrics: '',
        },
        message: 'Определил трек по имени файла.',
      });
    }
    return res.status(503).json({
      provider: 'audd',
      message: 'Распознавание музыки пока недоступно в этой сборке.',
    });
  }
  if (!sampleFile && !audioUrl) {
    return res.status(400).json({
      provider: 'audd',
      message: 'Нужен аудиофрагмент или ссылка на него.',
    });
  }

  try {
    const form = new FormData();
    form.set('api_token', AUDD_API_TOKEN);
    form.set('return', 'lyrics,apple_music,spotify');

    if (audioUrl) {
      form.set('url', audioUrl);
    } else {
      const blob = new Blob([sampleFile.buffer], { type: sampleFile.mimetype || 'audio/mpeg' });
      form.set('file', blob, sampleFile.originalname || 'sample.webm');
    }

    const response = await fetch(AUDD_API_URL, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(20000),
    });
    const payload = await response.json().catch(() => ({}));
    const result = payload?.result;

    if (!response.ok || payload?.status === 'error') {
      const message = payload?.error?.error_message || 'Не удалось распознать трек.';
      const friendlyMessage = normalizeText(message).includes('sanctions')
        ? 'Провайдер распознавания недоступен в текущем регионе. Нужен другой сервис или внешний ключ.'
        : message;
      return res.status(502).json({
        provider: 'audd',
        message: friendlyMessage,
      });
    }

    if (!result) {
      return res.json({
        provider: 'audd',
        match: null,
        message: 'Совпадение не найдено.',
      });
    }

    return res.json({
      provider: 'audd',
      match: {
        title: result.title || '',
        artist: result.artist || '',
        album: result.album || '',
        releaseDate: result.release_date || '',
        sourceLink: result.song_link || result.spotify?.external_urls?.spotify || result.apple_music?.url || '',
        artworkUrl: result.spotify?.album?.images?.[0]?.url || result.apple_music?.artwork?.url || '',
        lyrics: result.lyrics?.lyrics || '',
      },
    });
  } catch (error) {
    return res.status(502).json({
      provider: 'audd',
      message: 'Не удалось распознать трек.',
    });
  }
};

module.exports = {
  searchMusic,
  searchCatalog,
  getArtistCatalog,
  resolveCatalogTrack,
  streamMuffonTrack,
  getTrackLyrics,
  getLikedTracks,
  toggleTrackLike,
  recognizeTrack,
};
