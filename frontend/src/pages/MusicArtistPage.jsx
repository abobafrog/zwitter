import { useMemo } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';
import useMusicStore from '../store/musicStore';
import NavIcon from '../components/layout/NavIcon';

function artworkOf(track) {
  return track?.fullArtworkUrl || track?.thumbnailUrl || track?.image || '';
}

function TrackThumbnail({ image, className = 'h-16 w-16 rounded-2xl' }) {
  if (image) {
    return <img src={image} alt="" className={`${className} flex-shrink-0 object-cover`} />;
  }

  return (
    <div className={`${className} flex flex-shrink-0 items-center justify-center border border-cyan-300/20 bg-cyan-300/10 text-x-accent`}>
      <NavIcon name="music" className="h-6 w-6" />
    </div>
  );
}

export default function MusicArtistPage() {
  const navigate = useNavigate();
  const { artistSlug } = useParams();
  const [searchParams] = useSearchParams();
  const artistName = searchParams.get('name') || artistSlug?.replace(/-/g, ' ') || '';
  const { currentTrack, hideExplicit, playTrack, showPanel } = useMusicStore();

  const catalogQuery = useQuery({
    queryKey: ['music-artist-catalog', artistName],
    queryFn: () => api.get('/music/catalog/artist', { params: { name: artistName } }).then((response) => response.data),
    enabled: Boolean(artistName),
    staleTime: 1000 * 60 * 10,
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

  const officialTracks = catalogQuery.data?.tracks || [];
  const albums = catalogQuery.data?.albums || [];
  const artist = catalogQuery.data?.artist || null;

  const mergedTracks = useMemo(() => officialTracks.map((track) => {
    return {
      id: `artist-track-${track.id}`,
      title: track.title,
      artist: track.artist,
      album: track.album,
      duration: track.duration,
      durationSeconds: track.durationMs ? Math.round(track.durationMs / 1000) : 0,
      thumbnailUrl: track.image || '',
      fullArtworkUrl: track.image || '',
      providerLabel: track.previewUrl ? 'Каталог превью' : 'Каталог',
      audioUrl: track.previewUrl || '',
      source: 'catalog',
      previewOnly: Boolean(track.previewUrl),
      explicit: Boolean(track.explicit),
    };
  }).filter((track) => !hideExplicit || !track.explicit), [hideExplicit, officialTracks]);

  const heroTrack = mergedTracks[0] || currentTrack || null;

  const playOrResolve = (track) => {
    if (!track) return;
    if (track.audioUrl) {
      playTrack(track);
      return;
    }
    resolveTrackMutation.mutate({ title: track.title, artist: track.artist });
  };

  return (
    <div className="min-h-full px-4 py-5 sm:px-5">
      <div className="overflow-hidden rounded-[36px] border border-white/10 bg-[radial-gradient(circle_at_20%_18%,rgba(255,255,255,0.2),rgba(255,255,255,0)_26%),linear-gradient(180deg,rgba(255,255,255,0.14),rgba(6,8,18,0.98))] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.32)]">
        <div className="mb-6 flex items-center gap-2">
          <button type="button" onClick={() => navigate('/music')} className="panel-icon-button">
            <NavIcon name="collapseLeft" className="h-4 w-4" />
          </button>
          <Link to="/music" className="text-sm font-bold text-white/65 transition hover:text-white">Назад к музыке</Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <TrackThumbnail image={artworkOf(heroTrack) || artist?.image || ''} className="h-[260px] w-full rounded-[30px]" />
          <div className="flex flex-col justify-center">
            <p className="text-sm font-black uppercase tracking-[0.16em] text-white/54">Исполнитель</p>
            <h1 className="mt-2 text-6xl font-black leading-none text-white">{artist?.name || artistName}</h1>
            <p className="mt-4 text-base text-white/62">
              {mergedTracks.length
                ? `${mergedTracks.length} треков в каталоге`
                : (catalogQuery.isLoading ? 'Собираю каталог по артисту' : 'Каталог пока пуст')}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={!mergedTracks[0] || resolveTrackMutation.isPending}
                onClick={() => mergedTracks[0] && playOrResolve(mergedTracks[0])}
                className="rounded-full bg-yellow-300 px-6 py-3 text-base font-black text-slate-950 disabled:opacity-50"
              >
                {resolveTrackMutation.isPending ? 'Подключаю...' : 'Слушать'}
              </button>
              <button type="button" disabled={!currentTrack} onClick={showPanel} className="rounded-full border border-white/15 bg-white/8 px-6 py-3 text-base font-black text-white disabled:opacity-50">
                Плеер
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-6">
        <section className="rounded-[30px] border border-white/10 bg-slate-950/72 p-5 shadow-panel">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-4xl font-black text-white">Популярные треки</h2>
            <p className="text-sm text-white/55">{mergedTracks.length} найдено</p>
          </div>
          <div className="grid gap-2">
            {mergedTracks.map((track) => (
              <article key={track.id} className="grid items-center gap-4 rounded-[24px] border border-white/10 bg-white/[0.04] px-4 py-3 lg:grid-cols-[72px_minmax(0,1fr)_auto]">
                <TrackThumbnail image={artworkOf(track)} className="h-16 w-16 rounded-[18px]" />
                <button type="button" onClick={() => playOrResolve(track)} className="min-w-0 text-left">
                  <p className="truncate text-lg font-black text-white">{track.title}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="truncate text-sm text-white/58">{track.album || track.artist}</p>
                    {track.explicit && (
                      <span className="rounded-full border border-rose-300/30 bg-rose-300/12 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-rose-100">
                        explicit
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-200/75">{track.providerLabel || 'Музыка'}</p>
                </button>
                <span className="text-sm font-bold text-white/48">{track.duration || '--:--'}</span>
              </article>
            ))}
            {!catalogQuery.isLoading && mergedTracks.length === 0 && <p className="text-sm text-white/58">Для этого артиста пока не удалось собрать каталог.</p>}
          </div>
        </section>

        <section className="rounded-[30px] border border-white/10 bg-slate-950/72 p-5 shadow-panel">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-4xl font-black text-white">Студийные альбомы</h2>
            <p className="text-sm text-white/55">{albums.length} найдено</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
            {albums.map((album) => (
              <article key={album.id} className="text-left">
                <TrackThumbnail image={album.image} className="h-56 w-full rounded-[24px]" />
                <p className="mt-3 text-2xl font-black text-white">{album.title}</p>
                <p className="text-sm text-white/55">{album.artist}</p>
                <p className="text-sm text-white/40">{album.year || '—'}</p>
              </article>
            ))}
            {!catalogQuery.isLoading && albums.length === 0 && <p className="text-sm text-white/58">Альбомы пока не найдены.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
