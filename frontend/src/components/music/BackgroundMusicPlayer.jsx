import { useRef } from 'react';
import useMusicStore from '../../store/musicStore';
import NavIcon from '../layout/NavIcon';

export default function BackgroundMusicPlayer() {
  const { currentTrack, error, isPlaying, isPanelOpen, setError, stop, showPanel, hidePanel } = useMusicStore();
  const audioRef = useRef(null);

  if (!isPlaying || !currentTrack?.audioUrl) return null;

  return (
    <div className={`background-music-player ${isPanelOpen ? 'background-music-player-open' : 'background-music-player-compact'}`}>
      <div className={`overflow-hidden rounded-3xl border border-cyan-300/30 bg-slate-950/95 shadow-[0_0_34px_rgba(34,211,238,0.22)] backdrop-blur-xl ${isPanelOpen ? '' : 'sr-only'}`}>
        <div className="flex items-center justify-between gap-3 border-b border-x-border/70 px-3 py-2">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-x-accent">Фоново играет</p>
            <p className="truncate text-sm font-black text-x-text">{currentTrack.title}</p>
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
        <audio
          key={currentTrack.id}
          ref={audioRef}
          src={currentTrack.audioUrl}
          autoPlay
          controls
          loop
          onCanPlay={() => setError('')}
          onError={() => setError('Не удалось загрузить локальный трек.')}
          className="block w-full bg-slate-950"
        />
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
            <span className="block truncate text-xs text-x-muted">Музыка играет фоном</span>
          </span>
        </button>
      )}
    </div>
  );
}
