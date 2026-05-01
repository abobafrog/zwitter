import { useEffect, useMemo, useRef, useState } from 'react';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;
const PAN_STEP = 72;

export default function PhotoViewer({ src, alt = 'Фото', onClose }) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const viewportRef = useRef(null);
  const zoomPercent = Math.round(zoom * 100);
  const canPan = zoom > 1;

  const presets = useMemo(() => [1, 1.5, 2, 3], []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      if (event.key === '0') {
        resetView();
        return;
      }

      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        changeZoom((value) => value + ZOOM_STEP);
        return;
      }

      if (event.key === '-') {
        event.preventDefault();
        changeZoom((value) => value - ZOOM_STEP);
        return;
      }

      const panKeys = {
        ArrowUp: { x: 0, y: PAN_STEP },
        ArrowDown: { x: 0, y: -PAN_STEP },
        ArrowLeft: { x: PAN_STEP, y: 0 },
        ArrowRight: { x: -PAN_STEP, y: 0 },
      };

      if (panKeys[event.key]) {
        event.preventDefault();
        panImage(panKeys[event.key].x, panKeys[event.key].y);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, zoom]);

  const changeZoom = (nextZoom) => {
    setZoom((current) => {
      const next = clamp(typeof nextZoom === 'function' ? nextZoom(current) : nextZoom, ZOOM_MIN, ZOOM_MAX);
      if (next <= ZOOM_MIN) setOffset({ x: 0, y: 0 });
      return next;
    });
  };

  const resetView = () => {
    setOffset({ x: 0, y: 0 });
    setZoom(1);
  };

  const panImage = (x, y) => {
    if (zoom <= 1) return;
    setOffset((current) => ({
      x: current.x + x,
      y: current.y + y,
    }));
  };

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-slate-950/96 text-white backdrop-blur-xl" role="dialog" aria-modal="true">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-slate-950/70 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-200/70">просмотр фото</p>
          <p className="truncate text-sm text-white/55">{alt}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-2 py-1">
            <button type="button" onClick={() => changeZoom((value) => value - ZOOM_STEP)} className="panel-icon-button text-white" aria-label="Уменьшить">
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M19 13H5v-2h14v2z" /></svg>
            </button>
            <input
              type="range"
              min={ZOOM_MIN}
              max={ZOOM_MAX}
              step={ZOOM_STEP}
              value={zoom}
              onChange={(event) => changeZoom(Number(event.target.value))}
              className="h-2 w-28 accent-cyan-300 sm:w-40"
              aria-label="Масштаб фото"
            />
            <button type="button" onClick={() => changeZoom((value) => value + ZOOM_STEP)} className="panel-icon-button text-white" aria-label="Увеличить">
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" /></svg>
            </button>
            <span className="min-w-14 text-center font-mono text-xs text-white/75">{zoomPercent}%</span>
          </div>
          <button type="button" onClick={resetView} className="panel-icon-button text-white" aria-label="Подогнать фото">
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M4 9V4h5v2H7.41l3.3 3.29-1.42 1.42L6 7.41V9H4zm11-5h5v5h-2V7.41l-3.29 3.3-1.42-1.42L16.59 6H15V4zM4 15h2v1.59l3.29-3.3 1.42 1.42L7.41 18H9v2H4v-5zm14 1.59V15h2v5h-5v-2h1.59l-3.3-3.29 1.42-1.42L18 16.59z" /></svg>
          </button>
          <a href={src} target="_blank" rel="noreferrer" className="panel-icon-button text-white" aria-label="Открыть оригинал">
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3zM5 5h6v2H7v10h10v-4h2v6H5V5z" /></svg>
          </a>
          <button type="button" onClick={onClose} className="panel-icon-button text-white" aria-label="Закрыть">
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M18.3 5.71a1 1 0 00-1.41 0L12 10.59 7.11 5.7A1 1 0 005.7 7.11L10.59 12 5.7 16.89a1 1 0 001.41 1.41L12 13.41l4.89 4.89a1 1 0 001.41-1.41L13.41 12l4.89-4.89a1 1 0 000-1.4z" /></svg>
          </button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4"
        onClick={(event) => {
          if (event.target === viewportRef.current) onClose();
        }}
      >
        <img
          src={src}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full scale-105 object-cover opacity-25 blur-3xl"
        />
        <span className="pointer-events-none absolute inset-0 bg-slate-950/45" />
        <img
          src={src}
          alt={alt}
          className="pointer-events-none relative z-10 h-full w-full select-none object-contain shadow-[0_0_80px_rgba(34,211,238,0.16)]"
          style={{
            transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom})`,
            transition: 'transform 160ms ease',
          }}
        />
        {canPan && (
          <div className="absolute bottom-5 right-5 grid grid-cols-3 gap-2 rounded-3xl border border-cyan-200/20 bg-slate-950/75 p-2 shadow-[0_0_28px_rgba(34,211,238,0.18)] backdrop-blur">
            <span />
            <button type="button" onClick={() => panImage(0, PAN_STEP)} className="panel-icon-button text-white" aria-label="Сдвинуть вверх">
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M7.41 15.41 12 10.83l4.59 4.58L18 14l-6-6-6 6 1.41 1.41z" /></svg>
            </button>
            <span />
            <button type="button" onClick={() => panImage(PAN_STEP, 0)} className="panel-icon-button text-white" aria-label="Сдвинуть влево">
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M15.41 7.41 10.83 12l4.58 4.59L14 18l-6-6 6-6 1.41 1.41z" /></svg>
            </button>
            <button type="button" onClick={() => setOffset({ x: 0, y: 0 })} className="panel-icon-button text-white" aria-label="Центрировать">
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M12 8a4 4 0 100 8 4 4 0 000-8zm8 3h-2.07A6.006 6.006 0 0013 6.07V4h-2v2.07A6.006 6.006 0 006.07 11H4v2h2.07A6.006 6.006 0 0011 17.93V20h2v-2.07A6.006 6.006 0 0017.93 13H20v-2z" /></svg>
            </button>
            <button type="button" onClick={() => panImage(-PAN_STEP, 0)} className="panel-icon-button text-white" aria-label="Сдвинуть вправо">
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" /></svg>
            </button>
            <span />
            <button type="button" onClick={() => panImage(0, -PAN_STEP)} className="panel-icon-button text-white" aria-label="Сдвинуть вниз">
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" /></svg>
            </button>
            <span />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 border-t border-white/10 bg-slate-950/70 px-4 py-2 text-center text-xs text-white/45">
        <span>Масштаб меняется кнопками или клавишами + / -.</span>
        <span>Стрелки двигают фото при увеличении, 0 сбрасывает, Esc закрывает.</span>
        <div className="flex items-center gap-1">
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => changeZoom(preset)}
              className={`rounded-full border px-2 py-1 font-mono text-[11px] transition ${
                zoom === preset
                  ? 'border-cyan-300 bg-cyan-300/15 text-cyan-100'
                  : 'border-white/10 bg-white/5 text-white/55 hover:border-cyan-300/50 hover:text-white'
              }`}
            >
              {Math.round(preset * 100)}%
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
