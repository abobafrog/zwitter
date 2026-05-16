import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Howl } from 'howler';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import useMusicStore from '../../store/musicStore';
import useAuthStore from '../../store/authStore';
import NavIcon from '../layout/NavIcon';
import api from '../../services/api';
import { buildTrackShareUrl } from '../../utils/musicShare';

const formatTime = (seconds) => {
  const number = Number(seconds);
  const safe = Number.isFinite(number) ? Math.max(0, number) : 0;
  const minutes = Math.floor(safe / 60);
  const rest = String(Math.floor(safe % 60)).padStart(2, '0');
  return `${minutes}:${rest}`;
};

const durationFromTrack = (track) => {
  if (!track?.duration) return 0;
  const [minutes = 0, seconds = 0] = track.duration.split(':').map(Number);
  const total = minutes * 60 + seconds;
  return Number.isFinite(total) ? total : 0;
};

const MIN_PANEL_WIDTH = 360;
const MIN_PANEL_HEIGHT = 360;
const EDGE_GAP = 18;
const resizeHandleStyles = {
  n: { left: 18, right: 18, top: 0, height: 9, cursor: 'ns-resize' },
  s: { left: 18, right: 18, bottom: 0, height: 9, cursor: 'ns-resize' },
  e: { top: 18, bottom: 18, right: 0, width: 9, cursor: 'ew-resize' },
  w: { top: 18, bottom: 18, left: 0, width: 9, cursor: 'ew-resize' },
  ne: { top: 0, right: 0, width: 22, height: 22, cursor: 'nesw-resize' },
  nw: { top: 0, left: 0, width: 22, height: 22, cursor: 'nwse-resize' },
  se: { bottom: 0, right: 0, width: 22, height: 22, cursor: 'nwse-resize' },
  sw: { bottom: 0, left: 0, width: 22, height: 22, cursor: 'nesw-resize' },
};

const clampFrame = (frame) => {
  const maxWidth = Math.max(MIN_PANEL_WIDTH, window.innerWidth - 32);
  const maxHeight = Math.max(MIN_PANEL_HEIGHT, window.innerHeight - 32);
  const width = Math.min(maxWidth, Math.max(MIN_PANEL_WIDTH, Math.round(frame.width || 460)));
  const height = Math.min(maxHeight, Math.max(MIN_PANEL_HEIGHT, Math.round(frame.height || 430)));
  const maxLeft = Math.max(12, window.innerWidth - width - 12);
  const maxTop = Math.max(12, window.innerHeight - height - 12);
  const left = Math.min(maxLeft, Math.max(12, Math.round(frame.left ?? (window.innerWidth - width - EDGE_GAP))));
  const top = Math.min(maxTop, Math.max(12, Math.round(frame.top ?? (window.innerHeight - height - 24))));
  return { width, height, left, top };
};

const shortenText = (value = '', maxLength = 48) => {
  const text = value?.toString?.().trim?.() || '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
};

const normalizeText = (value = '') => value.toString().toLowerCase().replace(/[^a-z0-9а-яё]+/gi, ' ').replace(/\s+/g, ' ').trim();
const primaryArtistName = (value = '') => value.toString().split(/,|&| feat\. | feat | x | with /i)[0].trim();
const trackKeyOf = (track) => {
  if (!track) return '';
  const title = normalizeText(track.title);
  const artist = normalizeText(primaryArtistName(track.artist || track.channelTitle));
  return track.trackKey || (title ? `${artist || 'unknown'}::${title}` : '');
};

const likePayloadFrom = (track) => ({
  trackKey: trackKeyOf(track),
  title: track?.title || '',
  artist: track?.artist || track?.channelTitle || '',
  album: track?.album || '',
  thumbnailUrl: track?.fullArtworkUrl || track?.thumbnailUrl || '',
  fullArtworkUrl: track?.fullArtworkUrl || track?.thumbnailUrl || '',
  image: track?.fullArtworkUrl || track?.thumbnailUrl || '',
  audioUrl: track?.audioUrl || track?.previewUrl || '',
  provider: track?.provider || track?.source || 'catalog',
  providerLabel: track?.providerLabel || 'Музыка',
  duration: track?.duration || '',
  durationSeconds: track?.durationSeconds || 0,
});

function TrackArtwork({ track, className = 'h-14 w-14 rounded-xl' }) {
  const [failed, setFailed] = useState(false);
  if (track?.thumbnailUrl && !failed) {
    return <img src={track.thumbnailUrl} alt="" onError={() => setFailed(true)} className={`${className} flex-shrink-0 object-cover`} />;
  }
  return (
    <div className={`${className} flex flex-shrink-0 items-center justify-center border border-cyan-300/25 bg-cyan-300/10 text-x-accent`}>
      <NavIcon name="music" className="h-6 w-6" />
    </div>
  );
}

export default function BackgroundMusicPlayer() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const {
    currentTrack,
    error,
    isPlaying,
    isPanelOpen,
    playbackRate,
    panelFrame,
    activePlaylistId,
    radioSeed,
    playNextInPlaylist,
    playTrack,
    playPreviousInPlaylist,
    pausePlayback,
    resumePlayback,
    setPanelFrame,
    setPlaybackRate,
    setError,
    stop,
    showPanel,
    hidePanel,
  } = useMusicStore();
  const howlRef = useRef(null);
  const progressTimerRef = useRef(null);
  const panelRef = useRef(null);
  const lastAutoSkipRef = useRef('');
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [volume, setVolume] = useState(0.78);
  const [panelTab, setPanelTab] = useState('player');
  const [radioSkipping, setRadioSkipping] = useState(false);
  const artistLabel = useMemo(
    () => currentTrack?.artist || currentTrack?.channelTitle || currentTrack?.providerLabel || 'Muffon',
    [currentTrack?.artist, currentTrack?.channelTitle, currentTrack?.providerLabel]
  );
  const providerLabel = currentTrack?.providerLabel || 'Muffon';
  const likedQuery = useQuery({
    queryKey: ['music-likes'],
    queryFn: () => api.get('/music/likes').then((response) => response.data),
    enabled: Boolean(user),
    staleTime: 1000 * 60,
  });
  const likedMap = useMemo(
    () => new Map((likedQuery.data?.tracks || []).map((track) => [trackKeyOf(track), track])),
    [likedQuery.data?.tracks]
  );
  const currentTrackKey = trackKeyOf(currentTrack);
  const currentLikedTrack = likedMap.get(currentTrackKey);
  const currentLiked = Boolean(currentLikedTrack || currentTrack?.likedByMe);
  const currentLikesCount = Math.max(Number(currentTrack?.likesCount) || 0, Number(currentLikedTrack?.likesCount) || 0);
  const toggleLikeMutation = useMutation({
    mutationFn: () => api.post('/music/tracks/like', { track: likePayloadFrom(currentTrack) }).then((response) => response.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['music-likes'] });
      queryClient.invalidateQueries({ queryKey: ['music-search'] });
      queryClient.invalidateQueries({ queryKey: ['music-catalog-search'] });
      queryClient.invalidateQueries({ queryKey: ['music-artist-catalog'] });
    },
    onError: () => toast.error('Не удалось обновить сердечко'),
  });
  const toggleCurrentLike = () => {
    if (!user) {
      toast('Войди в аккаунт, чтобы ставить сердечки');
      return;
    }
    toggleLikeMutation.mutate();
  };
  const lyricsQuery = useQuery({
    queryKey: ['player-lyrics', currentTrack?.id, currentTrack?.title, currentTrack?.artist],
    queryFn: () => api.get('/music/lyrics', {
      params: {
        title: currentTrack?.title,
        artist: currentTrack?.artist,
        album: currentTrack?.album,
        duration: currentTrack?.durationSeconds || 0,
      },
    }).then((response) => response.data),
    enabled: Boolean(currentTrack?.title && currentTrack?.artist && currentTrack?.source !== 'custom'),
    staleTime: 1000 * 60 * 30,
  });

  const activeLyrics = currentTrack?.source === 'custom'
    ? currentTrack?.lyrics || ''
    : lyricsQuery.data?.lyrics || '';

  const playNextRadioTrack = async (seed, offset = 1) => {
    const query = seed || currentTrack?.radioSeed || radioSeed || currentTrack?.artist || currentTrack?.title || '';
    if (!query) {
      pausePlayback();
      return;
    }

    setRadioSkipping(true);
    try {
      const data = await api.get('/music/search', { params: { q: query, limit: 30 } }).then((response) => response.data);
      const pool = (data?.tracks || []).filter((track) => track.audioUrl && track.id !== currentTrack?.id);
      const nextTrack = offset < 0 ? pool[pool.length - 1] : pool[Math.floor(Math.random() * pool.length)];
      if (!nextTrack) {
        pausePlayback();
        setError('Радио не нашло следующий трек.');
        return;
      }
      playTrack({ ...nextTrack, radioSeed: query });
    } catch {
      pausePlayback();
      setError('Не удалось продолжить радио.');
    } finally {
      setRadioSkipping(false);
    }
  };

  useEffect(() => {
    if (!isPanelOpen) return undefined;

    const syncFrame = () => {
      const nextFrame = clampFrame(panelFrame);
      if (
        nextFrame.width !== panelFrame.width ||
        nextFrame.height !== panelFrame.height ||
        nextFrame.left !== panelFrame.left ||
        nextFrame.top !== panelFrame.top
      ) {
        setPanelFrame(nextFrame);
      }
    };

    syncFrame();
    window.addEventListener('resize', syncFrame);
    return () => window.removeEventListener('resize', syncFrame);
  }, [isPanelOpen, panelFrame, setPanelFrame]);

  useEffect(() => {
    if (!currentTrack?.audioUrl) {
      setIsBuffering(false);
      setPosition(0);
      setDuration(durationFromTrack(currentTrack));
      return undefined;
    }
    setPosition(0);
    setDuration(durationFromTrack(currentTrack));
    setIsBuffering(true);
    setError('');

    if (progressTimerRef.current) window.clearInterval(progressTimerRef.current);
    if (howlRef.current) {
      howlRef.current.unload();
      howlRef.current = null;
    }

    const howl = new Howl({
      src: [currentTrack.audioUrl],
      html5: true,
      volume,
      rate: playbackRate,
      format: ['mp3', 'aac', 'ogg', 'wav', 'webm', 'mp4'],
      onload: () => {
        const nextDuration = Math.round(howl.duration());
        if (Number.isFinite(nextDuration) && nextDuration > 0) setDuration(nextDuration);
      },
      onloaderror: () => {
        setIsBuffering(false);
        setError('Не удалось загрузить аудиопоток. Попробуйте другой трек.');
      },
      onplayerror: () => {
        setIsBuffering(false);
        setError('Браузер заблокировал автозапуск. Нажмите Играть.');
      },
      onplay: () => {
        setIsBuffering(false);
        if (progressTimerRef.current) window.clearInterval(progressTimerRef.current);
        progressTimerRef.current = window.setInterval(() => {
          const nextPosition = Math.round(howl.seek());
          if (Number.isFinite(nextPosition)) setPosition(nextPosition);
        }, 250);
      },
      onpause: () => {
        setIsBuffering(false);
        if (progressTimerRef.current) window.clearInterval(progressTimerRef.current);
      },
      onstop: () => {
        if (progressTimerRef.current) window.clearInterval(progressTimerRef.current);
        setPosition(0);
      },
      onend: () => {
        if (progressTimerRef.current) window.clearInterval(progressTimerRef.current);
        setPosition(0);
        if (activePlaylistId) playNextInPlaylist();
        else if (currentTrack?.radioSeed || radioSeed) playNextRadioTrack(currentTrack?.radioSeed || radioSeed);
        else pausePlayback();
      },
    });

    howlRef.current = howl;
    if (isPlaying) howl.play();

    return () => {
      if (progressTimerRef.current) window.clearInterval(progressTimerRef.current);
      howl.unload();
      if (howlRef.current === howl) howlRef.current = null;
    };
  }, [activePlaylistId, currentTrack?.audioUrl, currentTrack?.id, currentTrack?.radioSeed, pausePlayback, playNextInPlaylist, playTrack, radioSeed, setError]);

  useEffect(() => {
    howlRef.current?.volume(volume);
  }, [volume]);

  useEffect(() => {
    howlRef.current?.rate(playbackRate);
  }, [playbackRate]);

  useEffect(() => {
    const howl = howlRef.current;
    if (!howl) return;
    if (isPlaying) howl.play();
    else howl.pause();
  }, [isPlaying]);

  const hasAudioStream = Boolean(currentTrack?.audioUrl);
  const radioKey = currentTrack?.radioSeed || radioSeed || currentTrack?.artist || currentTrack?.title;
  const isRadioMode = Boolean(radioKey);
  const hasDuration = Number.isFinite(duration) && duration > 0;
  const progressMax = currentTrack?.previewOnly ? 30 : hasDuration ? duration : 30;
  const canSeek = hasAudioStream && hasDuration && !currentTrack?.previewOnly;
  const frame = clampFrame(panelFrame);

  useEffect(() => {
    if (!error) return undefined;
    if (!isRadioMode) return undefined;
    if (radioSkipping) return undefined;

    const isStreamError = error.includes('Не удалось загрузить аудиопоток');
    if (!isStreamError) return undefined;

    const key = `${currentTrack?.id || currentTrack?.title}-${error}`;
    if (lastAutoSkipRef.current === key) return undefined;
    lastAutoSkipRef.current = key;

    const timer = setTimeout(() => {
      playNextRadioTrack(radioKey);
    }, 800);

    return () => clearTimeout(timer);
  }, [
    error,
    isRadioMode,
    radioSkipping,
    currentTrack?.id,
    currentTrack?.title,
    radioKey,
    playNextRadioTrack,
  ]);

  if (!currentTrack) return null;

  const beginResize = (direction, event) => {
    event.preventDefault();
    const startFrame = clampFrame(panelFrame);
    const startX = event.clientX;
    const startY = event.clientY;

    const onMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      const nextFrame = { ...startFrame };

      if (direction.includes('e')) nextFrame.width = startFrame.width + deltaX;
      if (direction.includes('s')) nextFrame.height = startFrame.height + deltaY;
      if (direction.includes('w')) {
        nextFrame.width = startFrame.width - deltaX;
        nextFrame.left = startFrame.left + deltaX;
      }
      if (direction.includes('n')) {
        nextFrame.height = startFrame.height - deltaY;
        nextFrame.top = startFrame.top + deltaY;
      }

      setPanelFrame(clampFrame(nextFrame));
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const seekTo = (event) => {
    const next = Number(event.target.value);
    howlRef.current?.seek(next);
    setPosition(next);
  };

  const shareTrack = async () => {
    try {
      const url = buildTrackShareUrl(currentTrack);
      const text = `${currentTrack.artist || 'Исполнитель'} - ${currentTrack.title}`;
      if (navigator.share) {
        await navigator.share({ title: currentTrack.title, text, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success('Ссылка на трек скопирована');
      }
    } catch {
      toast.error('Не удалось поделиться треком');
    }
  };

  return createPortal((
    <div
      className="background-music-player background-music-player-compact"
      style={isPanelOpen
        ? {
          left: frame.left,
          top: frame.top,
          right: 'auto',
          bottom: 'auto',
        }
        : undefined}
    >
      {isPanelOpen && (
        <div
          ref={panelRef}
          className="background-music-panel pointer-events-auto overflow-auto rounded-[28px] border border-cyan-300/20 bg-[linear-gradient(180deg,rgba(8,14,34,0.98),rgba(5,8,24,0.98))] shadow-[0_0_44px_rgba(34,211,238,0.18)] backdrop-blur-xl"
          style={{ width: frame.width, height: frame.height, resize: 'both' }}
        >
          {['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map((direction) => (
            <button
              key={direction}
              type="button"
              aria-label={`Изменить размер окна ${direction}`}
              onMouseDown={(event) => beginResize(direction, event)}
              className="absolute z-[5] border-0 bg-transparent p-0"
              style={resizeHandleStyles[direction]}
            />
          ))}
          <div className="flex items-center justify-between gap-3 border-b border-cyan-300/12 px-5 py-4">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300/90">{providerLabel} играет</p>
              <p className="truncate text-base font-black text-x-text" title={currentTrack.title}>{shortenText(currentTrack.title, 64)}</p>
            </div>
            <div className="flex flex-shrink-0 items-center gap-1">
              <button type="button" onClick={hidePanel} className="panel-icon-button h-8 w-8" aria-label="Свернуть музыку">
                <span className="text-sm font-black">-</span>
              </button>
              <button type="button" onClick={stop} className="panel-icon-button h-8 w-8" aria-label="Остановить музыку">
                <NavIcon name="close" className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="p-5">
            <div className="mb-4 flex items-center gap-2 rounded-full border border-cyan-300/15 bg-white/5 p-1">
              {[
                { id: 'player', label: 'Плеер' },
                { id: 'lyrics', label: 'Текст' },
                { id: 'cover', label: 'Обложка' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setPanelTab(tab.id)}
                  className={`rounded-full px-4 py-2 text-xs font-black transition ${
                    panelTab === tab.id
                      ? 'bg-cyan-300/15 text-cyan-200 shadow-neon'
                      : 'text-x-muted hover:text-x-text'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {panelTab === 'cover' ? (
              <div className="rounded-[24px] border border-cyan-300/12 bg-white/[0.03] p-4">
                {currentTrack?.fullArtworkUrl || currentTrack?.thumbnailUrl ? (
                  <img
                    src={currentTrack.fullArtworkUrl || currentTrack.thumbnailUrl}
                    alt={currentTrack.title}
                    className="h-[min(52vh,420px)] w-full rounded-[20px] object-cover"
                  />
                ) : (
                  <div className="flex h-[320px] items-center justify-center rounded-[20px] border border-cyan-300/12 bg-cyan-300/5 text-x-muted">
                    Обложка недоступна
                  </div>
                )}
              </div>
            ) : panelTab === 'lyrics' ? (
              <div className="rounded-[24px] border border-cyan-300/12 bg-white/[0.03] p-4">
                {lyricsQuery.isLoading && currentTrack?.source !== 'custom' ? (
                  <p className="text-sm text-x-muted">Ищу текст...</p>
                ) : activeLyrics ? (
                  <pre className="max-h-[min(52vh,420px)] overflow-auto whitespace-pre-wrap break-words pr-2 text-sm leading-7 text-x-text">
                    {activeLyrics}
                  </pre>
                ) : (
                  <p className="text-sm text-x-muted">
                    {lyricsQuery.data?.message || 'Текст для этого трека пока не найден.'}
                  </p>
                )}
              </div>
            ) : (
              <>
            <div className="flex items-center gap-4">
              <TrackArtwork track={currentTrack} className="h-20 w-20 rounded-[22px]" />
              <div className="min-w-0">
                <p className="truncate text-[28px] font-black leading-none text-x-text" title={currentTrack.title}>{shortenText(currentTrack.title, 72)}</p>
                <p className="mt-2 truncate text-lg font-bold text-cyan-100/90" title={artistLabel}>{shortenText(artistLabel, 44)}</p>
                {currentTrack.album && <p className="mt-1 truncate text-sm text-x-muted" title={currentTrack.album}>{shortenText(currentTrack.album, 56)}</p>}
              </div>
            </div>

            <div className="mt-6">
              <input
                type="range"
                min="0"
                max={progressMax}
                step="1"
                value={canSeek ? Math.min(position, progressMax) : Math.min(position, progressMax)}
                onChange={seekTo}
                disabled={!canSeek}
                className="music-range w-full accent-cyan-300"
              />
              <div className="mt-1 flex items-center justify-between text-xs font-bold text-x-muted">
                <span>{formatTime(position)}</span>
                <span>{currentTrack.previewOnly ? '~0:30' : hasDuration ? formatTime(duration) : currentTrack.duration || '--:--'}</span>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2 rounded-full border border-cyan-300/12 bg-white/[0.04] px-2 py-2">
                <button
                  type="button"
                  onClick={() => (activePlaylistId ? playPreviousInPlaylist() : playNextRadioTrack(radioKey, -1))}
                  disabled={!activePlaylistId && (!radioKey || radioSkipping)}
                  className="panel-icon-button disabled:opacity-45"
                  aria-label={activePlaylistId ? 'Предыдущий трек' : 'Предыдущий трек радио'}
                >
                  <span className="text-sm font-black">{'<<'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => (isPlaying ? pausePlayback() : resumePlayback())}
                  disabled={!hasAudioStream}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-yellow-300 text-slate-950 shadow-[0_0_26px_rgba(250,204,21,0.4)] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <NavIcon name={isPlaying ? 'pause' : 'play'} className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => (activePlaylistId ? playNextInPlaylist() : playNextRadioTrack(radioKey))}
                  disabled={!activePlaylistId && (!radioKey || radioSkipping)}
                  className="panel-icon-button disabled:opacity-45"
                  aria-label={activePlaylistId ? 'Следующий трек' : 'Следующий трек радио'}
                >
                  <span className="text-sm font-black">{'>>'}</span>
                </button>
                <button type="button" onClick={shareTrack} className="panel-icon-button" aria-label="Поделиться треком">
                  <NavIcon name="share" className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={toggleCurrentLike}
                  disabled={toggleLikeMutation.isPending}
                  className={`panel-icon-button disabled:opacity-45 ${currentLiked ? 'text-rose-200' : ''}`}
                  aria-label={currentLiked ? 'Убрать из понравившихся' : 'Добавить в понравившиеся'}
                >
                  <NavIcon name="heart" className="h-4 w-4" />
                </button>
              </div>
              <label className="flex items-center gap-3 text-xs font-bold text-x-muted">
                <span>Громкость</span>
                <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(event) => setVolume(Number(event.target.value))} className="music-range w-28 accent-cyan-300" />
              </label>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <label className="flex flex-1 items-center gap-3 text-xs font-bold text-x-muted">
                <span className="min-w-14">Скорость</span>
                <input
                  type="range"
                  min="0.1"
                  max="2.5"
                  step="0.1"
                  value={playbackRate}
                  onChange={(event) => setPlaybackRate(Number(event.target.value))}
                  className="music-range w-full accent-cyan-300"
                />
              </label>
              <span className="min-w-12 text-right text-xs font-black text-x-text">{playbackRate.toFixed(1)}x</span>
            </div>
            {!hasAudioStream && (
              <p className="mt-3 text-xs font-semibold text-amber-200">
                Для этого трека окно уже открыто, но сам аудиопоток ещё не найден. Попробуй другой вариант или дождись подбора источника.
              </p>
            )}
            {isBuffering && hasAudioStream && !error && <p className="mt-3 text-xs font-semibold text-cyan-100">Подключаю поток...</p>}
            {currentTrack.previewOnly && hasAudioStream && !error && (
              <p className="mt-3 text-xs font-semibold text-amber-200">Этот источник отдаёт короткое превью. Попробуй другой результат или неофициальную версию трека.</p>
            )}
            <p className="mt-3 inline-flex items-center gap-1 text-xs font-black uppercase tracking-[0.12em] text-rose-100/80">
              <NavIcon name="heart" className="h-3.5 w-3.5" />
              {currentLikesCount}
            </p>
            {error && (
              <p className="mt-3 text-xs font-semibold text-amber-200">
                {error}
                {isRadioMode ? ' Переключаю радио...' : ''}
              </p>
            )}
              </>
            )}
          </div>
        </div>
      )}

      {!isPanelOpen && (
        <button type="button" onClick={showPanel} className="pointer-events-auto flex max-w-[calc(100vw-32px)] items-center gap-3 rounded-full border border-cyan-300/35 bg-slate-950/92 px-4 py-3 text-left shadow-neon backdrop-blur-xl">
          <TrackArtwork track={currentTrack} className="h-9 w-9 rounded-full" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-black text-x-text" title={currentTrack.title}>{shortenText(currentTrack.title, 42)}</span>
            <span className="block truncate text-xs text-x-muted">{isPlaying ? 'Музыка играет фоном' : 'Музыка поставлена на паузу'}</span>
          </span>
        </button>
      )}
    </div>
  ), document.body);
}
