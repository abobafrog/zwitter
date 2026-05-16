import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import NavIcon from '../layout/NavIcon';
import useMusicStore from '../../store/musicStore';
import useAuthStore from '../../store/authStore';
import { buildPlaylistShareUrl, decodeSharedPlaylist } from '../../utils/musicShare';

const featuredArtists = [
  { name: 'Lady Gaga', accent: 'from-fuchsia-400/35 via-amber-200/20 to-cyan-300/25', songs: ['Abracadabra', 'Poker Face', 'Bad Romance'] },
  { name: 'Кино', accent: 'from-cyan-300/24 via-blue-400/20 to-fuchsia-400/22', songs: ['Группа крови', 'Кукушка', 'Спокойная ночь'] },
  { name: 'Баста', accent: 'from-emerald-300/20 via-cyan-300/14 to-blue-400/25', songs: ['Сансара', 'На заре', 'Моя игра'] },
  { name: 'The Weeknd', accent: 'from-rose-300/24 via-violet-300/20 to-cyan-300/18', songs: ['Blinding Lights', 'Starboy', 'Save Your Tears'] },
];

const radioSeeds = [
  'Lady Gaga',
  'Кино',
  'Баста',
  'The Weeknd',
  'Billie Eilish',
  'русский рок',
  'indie pop',
  'dance pop',
  'synthwave',
  'hip hop',
  'electronic',
];

const themePresets = {
  synthwave: {
    title: 'Моя вселенная',
    subtitle: 'Живая музыкальная орбита Zwitter: любимые артисты, история, плейлисты и мгновенный запуск прямо из космического фона.',
    capsule: 'Для тебя',
    gradient: 'radial-gradient(circle at 50% 26%, rgba(250,204,21,0.82) 0%, rgba(250,204,21,0.38) 16%, rgba(236,72,153,0.32) 34%, rgba(4,7,20,0) 58%), radial-gradient(circle at 20% 70%, rgba(34,211,238,0.18) 0%, rgba(4,7,20,0) 32%), radial-gradient(circle at 84% 30%, rgba(168,85,247,0.24) 0%, rgba(4,7,20,0) 28%), linear-gradient(180deg, rgba(4,7,20,0.94), rgba(5,10,28,0.98))',
  },
  rock: {
    title: 'Моя вселенная',
    subtitle: 'Холодный неон, плотный воздух и тёмная сцена для треков, которые хочется крутить снова.',
    capsule: 'На повторе',
    gradient: 'radial-gradient(circle at 48% 24%, rgba(56,189,248,0.42) 0%, rgba(96,165,250,0.18) 20%, rgba(4,7,20,0) 52%), radial-gradient(circle at 18% 74%, rgba(79,70,229,0.2) 0%, rgba(4,7,20,0) 28%), radial-gradient(circle at 84% 22%, rgba(244,63,94,0.18) 0%, rgba(4,7,20,0) 24%), linear-gradient(180deg, rgba(2,6,23,0.98), rgba(6,11,28,0.98))',
  },
  rap: {
    title: 'Моя вселенная',
    subtitle: 'Басы, ритм и тяжёлое свечение — всё, что играет у тебя, собирается здесь в одну систему.',
    capsule: 'Громче',
    gradient: 'radial-gradient(circle at 50% 24%, rgba(168,85,247,0.46) 0%, rgba(236,72,153,0.22) 18%, rgba(4,7,20,0) 52%), radial-gradient(circle at 24% 74%, rgba(250,204,21,0.18) 0%, rgba(4,7,20,0) 26%), radial-gradient(circle at 82% 58%, rgba(16,185,129,0.14) 0%, rgba(4,7,20,0) 22%), linear-gradient(180deg, rgba(4,7,20,0.98), rgba(10,5,18,0.98))',
  },
  ambient: {
    title: 'Моя вселенная',
    subtitle: 'Спокойный космос для длинных сессий: история, плейлисты и артистические карточки всегда под рукой.',
    capsule: 'Спокойный режим',
    gradient: 'radial-gradient(circle at 48% 24%, rgba(45,212,191,0.34) 0%, rgba(59,130,246,0.18) 20%, rgba(4,7,20,0) 52%), radial-gradient(circle at 80% 42%, rgba(244,114,182,0.12) 0%, rgba(4,7,20,0) 22%), radial-gradient(circle at 18% 74%, rgba(253,224,71,0.12) 0%, rgba(4,7,20,0) 22%), linear-gradient(180deg, rgba(4,7,20,0.98), rgba(7,10,20,0.98))',
  },
};

const themeRules = [
  { pattern: /lady gaga|weeknd|billie|pop|dance|synth/i, preset: 'synthwave' },
  { pattern: /кино|rock|alternative|band/i, preset: 'rock' },
  { pattern: /basta|macan|rap|hip hop|trap/i, preset: 'rap' },
];

const normalizeText = (value = '') => value.toString().toLowerCase().trim();
const primaryArtistName = (value = '') => value.toString().split(/,|&| feat\. | feat | x | with /i)[0].trim();
const trackKeyOf = (track = {}) => {
  const title = normalizeText(track.title).replace(/[^a-z0-9а-яё]+/gi, ' ').replace(/\s+/g, ' ').trim();
  const artist = normalizeText(primaryArtistName(track.artist || track.channelTitle)).replace(/[^a-z0-9а-яё]+/gi, ' ').replace(/\s+/g, ' ').trim();
  return track.trackKey || (title ? `${artist || 'unknown'}::${title}` : '');
};
const slugifyArtist = (value = '') => normalizeText(value).replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-+|-+$/g, '') || 'artist';
const shortenText = (value = '', maxLength = 38) => {
  const text = value?.toString?.().trim?.() || '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
};

function pickTheme({ currentTrack, query }) {
  const source = normalizeText(`${query} ${currentTrack?.artist || ''} ${currentTrack?.title || ''}`);
  const presetKey = themeRules.find((rule) => rule.pattern.test(source))?.preset || 'ambient';
  return themePresets[presetKey];
}

function artworkOf(track) {
  return track?.fullArtworkUrl || track?.thumbnailUrl || track?.image || '';
}

function TrackArtwork({ track, image, className = 'h-16 w-16 rounded-2xl' }) {
  const src = image || artworkOf(track);
  const [failed, setFailed] = useState(false);

  if (src && !failed) {
    return <img src={src} alt="" onError={() => setFailed(true)} className={`${className} flex-shrink-0 object-cover`} />;
  }

  return (
    <div className={`${className} flex flex-shrink-0 items-center justify-center border border-cyan-300/20 bg-cyan-300/10 text-x-accent`}>
      <NavIcon name="music" className="h-6 w-6" />
    </div>
  );
}

function makeCatalogTrack(item) {
  return {
    id: `catalog-${item.id || `${item.artist}-${item.title}`}`,
    title: item.title,
    artist: item.artist,
    album: item.album,
    duration: item.duration,
    durationSeconds: item.durationMs ? Math.round(item.durationMs / 1000) : 0,
    thumbnailUrl: item.image || '',
    fullArtworkUrl: item.image || '',
    providerLabel: 'Каталог',
    trackKey: trackKeyOf(item),
    source: 'catalog',
    explicit: Boolean(item.explicit),
  };
}

const makeLikePayload = (track) => ({
  trackKey: trackKeyOf(track),
  title: track?.title || '',
  artist: track?.artist || track?.channelTitle || '',
  album: track?.album || '',
  thumbnailUrl: artworkOf(track),
  fullArtworkUrl: artworkOf(track),
  image: artworkOf(track),
  audioUrl: track?.audioUrl || track?.previewUrl || '',
  provider: track?.provider || track?.source || 'catalog',
  providerLabel: track?.providerLabel || 'Музыка',
  duration: track?.duration || '',
  durationSeconds: track?.durationSeconds || 0,
});

function ExplicitBadge() {
  return (
    <span className="rounded-full border border-rose-300/30 bg-rose-300/12 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-rose-100">
      explicit
    </span>
  );
}

function artistSummaryFromTracks(tracks) {
  const map = new Map();
  tracks.forEach((track) => {
    const name = track.artist || track.channelTitle;
    if (!name) return;
    if (!map.has(name)) {
      map.set(name, {
        id: slugifyArtist(name),
        name,
        image: artworkOf(track),
        trackCount: 0,
      });
    }
    const artist = map.get(name);
    artist.trackCount += 1;
    if (!artist.image && artworkOf(track)) artist.image = artworkOf(track);
  });
  return [...map.values()].sort((left, right) => right.trackCount - left.trackCount);
}

function albumSummaryFromTracks(tracks) {
  const map = new Map();
  tracks.forEach((track) => {
    if (!track.album) return;
    const key = `${track.artist || 'unknown'}::${track.album}`;
    if (!map.has(key)) {
      map.set(key, {
        id: key,
        title: track.album,
        artist: track.artist || 'Без артиста',
        image: artworkOf(track),
        trackCount: 0,
        sampleTrack: track,
        explicit: Boolean(track.explicit),
      });
    }
    const album = map.get(key);
    album.trackCount += 1;
    if (!album.image && artworkOf(track)) album.image = artworkOf(track);
    if (track.explicit) album.explicit = true;
  });
  return [...map.values()].sort((left, right) => right.trackCount - left.trackCount);
}

function HeroChip({ title, subtitle, image, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-[26px] border border-white/10 bg-black/18 px-4 py-4 text-left shadow-[0_12px_32px_rgba(0,0,0,0.18)] backdrop-blur-sm transition hover:border-cyan-300/25"
    >
      <TrackArtwork image={image} className="h-14 w-14 rounded-2xl" />
      <span className="min-w-0">
        <span className="block truncate text-xl font-black text-white">{title}</span>
        <span className="block truncate text-sm text-white/65">{subtitle}</span>
      </span>
    </button>
  );
}

export default function MusicHub() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const sharedQuery = searchParams.get('musicQuery') || '';
  const [query, setQuery] = useState(sharedQuery);
  const [selectedTrackId, setSelectedTrackId] = useState(searchParams.get('musicTrack') || '');
  const [playlistName, setPlaylistName] = useState('');
  const [selectedPlaylistId, setSelectedPlaylistId] = useState('');
  const [editingPlaylistId, setEditingPlaylistId] = useState('');
  const [editingPlaylistName, setEditingPlaylistName] = useState('');
  const [searchView, setSearchView] = useState('top');
  const [recognizeFile, setRecognizeFile] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [radioLoading, setRadioLoading] = useState(false);
  const [customDraft, setCustomDraft] = useState({
    title: '',
    artist: '',
    album: '',
    audioUrl: '',
    thumbnailUrl: '',
    lyrics: '',
  });
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const importedPlaylistRef = useRef('');
  const { user } = useAuthStore();
  const isAuthenticated = Boolean(user);

  const {
    addLibraryTrack,
    addToPlaylist,
    createPlaylist,
    currentTrack,
    deletePlaylist,
    history,
    hideExplicit,
    importSharedPlaylist,
    libraryTracks,
    playPlaylist,
    playlists,
    playTrack,
    removeFromPlaylist,
    renamePlaylist,
    removeLibraryTrack,
    setRadioSeed,
    showPanel,
  } = useMusicStore();

  const searchText = query.trim();
  const theme = pickTheme({ currentTrack, query: searchText });

  const tracksQuery = useQuery({
    queryKey: ['music-search', searchText],
    queryFn: () => api.get('/music/search', { params: { q: searchText, limit: 50 } }).then((response) => response.data),
    enabled: Boolean(searchText),
    staleTime: 1000 * 60 * 5,
  });

  const likedQuery = useQuery({
    queryKey: ['music-likes'],
    queryFn: () => api.get('/music/likes').then((response) => response.data),
    enabled: isAuthenticated,
    staleTime: 1000 * 60,
  });

  const catalogQuery = useQuery({
    queryKey: ['music-catalog-search', searchText],
    queryFn: () => api.get('/music/catalog/search', { params: { q: searchText } }).then((response) => response.data),
    enabled: Boolean(searchText),
    staleTime: 1000 * 60 * 10,
  });

  const recognizeMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      if (recognizeFile) formData.append('sample', recognizeFile);
      return api.post('/music/recognize', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then((response) => response.data);
    },
    onSuccess: (data) => {
      if (!data?.match) {
        toast('Совпадение не найдено');
        return;
      }

      setCustomDraft((current) => ({
        ...current,
        title: data.match.title || current.title,
        artist: data.match.artist || current.artist,
        album: data.match.album || current.album,
        thumbnailUrl: data.match.artworkUrl || current.thumbnailUrl,
        lyrics: data.match.lyrics || current.lyrics,
      }));

      const nextQuery = [data.match.artist, data.match.title].filter(Boolean).join(' ').trim();
      if (nextQuery) submitSearch(nextQuery);
      toast.success('Похоже, трек удалось распознать');
    },
    onError: (error) => {
      const status = error.response?.status;
      if (status === 503) {
        toast.error('Распознавание музыки пока недоступно.');
        return;
      }
      toast.error(error.response?.data?.message || 'Не удалось распознать трек');
    },
  });

  const resolveTrackMutation = useMutation({
    mutationFn: ({ title, artist }) => api.get('/music/catalog/resolve', { params: { title, artist } }).then((response) => response.data),
    onSuccess: (data) => {
      if (data?.track) {
        playTrack(data.track);
        return;
      }
      toast.error('Не удалось подобрать поток для этого трека');
    },
    onError: () => {
      toast.error('Не удалось подобрать поток для этого трека');
    },
  });

  const toggleLikeMutation = useMutation({
    mutationFn: (track) => api.post('/music/tracks/like', { track: makeLikePayload(track) }).then((response) => response.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['music-likes'] });
      queryClient.invalidateQueries({ queryKey: ['music-search'] });
      queryClient.invalidateQueries({ queryKey: ['music-catalog-search'] });
      queryClient.invalidateQueries({ queryKey: ['music-artist-catalog'] });
    },
    onError: () => {
      toast.error('Не удалось обновить сердечко');
    },
  });

  const remoteTracks = tracksQuery.data?.tracks || [];
  const likedTracks = likedQuery.data?.tracks || [];
  const likedMap = useMemo(() => new Map(likedTracks.map((track) => [trackKeyOf(track), track])), [likedTracks]);
  const isLikedTrack = (track) => Boolean(likedMap.get(trackKeyOf(track)) || track?.likedByMe);
  const likeCountForTrack = (track) => Math.max(Number(track?.likesCount) || 0, Number(likedMap.get(trackKeyOf(track))?.likesCount) || 0);
  const toggleTrackLike = (track) => {
    if (!track) return;
    if (!isAuthenticated) {
      requireRegistration();
      return;
    }
    toggleLikeMutation.mutate(track);
  };
  const catalogArtists = catalogQuery.data?.artists || [];
  const catalogTracks = (catalogQuery.data?.tracks || []).map(makeCatalogTrack);
  const catalogAlbums = catalogQuery.data?.albums || [];
  const isTrackAllowed = (track) => !hideExplicit || !track?.explicit;

  const localTracks = useMemo(() => {
    if (!searchText) return libraryTracks;
    const normalizedQuery = normalizeText(searchText);
    return libraryTracks.filter((track) => normalizeText(`${track.title} ${track.artist || ''} ${track.album || ''}`).includes(normalizedQuery));
  }, [libraryTracks, searchText]);

  const playableTracks = useMemo(() => {
    const seen = new Set();
    return [...localTracks, ...remoteTracks].map((track) => ({
      ...track,
      likedByMe: Boolean(track?.likedByMe || likedMap.has(trackKeyOf(track))),
      likesCount: Math.max(Number(track?.likesCount) || 0, Number(likedMap.get(trackKeyOf(track))?.likesCount) || 0),
    })).filter((track) => {
      if (seen.has(track.id)) return false;
      seen.add(track.id);
      return isTrackAllowed(track);
    }).sort((left, right) => (Number(right.likesCount) || 0) - (Number(left.likesCount) || 0));
  }, [hideExplicit, likedMap, localTracks, remoteTracks]);

  const filteredCatalogTracks = useMemo(
    () => catalogTracks.map((track) => ({
      ...track,
      likedByMe: Boolean(track?.likedByMe || likedMap.has(trackKeyOf(track))),
      likesCount: Math.max(Number(track?.likesCount) || 0, Number(likedMap.get(trackKeyOf(track))?.likesCount) || 0),
    })).filter(isTrackAllowed).sort((left, right) => (Number(right.likesCount) || 0) - (Number(left.likesCount) || 0)),
    [catalogTracks, hideExplicit, likedMap]
  );

  const artistCards = useMemo(() => {
    if (catalogArtists.length) {
      return catalogArtists.map((artist) => ({
        id: artist.id || slugifyArtist(artist.name),
        name: artist.name,
        image: artist.image,
        trackCount: playableTracks.filter((track) => normalizeText(track.artist).includes(normalizeText(artist.name))).length,
      }));
    }
    return artistSummaryFromTracks(playableTracks);
  }, [catalogArtists, playableTracks]);

  const albumCards = useMemo(() => {
    if (catalogAlbums.length) {
      return catalogAlbums.map((album) => ({
        ...album,
        image: album.image,
        trackCount: album.trackCount || 0,
      }));
    }
    return albumSummaryFromTracks(playableTracks);
  }, [catalogAlbums, playableTracks]);

  const filteredAlbumCards = useMemo(
    () => albumCards.filter((album) => !hideExplicit || !album?.explicit),
    [albumCards, hideExplicit]
  );

  const selectedTrack = useMemo(() => {
    const allTracks = [...playableTracks, ...filteredCatalogTracks];
    return allTracks.find((track) => track.id === selectedTrackId) || currentTrack || playableTracks[0] || filteredCatalogTracks[0] || null;
  }, [filteredCatalogTracks, currentTrack, playableTracks, selectedTrackId]);

  const topArtist = artistCards[0] || null;
  const activePlaylist = playlists.find((playlist) => playlist.id === selectedPlaylistId) || null;
  const requireRegistration = () => {
    toast('Для этого нужна регистрация');
    navigate('/register');
  };

  useEffect(() => {
    setQuery(sharedQuery);
  }, [sharedQuery]);

  useEffect(() => {
    const candidates = searchText ? [...playableTracks, ...filteredCatalogTracks] : [...playableTracks, ...filteredCatalogTracks];
    if (!candidates.length) return;
    if (!selectedTrackId || !candidates.some((track) => track.id === selectedTrackId)) {
      setSelectedTrackId(candidates[0].id);
    }
  }, [filteredCatalogTracks, playableTracks, searchText, selectedTrackId]);

  useEffect(() => {
    if (currentTrack?.id && currentTrack.id !== selectedTrackId) {
      setSelectedTrackId(currentTrack.id);
    }
  }, [currentTrack?.id, selectedTrackId]);

  useEffect(() => {
    if (!selectedPlaylistId && playlists[0]?.id) setSelectedPlaylistId(playlists[0].id);
  }, [playlists, selectedPlaylistId]);

  useEffect(() => {
    const sharedPlaylistToken = searchParams.get('musicPlaylist') || '';
    if (!sharedPlaylistToken || importedPlaylistRef.current === sharedPlaylistToken) return;
    importedPlaylistRef.current = sharedPlaylistToken;
    if (!isAuthenticated) {
      toast('Зарегистрируйтесь, чтобы сохранять плейлисты');
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('musicPlaylist');
      setSearchParams(nextParams, { replace: true });
      return;
    }
    const sharedPlaylist = decodeSharedPlaylist(sharedPlaylistToken);
    if (!sharedPlaylist) {
      toast.error('Не удалось открыть плейлист из ссылки');
      return;
    }
    const newPlaylistId = importSharedPlaylist(sharedPlaylist);
    if (newPlaylistId) {
      setSelectedPlaylistId(newPlaylistId);
      toast.success('Плейлист добавлен в библиотеку');
    }
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('musicPlaylist');
    setSearchParams(nextParams, { replace: true });
  }, [importSharedPlaylist, isAuthenticated, searchParams, setSearchParams]);

  const submitSearch = (value) => {
    const nextQuery = value.trim();
    setQuery(value);
    setSelectedTrackId('');
    setSearchView('top');
    const next = new URLSearchParams(searchParams);
    if (nextQuery) next.set('musicQuery', nextQuery);
    else next.delete('musicQuery');
    next.delete('musicTrack');
    setSearchParams(next, { replace: true });
  };

  const startRadio = async () => {
    setRadioLoading(true);
    try {
      const seed = radioSeeds[Math.floor(Math.random() * radioSeeds.length)];
      const data = await api.get('/music/search', { params: { q: seed, limit: 30 } }).then((response) => response.data);
      const variants = (data?.tracks || []).filter((track) => isTrackAllowed(track) && track.audioUrl);
      const pick = variants[Math.floor(Math.random() * variants.length)];
      if (!pick) {
        toast.error('Радио пока не нашло подходящий трек');
        return;
      }
      setRadioSeed(seed);
      setSelectedTrackId(pick.id);
      playTrack({ ...pick, radioSeed: seed });
      toast.success(`Радио: ${pick.artist || seed} - ${pick.title}`);
    } catch {
      toast.error('Не удалось запустить радио');
    } finally {
      setRadioLoading(false);
    }
  };

  const openArtist = (artistName) => {
    navigate(`/music/artist/${slugifyArtist(artistName)}?name=${encodeURIComponent(artistName)}`);
  };

  const playOrResolve = (track) => {
    if (!track) return;
    setSelectedTrackId(track.id);
    if (track.audioUrl) {
      if (!track.radioSeed) setRadioSeed('');
      playTrack(track);
      return;
    }
    playTrack(track);
    resolveTrackMutation.mutate({ title: track.title, artist: track.artist });
  };

  const stopListening = () => {
    mediaRecorderRef.current?.stop?.();
    mediaStreamRef.current?.getTracks?.().forEach((track) => track.stop());
    mediaRecorderRef.current = null;
    mediaStreamRef.current = null;
    setIsListening(false);
  };

  const startLiveRecognition = async () => {
    if (!isAuthenticated) {
      requireRegistration();
      return;
    }
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        toast.error('Браузер не дал доступ к микрофону');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = async () => {
        setIsListening(false);
        mediaStreamRef.current?.getTracks?.().forEach((track) => track.stop());
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('sample', blob, 'live-sample.webm');
        try {
          const data = await api.post('/music/recognize', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          }).then((response) => response.data);

          if (!data?.match) {
            toast('Совпадение не найдено');
            return;
          }

          const nextQuery = [data.match.artist, data.match.title].filter(Boolean).join(' ').trim();
          if (nextQuery) submitSearch(nextQuery);
          toast.success(`Нашёл: ${data.match.artist} - ${data.match.title}`);
        } catch (error) {
          if (error.response?.status === 503) {
            toast.error('Распознавание музыки пока недоступно.');
            return;
          }
          toast.error(error.response?.data?.message || 'Не удалось распознать трек');
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsListening(true);
      window.setTimeout(() => {
        if (recorder.state !== 'inactive') recorder.stop();
      }, 8000);
    } catch {
      toast.error('Не удалось включить распознавание с микрофона');
    }
  };

  const addCustomTrack = () => {
    if (!isAuthenticated) {
      requireRegistration();
      return;
    }
    if (!customDraft.title.trim()) {
      toast.error('Укажи хотя бы название трека');
      return;
    }

    const trackId = addLibraryTrack({
      id: `custom-${Date.now()}`,
      title: customDraft.title.trim(),
      artist: customDraft.artist.trim(),
      album: customDraft.album.trim(),
      audioUrl: customDraft.audioUrl.trim(),
      thumbnailUrl: customDraft.thumbnailUrl.trim(),
      fullArtworkUrl: customDraft.thumbnailUrl.trim(),
      lyrics: customDraft.lyrics.trim(),
    });

    if (!trackId) {
      toast.error('Не удалось сохранить трек');
      return;
    }

    setCustomDraft({
      title: '',
      artist: '',
      album: '',
      audioUrl: '',
      thumbnailUrl: '',
      lyrics: '',
    });
    setSelectedTrackId(trackId);
    toast.success('Трек добавлен в личную базу');
  };

  const sharePlaylist = async (playlist) => {
    if (!isAuthenticated) {
      requireRegistration();
      return;
    }
    try {
      const url = buildPlaylistShareUrl(playlist);
      if (navigator.share) {
        await navigator.share({ title: playlist.name, text: `Плейлист ${playlist.name}`, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success('Ссылка на плейлист скопирована');
      }
    } catch {
      toast.error('Не удалось поделиться плейлистом');
    }
  };

  const submitPlaylistRename = (playlistId) => {
    if (!isAuthenticated) {
      requireRegistration();
      return;
    }
    renamePlaylist(playlistId, editingPlaylistName);
    setEditingPlaylistId('');
    setEditingPlaylistName('');
    toast.success('Название плейлиста обновлено');
  };

  const trackListForView = searchView === 'liked'
    ? likedTracks.filter(isTrackAllowed)
    : playableTracks;

  return (
    <section className="space-y-5">
      <div
        className="relative overflow-hidden rounded-[36px] border border-white/10 p-6 shadow-[0_28px_80px_rgba(0,0,0,0.34)]"
        style={{ backgroundImage: theme.gradient }}
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <span className="music-universe-orb music-universe-orb-a" />
          <span className="music-universe-orb music-universe-orb-b" />
          <span className="music-universe-orb music-universe-orb-c" />
        </div>

        <div className="relative z-[1] grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_360px]">
          <div className="flex min-h-[420px] flex-col justify-between">
            <div className="max-w-2xl">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-white/70">{theme.capsule}</p>
              <h2 className="mt-3 text-5xl font-black leading-none text-white md:text-6xl">{theme.title}</h2>
              <p className="mt-4 max-w-xl text-base leading-7 text-white/72">{theme.subtitle}</p>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => playOrResolve(selectedTrack)}
                  disabled={!selectedTrack || resolveTrackMutation.isPending}
                  className="rounded-full bg-yellow-300 px-6 py-3 text-base font-black text-slate-950 shadow-[0_0_24px_rgba(250,204,21,0.35)] disabled:opacity-50"
                >
                  {resolveTrackMutation.isPending ? 'Подключаю...' : 'Слушать'}
                </button>
                <button
                  type="button"
                  onClick={showPanel}
                  disabled={!currentTrack}
                  className="rounded-full border border-white/15 bg-white/8 px-6 py-3 text-base font-black text-white backdrop-blur-sm disabled:opacity-50"
                >
                  Открыть плеер
                </button>
                <button
                  type="button"
                  onClick={startRadio}
                  disabled={radioLoading}
                  className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-6 py-3 text-base font-black text-cyan-100 disabled:opacity-50"
                >
                  {radioLoading ? 'Ловлю волну...' : 'Радио'}
                </button>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              <HeroChip
                title="Сейчас играет"
                subtitle={currentTrack ? `${currentTrack.artist || 'Без артиста'} · ${currentTrack.title}` : 'Выбери трек и запусти его'}
                image={artworkOf(currentTrack)}
                onClick={() => currentTrack?.audioUrl && showPanel()}
              />
              <HeroChip
                title="Тренды"
                subtitle={featuredArtists[0].name}
                image={artworkOf(selectedTrack)}
                onClick={() => submitSearch(featuredArtists[0].name)}
              />
              <HeroChip
                title="История"
                subtitle={history[0] ? `${history[0].artist || 'Трек'} · ${history[0].title}` : 'Пока пусто, но это быстро исправимо'}
                image={artworkOf(history[0])}
                onClick={() => history[0] && playTrack(history[0])}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[28px] border border-white/10 bg-black/18 p-4 backdrop-blur-md">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/48">Текущий трек</p>
              <div className="mt-3 flex gap-3">
                <TrackArtwork track={currentTrack || selectedTrack} className="h-20 w-20 rounded-[22px]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-2xl font-black text-white">{currentTrack?.title || selectedTrack?.title || 'Ничего не выбрано'}</p>
                  <p className="mt-1 truncate text-sm text-white/58">{currentTrack?.artist || selectedTrack?.artist || 'Выбери артиста или песню'}</p>
                  <p className="mt-1 text-[11px] font-black uppercase tracking-[0.18em] text-cyan-200/70">
                    {currentTrack?.providerLabel || selectedTrack?.providerLabel || 'Музыка'}
                  </p>
                  {selectedTrack && (
                    <button
                      type="button"
                      onClick={() => toggleTrackLike(selectedTrack)}
                      disabled={toggleLikeMutation.isPending}
                      className={`mt-2 inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-black transition ${
                        isLikedTrack(selectedTrack)
                          ? 'border-rose-300/45 bg-rose-300/16 text-rose-100'
                          : 'border-white/12 bg-white/6 text-white/65 hover:text-white'
                      } disabled:opacity-50`}
                    >
                      <NavIcon name="heart" className="h-3.5 w-3.5" />
                      {likeCountForTrack(selectedTrack)}
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => playOrResolve(selectedTrack)}
                  disabled={!selectedTrack || resolveTrackMutation.isPending}
                  className="rounded-full bg-cyan-300 px-4 py-3 text-sm font-black text-slate-950 disabled:opacity-50"
                >
                  Слушать
                </button>
                <button
                  type="button"
                  onClick={showPanel}
                  disabled={!currentTrack}
                  className="rounded-full border border-white/12 bg-white/8 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
                >
                  Плеер
                </button>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-black/18 p-4 backdrop-blur-md">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/48">Shazam-поиск</p>
              <p className="mt-1 text-sm text-white/60">Можно загрузить фрагмент или дать приложению послушать музыку около 8 секунд.</p>
              <label className="mt-4 block rounded-[24px] border border-dashed border-white/14 bg-black/16 px-4 py-5 text-sm text-white/65">
                <span className="mb-2 block font-bold text-white">Файл фрагмента</span>
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(event) => setRecognizeFile(event.target.files?.[0] || null)}
                  className="block w-full text-xs text-white/65 file:mr-3 file:rounded-full file:border-0 file:bg-cyan-300/12 file:px-3 file:py-2 file:font-black file:text-cyan-200"
                />
              </label>
              <div className="mt-4 grid gap-2">
                <button
                  type="button"
                  disabled={isAuthenticated && (!recognizeFile || recognizeMutation.isPending)}
                  onClick={() => (isAuthenticated ? recognizeMutation.mutate() : requireRegistration())}
                  className="rounded-full border border-white/12 bg-white/[0.06] px-4 py-3 text-sm font-black text-white disabled:opacity-50"
                >
                  {recognizeMutation.isPending ? 'Ищу...' : 'Распознать файл'}
                </button>
                <button
                  type="button"
                  onClick={() => (isListening ? stopListening() : startLiveRecognition())}
                  className="rounded-full border border-cyan-300/20 bg-cyan-300/8 px-4 py-3 text-sm font-black text-cyan-100"
                >
                  {isListening ? 'Остановить прослушивание' : 'Слушать песню'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[32px] border border-white/10 bg-slate-950/72 p-5 shadow-panel">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-200/70">Понравившиеся треки</p>
            <h3 className="mt-1 text-2xl font-black text-white">Твоя коллекция с сердечками</h3>
          </div>
          <button
            type="button"
            onClick={() => setSearchView('liked')}
            className="rounded-full border border-cyan-300/22 bg-cyan-300/8 px-4 py-2 text-sm font-black text-cyan-100"
          >
            Открыть список
          </button>
        </div>
        {!isAuthenticated ? (
          <div className="rounded-[24px] border border-cyan-300/18 bg-black/16 p-4 text-sm text-white/62">
            Войди в аккаунт, чтобы сохранять сердечки и участвовать в общем рейтинге песен.
          </div>
        ) : likedTracks.length ? (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {likedTracks.slice(0, 8).map((track) => (
              <button
                key={track.trackKey || track.id}
                type="button"
                onClick={() => playOrResolve(track)}
                className="grid grid-cols-[52px_minmax(0,1fr)] items-center gap-3 rounded-[22px] border border-white/10 bg-white/[0.04] px-3 py-3 text-left transition hover:border-cyan-300/25"
              >
                <TrackArtwork track={track} className="h-12 w-12 rounded-[14px]" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black text-white" title={track.title}>{shortenText(track.title, 34)}</span>
                  <span className="block truncate text-xs text-white/55" title={track.artist || 'Без артиста'}>{shortenText(track.artist || 'Без артиста', 28)}</span>
                  <span className="mt-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.12em] text-rose-200">
                    <NavIcon name="heart" className="h-3 w-3" />
                    {track.likesCount || 1}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-[24px] border border-white/10 bg-black/16 p-4 text-sm text-white/58">
            Пока пусто. Нажми сердечко у трека или в плеере, и он появится здесь.
          </div>
        )}
      </div>

      <div className="rounded-[32px] border border-white/10 bg-slate-950/72 p-5 shadow-panel">
        {!isAuthenticated ? (
          <div className="rounded-[28px] border border-cyan-300/20 bg-black/18 p-5 text-center">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-100/70">Плейлисты</p>
            <h3 className="mt-2 text-2xl font-black text-white">Сохранение музыки после регистрации</h3>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/62">
              Радио и прослушивание доступны сразу. Плейлисты, распознавание и личная библиотека включатся после создания аккаунта.
            </p>
            <button type="button" onClick={requireRegistration} className="mt-5 rounded-full bg-cyan-300 px-5 py-2 text-sm font-black text-slate-950">
              Зарегистрироваться
            </button>
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/48">Плейлисты во вселенной</p>
                <p className="mt-1 text-sm text-white/60">Создавай подборки, переименовывай их, делись и запускай с одного места.</p>
              </div>
              <div className="flex gap-2">
                <input
                  value={playlistName}
                  onChange={(event) => setPlaylistName(event.target.value)}
                  className="input-field py-2 text-sm"
                  placeholder="Новый плейлист"
                />
                <button
                  type="button"
                  onClick={() => {
                    const id = createPlaylist(playlistName);
                    setPlaylistName('');
                    setSelectedPlaylistId(id);
                  }}
                  className="rounded-full border border-white/12 bg-white/[0.06] px-4 py-2 text-sm font-black text-white"
                >
                  Создать
                </button>
              </div>
            </div>

        {playlists.length > 0 && (
          <div className="mb-4 grid gap-2 lg:grid-cols-[minmax(0,1fr)_280px]">
            <select value={selectedPlaylistId} onChange={(event) => setSelectedPlaylistId(event.target.value)} className="input-field py-2 text-sm">
              {playlists.map((playlist) => <option key={playlist.id} value={playlist.id}>{playlist.name}</option>)}
            </select>
            <button
              type="button"
              disabled={!selectedTrack || !selectedPlaylistId}
              onClick={() => addToPlaylist(selectedPlaylistId, selectedTrack)}
              className="rounded-full border border-cyan-300/22 bg-cyan-300/6 px-4 py-3 text-sm font-black text-cyan-100 disabled:opacity-50"
            >
              Добавить выбранный трек
            </button>
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid gap-3">
            {playlists.map((playlist) => (
              <article key={playlist.id} className="rounded-[24px] border border-white/10 bg-black/14 p-4">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                  <div className="min-w-0">
                    {editingPlaylistId === playlist.id ? (
                      <div className="flex gap-2">
                        <input
                          value={editingPlaylistName}
                          onChange={(event) => setEditingPlaylistName(event.target.value)}
                          onKeyDown={(event) => event.key === 'Enter' && submitPlaylistRename(playlist.id)}
                          className="input-field h-9 py-2 text-sm"
                        />
                        <button type="button" onClick={() => submitPlaylistRename(playlist.id)} className="rounded-full border border-cyan-300/28 px-3 py-1 text-xs font-black text-cyan-200">
                          OK
                        </button>
                      </div>
                    ) : (
                      <>
                        <p className="truncate text-lg font-black text-white">{playlist.name}</p>
                        <p className="text-xs text-white/55">{playlist.tracks.length} треков</p>
                      </>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 lg:flex-nowrap lg:justify-end">
                    <button type="button" disabled={playlist.tracks.length === 0} onClick={() => playPlaylist(playlist.id)} className="rounded-full border border-cyan-300/28 px-3 py-1 text-xs font-black text-cyan-200 disabled:opacity-50">Старт</button>
                    <button type="button" onClick={() => { setEditingPlaylistId(playlist.id); setEditingPlaylistName(playlist.name); }} className="rounded-full border border-white/12 px-3 py-1 text-xs font-black text-white/80">Имя</button>
                    <button type="button" onClick={() => sharePlaylist(playlist)} className="rounded-full border border-white/12 px-3 py-1 text-xs font-black text-white/80">Поделиться</button>
                    <button type="button" onClick={() => deletePlaylist(playlist.id)} className="rounded-full border border-red-400/35 px-3 py-1 text-xs font-black text-red-300">Удалить</button>
                  </div>
                </div>

                {playlist.tracks.length > 0 ? (
                  <div className="mt-4 grid gap-2">
                    {playlist.tracks.map((track) => (
                      <div key={track.id} className="grid items-center gap-3 rounded-[18px] border border-white/8 bg-white/[0.03] px-3 py-2 lg:grid-cols-[48px_minmax(0,1fr)_auto]">
                        <TrackArtwork track={track} className="h-12 w-12 rounded-[14px]" />
                        <button type="button" onClick={() => { setSelectedPlaylistId(playlist.id); playTrack(track); showPanel(); }} className="min-w-0 text-left">
                        <p className="truncate text-sm font-black text-white" title={track.title}>{shortenText(track.title, 46)}</p>
                        <p className="truncate text-xs text-white/55" title={track.artist || 'Без артиста'}>{shortenText(track.artist || 'Без артиста', 34)}</p>
                      </button>
                        <button type="button" onClick={() => removeFromPlaylist(playlist.id, track.id)} className="justify-self-end rounded-full border border-red-400/35 px-3 py-1 text-xs font-black text-red-300">
                          Удалить
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-white/52">В этом плейлисте пока нет треков.</p>
                )}
              </article>
            ))}
            {playlists.length === 0 && <p className="text-sm text-white/52">Плейлистов пока нет.</p>}
          </div>

          <div className="rounded-[24px] border border-white/10 bg-black/14 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/48">История</p>
                <p className="mt-1 text-sm text-white/60">Последние треки твоей вселенной.</p>
              </div>
            </div>
            <div className="grid gap-2">
              {history.slice(0, 5).map((track) => (
                <button key={track.id} type="button" onClick={() => playTrack(track)} className="grid items-center gap-3 rounded-[22px] border border-white/10 bg-black/14 px-3 py-3 text-left lg:grid-cols-[52px_minmax(0,1fr)]">
                  <TrackArtwork track={track} className="h-12 w-12 rounded-[14px]" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black text-white" title={track.title}>{shortenText(track.title, 44)}</span>
                    <span className="block truncate text-xs text-white/55" title={track.artist || 'Без артиста'}>{shortenText(track.artist || 'Без артиста', 32)}</span>
                  </span>
                </button>
              ))}
              {!history.length && <p className="text-sm text-white/52">История пока пуста.</p>}
            </div>
          </div>
        </div>

          </>
        )}
      </div>

      <div className="rounded-[32px] border border-white/10 bg-slate-950/72 p-5 shadow-panel">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex items-center gap-3 rounded-full border border-white/20 bg-black/18 px-4 py-3">
            <NavIcon name="search" className="h-5 w-5 text-white/75" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submitSearch(query);
              }}
              className="w-full bg-transparent text-lg font-semibold text-white outline-none placeholder:text-white/45"
              placeholder="Найти артиста или его песни..."
            />
          </div>
          <button type="button" onClick={() => submitSearch(query)} className="rounded-full bg-white/10 px-6 py-3 text-sm font-black text-white transition hover:bg-white/16">
            Найти
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {['top', 'tracks', 'liked', 'artists', 'albums'].map((view) => (
            <button
              key={view}
              type="button"
              onClick={() => setSearchView(view)}
              className={`rounded-full px-5 py-2.5 text-sm font-black transition ${
                searchView === view
                  ? 'border border-yellow-300/70 bg-yellow-300/10 text-yellow-200'
                  : 'border border-white/8 bg-white/[0.06] text-white/70 hover:text-white'
              }`}
            >
              {view === 'top' ? 'Топ' : view === 'tracks' ? 'Треки' : view === 'liked' ? 'Понравившиеся' : view === 'artists' ? 'Исполнители' : 'Альбомы'}
            </button>
          ))}
        </div>

        {(tracksQuery.data?.message || tracksQuery.error?.response?.data?.message || catalogQuery.error?.response?.data?.message) && (
          <p className="mt-3 text-xs font-bold text-amber-200">
            {tracksQuery.data?.message || tracksQuery.error?.response?.data?.message || catalogQuery.error?.response?.data?.message}
          </p>
        )}

        {!searchText ? (
          <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_380px]">
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-2xl font-black text-white">Известные артисты</h3>
                <span className="text-sm text-white/55">Быстрый вход в карточку</span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {featuredArtists.map((artist) => (
                  <button
                    key={artist.name}
                    type="button"
                    onClick={() => openArtist(artist.name)}
                    className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.05] text-left transition hover:border-cyan-300/24"
                  >
                    <div className={`h-36 bg-gradient-to-br ${artist.accent}`} />
                    <div className="p-4">
                      <p className="text-2xl font-black text-white">{artist.name}</p>
                      <p className="mt-1 text-sm text-white/60">{artist.songs.join(' · ')}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4">
              <div className="mb-3">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/48">Своя песня</p>
                <p className="mt-1 text-sm text-white/60">Без загрузки файла: сохраняем только метаданные и, если хочешь, ссылку на поток.</p>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <input value={customDraft.title} onChange={(event) => setCustomDraft((current) => ({ ...current, title: event.target.value }))} className="input-field py-2 text-sm" placeholder="Название" />
                <input value={customDraft.artist} onChange={(event) => setCustomDraft((current) => ({ ...current, artist: event.target.value }))} className="input-field py-2 text-sm" placeholder="Исполнитель" />
                <input value={customDraft.album} onChange={(event) => setCustomDraft((current) => ({ ...current, album: event.target.value }))} className="input-field py-2 text-sm" placeholder="Альбом" />
                <input value={customDraft.thumbnailUrl} onChange={(event) => setCustomDraft((current) => ({ ...current, thumbnailUrl: event.target.value }))} className="input-field py-2 text-sm" placeholder="Ссылка на обложку" />
                <input value={customDraft.audioUrl} onChange={(event) => setCustomDraft((current) => ({ ...current, audioUrl: event.target.value }))} className="input-field py-2 text-sm md:col-span-2" placeholder="Ссылка на аудиопоток (необязательно)" />
                <textarea value={customDraft.lyrics} onChange={(event) => setCustomDraft((current) => ({ ...current, lyrics: event.target.value }))} className="input-field min-h-24 resize-y md:col-span-2" placeholder="Текст песни (необязательно)" />
              </div>
              <div className="mt-3 flex justify-end">
                <button type="button" onClick={addCustomTrack} className="rounded-full bg-cyan-300 px-5 py-2.5 text-sm font-black text-slate-950">
                  Добавить в базу
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {searchView === 'top' && topArtist && (
              <button
                type="button"
                onClick={() => openArtist(topArtist.name)}
                className="grid w-full items-center gap-4 rounded-[30px] border border-white/10 bg-white/[0.04] p-4 text-left transition hover:border-cyan-300/22 lg:grid-cols-[96px_minmax(0,1fr)_auto]"
              >
                <TrackArtwork image={topArtist.image} className="h-24 w-24 rounded-full" />
                <div className="min-w-0">
                  <p className="text-3xl font-black text-white">{topArtist.name}</p>
                  <p className="mt-1 text-sm text-white/56">{topArtist.trackCount || 0} треков найдено</p>
                </div>
                <span className="rounded-full border border-white/12 px-4 py-2 text-sm font-black text-white/80">Открыть артиста</span>
              </button>
            )}

            {searchView !== 'albums' && artistCards.length > 0 && (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-3xl font-black text-white">Исполнители</h3>
                  <button type="button" onClick={() => setSearchView('artists')} className="text-sm font-bold text-white/55">Показать все</button>
                </div>
                <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
                  {artistCards.slice(0, searchView === 'artists' ? artistCards.length : 4).map((artist) => (
                    <button
                      key={artist.id}
                      type="button"
                      onClick={() => openArtist(artist.name)}
                      className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4 text-left transition hover:border-cyan-300/22"
                    >
                      <TrackArtwork image={artist.image} className="h-36 w-full rounded-[24px]" />
                      <p className="mt-3 truncate text-xl font-black text-white" title={artist.name}>{shortenText(artist.name, 28)}</p>
                      <p className="text-sm text-white/55">{artist.trackCount || 0} треков</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {searchView !== 'artists' && trackListForView.length > 0 && (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-3xl font-black text-white">Треки</h3>
                  <p className="text-sm text-white/55">{trackListForView.length} найдено</p>
                </div>
                <div className="grid gap-2">
                  {trackListForView.map((track) => (
                    <article
                      key={track.id}
                      className={`grid items-center gap-4 rounded-[24px] border px-4 py-3 lg:grid-cols-[72px_minmax(0,1fr)_auto] ${
                        selectedTrack?.id === track.id
                          ? 'border-cyan-300/35 bg-cyan-300/[0.08] shadow-neon'
                          : 'border-white/10 bg-white/[0.04]'
                      }`}
                    >
                      <TrackArtwork track={track} className="h-16 w-16 rounded-[18px]" />
                      <button type="button" onClick={() => playOrResolve(track)} className="min-w-0 text-left">
                        <p className="truncate text-lg font-black text-white" title={track.title}>{shortenText(track.title, 52)}</p>
                        <div className="mt-1 flex items-center gap-2">
                          <p className="truncate text-sm text-white/58" title={track.artist || track.channelTitle || 'Без артиста'}>{shortenText(track.artist || track.channelTitle || 'Без артиста', 38)}</p>
                          {track.explicit && <ExplicitBadge />}
                        </div>
                        <p className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-200/75">{track.providerLabel || 'Музыка'}</p>
                      </button>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => toggleTrackLike(track)}
                          disabled={toggleLikeMutation.isPending}
                          className={`inline-flex items-center gap-1 rounded-full border px-3 py-2 text-xs font-black transition ${
                            isLikedTrack(track)
                              ? 'border-rose-300/45 bg-rose-300/16 text-rose-100'
                              : 'border-white/12 bg-white/[0.04] text-white/65 hover:text-white'
                          } disabled:opacity-50`}
                          aria-label={isLikedTrack(track) ? 'Убрать из понравившихся' : 'Добавить в понравившиеся'}
                        >
                          <NavIcon name="heart" className="h-3.5 w-3.5" />
                          {likeCountForTrack(track)}
                        </button>
                        {track.artist && (
                          <button type="button" onClick={() => openArtist(track.artist)} className="rounded-full border border-white/12 px-4 py-2 text-xs font-black text-white/75">
                            Артист
                          </button>
                        )}
                        {track.source === 'custom' && (
                          <button type="button" onClick={() => removeLibraryTrack(track.id)} className="rounded-full border border-red-400/35 px-4 py-2 text-xs font-black text-red-300">
                            Удалить
                          </button>
                        )}
                        <span className="text-sm font-bold text-white/45">{track.duration || '--:--'}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}

            {searchView !== 'artists' && searchView !== 'tracks' && filteredAlbumCards.length > 0 && (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-3xl font-black text-white">Альбомы</h3>
                  <p className="text-sm text-white/55">{filteredAlbumCards.length} найдено</p>
                </div>
                <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
                  {filteredAlbumCards.map((album) => (
                    <article key={album.id} className="rounded-[28px] border border-white/10 bg-white/[0.04] p-3">
                      <TrackArtwork image={album.image} className="h-56 w-full rounded-[22px]" />
                      <p className="mt-3 truncate text-xl font-black text-white" title={album.title}>{shortenText(album.title, 30)}</p>
                      <p className="text-sm text-white/55" title={album.artist}>{shortenText(album.artist, 26)}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <p className="text-sm text-white/40">{album.trackCount || 0} треков</p>
                        {album.explicit && <ExplicitBadge />}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}

            {!tracksQuery.isLoading && !catalogQuery.isLoading && !artistCards.length && !trackListForView.length && !filteredAlbumCards.length && (
              <p className="text-sm text-white/58">Ничего не найдено. Попробуй другой запрос или открой карточку известного артиста.</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
