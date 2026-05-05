import { useEffect, useMemo, useRef, useState } from 'react';
import { Howl } from 'howler';
import WaveSurfer from 'wavesurfer.js';
import useMusicStore from '../../store/musicStore';
import NavIcon from '../layout/NavIcon';

const formatTime = (seconds) => {
  const safe = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safe / 60);
  const rest = String(Math.floor(safe % 60)).padStart(2, '0');
  return `${minutes}:${rest}`;
};

export default function BackgroundMusicPlayer() {
  const {
    currentTrack,
    error,
    isPlaying,
    isPanelOpen,
    activePlaylistId,
    playNextInPlaylist,
    playPreviousInPlaylist,
    pausePlayback,
    resumePlayback,
    setError,
    stop,
    showPanel,
    hidePanel,
  } = useMusicStore();
  const frameRef = useRef(null);
  const waveformRef = useRef(null);
  const howlRef = useRef(null);
  const waveSurferRef = useRef(null);
  const progressTimerRef = useRef(null);
  const [frame, setFrame] = useState(() => {
    if (typeof window === 'undefined') return { left: 520, top: 120, width: 520, height: 320 };
    const width = Math.min(560, window.innerWidth - 32);
    const height = Math.min(320, window.innerHeight - 32);
    return {
      left: Math.max(16, window.innerWidth - width - 18),
      top: Math.max(16, window.innerHeight - height - 24),
      width,
      height,
    };
  });
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [volume, setVolume] = useState(0.78);
  const [ready, setReady] = useState(false);
  const artistLabel = useMemo(
    () => currentTrack?.artist || currentTrack?.channelTitle || 'OpenSubsonic',
    [currentTrack?.artist, currentTrack?.channelTitle]
  );

  useEffect(() => {
    if (!currentTrack?.audioUrl) return undefined;

    setReady(false);
    setPosition(0);
    setDuration(0);
    setError('');

    if (progressTimerRef.current) window.clearInterval(progressTimerRef.current);
    if (waveSurferRef.current) {
      waveSurferRef.current.destroy();
      waveSurferRef.current = null;
    }
    if (howlRef.current) {
      howlRef.current.unload();
      howlRef.current = null;
    }

    const howl = new Howl({
      src: [currentTrack.audioUrl],
      html5: true,
      volume,
      format: ['mp3', 'aac', 'ogg', 'wav'],
      onload: () => {
        setDuration(Math.round(howl.duration() || 0));
        setReady(true);
      },
      onloaderror: () => setError('Не удалось загрузить аудиопоток с музыкального сервера.'),
      onplayerror: () => setError('Браузер заблокировал автозапуск. Нажмите play в плеере.'),
      onplay: () => {
        if (progressTimerRef.current) window.clearInterval(progressTimerRef.current);
        progressTimerRef.current = window.setInterval(() => {
          setPosition(Math.round(howl.seek() || 0));
        }, 250);
      },
      onpause: () => {
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
        else pausePlayback();
      },
    });

    howlRef.current = howl;
    if (isPlaying) howl.play();

    const attachWaveform = window.setTimeout(() => {
      const media = howl._sounds?.[0]?._node;
      if (!media || !waveformRef.current) return;
      waveSurferRef.current = WaveSurfer.create({
        container: waveformRef.current,
        media,
        height: 76,
        waveColor: '#67e8f9',
        progressColor: '#60a5fa',
        cursorColor: '#f8fafc',
        barWidth: 3,
        barGap: 2,
        barRadius: 6,
        normalize: true,
        dragToSeek: true,
      });
      waveSurferRef.current.on('interaction', () => {
        setPosition(Math.round(howl.seek() || 0));
      });
    }, 120);

    return () => {
      window.clearTimeout(attachWaveform);
      if (progressTimerRef.current) window.clearInterval(progressTimerRef.current);
      if (waveSurferRef.current) {
        waveSurferRef.current.destroy();
        waveSurferRef.current = null;
      }
      howl.unload();
      if (howlRef.current === howl) howlRef.current = null;
    };
  }, [activePlaylistId, currentTrack?.audioUrl, currentTrack?.id, pausePlayback, playNextInPlaylist, setError]);

  useEffect(() => {
    const howl = howlRef.current;
    if (!howl) return;
    howl.volume(volume);
  }, [volume]);

  useEffect(() => {
    const howl = howlRef.current;
    if (!howl) return;
    if (isPlaying) howl.play();
    else howl.pause();
  }, [isPlaying]);

  if (!currentTrack?.audioUrl) return null;

  const clampFrame = (next) => {
    const maxWidth = Math.max(320, window.innerWidth - 32);
    const maxHeight = Math.max(240, window.innerHeight - 32);
    const width = Math.min(Math.max(next.width, 320), maxWidth);
    const height = Math.min(Math.max(next.height, 240), maxHeight);
    return {
      width,
      height,
      left: Math.min(Math.max(next.left, 16), window.innerWidth - width - 16),
      top: Math.min(Math.max(next.top, 16), window.innerHeight - height - 16),
    };
  };

  const startFrameDrag = (event, mode) => {
    if (!isPanelOpen) return;
    event.preventDefault();
    const start = { x: event.clientX, y: event.clientY, frame };
    const onMove = (moveEvent) => {
      const dx = moveEvent.clientX - start.x;
      const dy = moveEvent.clientY - start.y;
      const next = { ...start.frame };

      if (mode === 'move') {
        next.left += dx;
        next.top += dy;
      } else {
        if (mode.includes('e')) next.width += dx;
        if (mode.includes('s')) next.height += dy;
        if (mode.includes('w')) {
          next.left += dx;
          next.width -= dx;
        }
        if (mode.includes('n')) {
          next.top += dy;
          next.height -= dy;
        }
      }

      setFrame(clampFrame(next));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div
      ref={frameRef}
      className={`background-music-player ${isPanelOpen ? 'background-music-player-open' : 'background-music-player-compact'}`}
      style={isPanelOpen ? { left: frame.left, top: frame.top, width: frame.width, height: frame.height } : undefined}
    >
      <div className={`background-music-panel overflow-hidden rounded-3xl border border-cyan-300/30 bg-slate-950/95 shadow-[0_0_34px_rgba(34,211,238,0.22)] backdrop-blur-xl ${isPanelOpen ? '' : 'sr-only'}`}>
        <button type="button" className="music-resize-edge music-resize-n" onPointerDown={(event) => startFrameDrag(event, 'n')} aria-label="Изменить размер сверху" />
        <button type="button" className="music-resize-edge music-resize-s" onPointerDown={(event) => startFrameDrag(event, 's')} aria-label="Изменить размер снизу" />
        <button type="button" className="music-resize-edge music-resize-e" onPointerDown={(event) => startFrameDrag(event, 'e')} aria-label="Изменить размер справа" />
        <button type="button" className="music-resize-edge music-resize-w" onPointerDown={(event) => startFrameDrag(event, 'w')} aria-label="Изменить размер слева" />
        <button type="button" className="music-resize-corner music-resize-ne" onPointerDown={(event) => startFrameDrag(event, 'ne')} aria-label="Изменить размер" />
        <button type="button" className="music-resize-corner music-resize-nw" onPointerDown={(event) => startFrameDrag(event, 'nw')} aria-label="Изменить размер" />
        <button type="button" className="music-resize-corner music-resize-se" onPointerDown={(event) => startFrameDrag(event, 'se')} aria-label="Изменить размер" />
        <button type="button" className="music-resize-corner music-resize-sw" onPointerDown={(event) => startFrameDrag(event, 'sw')} aria-label="Изменить размер" />
        <button type="button" className="music-move-side music-move-left" onPointerDown={(event) => startFrameDrag(event, 'move')} aria-label="Передвинуть окно" />
        <button type="button" className="music-move-side music-move-right" onPointerDown={(event) => startFrameDrag(event, 'move')} aria-label="Передвинуть окно" />
        <div className="flex cursor-move items-center justify-between gap-3 border-b border-x-border/70 px-3 py-2" onPointerDown={(event) => startFrameDrag(event, 'move')}>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-x-accent">Фоново играет</p>
            <p className="truncate text-sm font-black text-x-text">{currentTrack.title}</p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1">
            <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={hidePanel} className="panel-icon-button h-8 w-8" aria-label="Свернуть музыку">
              <span className="text-sm font-black">-</span>
            </button>
            <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={stop} className="panel-icon-button h-8 w-8" aria-label="Остановить музыку">
              <NavIcon name="close" className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="grid h-[calc(100%-52px)] min-h-[210px] grid-rows-[minmax(0,1fr)_auto] bg-slate-950">
          <div className="flex min-h-0 flex-col gap-4 px-4 py-4">
            <div className="flex items-center gap-4">
              {currentTrack.thumbnailUrl ? (
                <img src={currentTrack.thumbnailUrl} alt="" className="h-24 w-24 flex-shrink-0 rounded-2xl object-cover" />
              ) : (
                <div className="flex h-24 w-24 flex-shrink-0 items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-300/10 text-x-accent">
                  <NavIcon name="music" className="h-9 w-9" />
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-lg font-black text-x-text">{currentTrack.title}</p>
                <p className="truncate text-sm font-bold text-x-muted">{artistLabel}</p>
                {currentTrack.album && <p className="truncate text-xs text-x-muted">{currentTrack.album}</p>}
                <p className="mt-2 text-xs font-bold uppercase tracking-[0.14em] text-cyan-200/80">Howler + WaveSurfer</p>
              </div>
            </div>

            <div className="music-wave-shell rounded-3xl border border-cyan-300/18 bg-cyan-300/[0.04] px-3 py-2">
              <div ref={waveformRef} className="music-waveform" />
            </div>

            <div className="flex items-center justify-between gap-3 text-xs font-bold text-x-muted">
              <span>{formatTime(position)}</span>
              <span>{ready ? formatTime(duration) : 'Загрузка...'}</span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button type="button" onClick={playPreviousInPlaylist} disabled={!activePlaylistId} className="panel-icon-button disabled:opacity-45" aria-label="Предыдущий трек">
                  <span className="text-sm font-black">{'<<'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => (isPlaying ? pausePlayback() : resumePlayback())}
                  className="flex items-center gap-2 rounded-full border border-cyan-300/35 bg-cyan-300/10 px-4 py-2 text-sm font-black text-x-accent"
                >
                  <NavIcon name={isPlaying ? 'pause' : 'play'} className="h-4 w-4" />
                  <span>{isPlaying ? 'Пауза' : 'Играть'}</span>
                </button>
                <button type="button" onClick={playNextInPlaylist} disabled={!activePlaylistId} className="panel-icon-button disabled:opacity-45" aria-label="Следующий трек">
                  <span className="text-sm font-black">{'>>'}</span>
                </button>
              </div>
              <label className="flex items-center gap-2 text-xs font-bold text-x-muted">
                <span>Громкость</span>
                <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(event) => setVolume(Number(event.target.value))} className="w-28 accent-cyan-300" />
              </label>
            </div>
          </div>
          <div className="border-t border-x-border/70 px-4 py-3 text-xs font-bold text-x-muted">
            Бесплатный стек без YouTube: локальная библиотека Navidrome/OpenSubsonic, движок Howler и волна WaveSurfer.
          </div>
        </div>
        {error && (
          <div className="border-t border-x-border/70 px-3 py-2 text-xs font-semibold text-amber-200">
            {error}
          </div>
        )}
      </div>
      {!isPanelOpen && (
        <button
          type="button"
          onClick={showPanel}
          className="flex max-w-[calc(100vw-32px)] items-center gap-3 rounded-full border border-cyan-300/35 bg-slate-950/92 px-4 py-3 text-left shadow-neon backdrop-blur-xl"
        >
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-300 to-cyan-300 text-slate-950">
            <NavIcon name="music" className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-black text-x-text">{currentTrack.title}</span>
            <span className="block truncate text-xs text-x-muted">{isPlaying ? 'Музыка играет фоном' : 'Музыка поставлена на паузу'}</span>
          </span>
        </button>
      )}
    </div>
  );
}
