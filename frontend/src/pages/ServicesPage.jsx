import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import NavIcon from '../components/layout/NavIcon';
import useMusicStore from '../store/musicStore';
import useAuthStore from '../store/authStore';
import api from '../services/api';
import { deleteDraft, loadDrafts, normalizeHashtags, upsertDraft } from '../utils/drafts';

const SERVICE_ORDER_KEY = 'zwitter-services-order-v2';
const SAVED_CITIES_KEY = 'zwitter-weather-cities';
const MUSIC_SERVER_KEY = 'zwitter-music-server';
const FOCUS_KEY = 'zwitter-focus-history';
const CALENDAR_KEY = 'zwitter-calendar-events';

const servicesCatalog = [
  {
    id: 'music',
    title: 'Музыка',
    description: 'Бесплатный музыкальный блок на Navidrome/OpenSubsonic с новым плеером и волной трека.',
    icon: 'music',
    accent: 'from-fuchsia-400 to-cyan-300',
  },
  {
    id: 'notes',
    title: 'Заметки',
    description: 'Быстрые записи, идеи и короткие наброски.',
    icon: 'bookmark',
    accent: 'from-cyan-300 to-blue-500',
  },
  {
    id: 'tasks',
    title: 'Задачи',
    description: 'Личный борд с планами, приоритетами и сроками.',
    icon: 'tasks',
    accent: 'from-violet-300 to-blue-400',
  },
  {
    id: 'weather',
    title: 'Погода',
    description: 'Прогноз по вашему городу и сохранённым местам.',
    icon: 'compass',
    accent: 'from-sky-300 to-emerald-300',
  },
  {
    id: 'focus',
    title: 'Фокус',
    description: 'Помодоро-таймер для рабочих спринтов и коротких перерывов.',
    icon: 'plus',
    accent: 'from-amber-300 to-fuchsia-300',
  },
  {
    id: 'calendar',
    title: 'Календарь',
    description: 'Личные события, напоминания и встречи внутри одного небольшого планировщика.',
    icon: 'bell',
    accent: 'from-emerald-300 to-cyan-300',
  },
];

const defaultMusicServer = {
  serverUrl: 'http://localhost:4533',
  username: '',
  password: '',
};

const moveItem = (items, fromId, toId) => {
  if (fromId === toId) return items;
  const next = [...items];
  const fromIndex = next.findIndex((item) => item.id === fromId);
  const toIndex = next.findIndex((item) => item.id === toId);
  if (fromIndex === -1 || toIndex === -1) return items;
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
};

const readJson = (key, fallback) => {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

const loadDockOrder = () => readJson(SERVICE_ORDER_KEY, servicesCatalog.map((service) => service.id));
const saveDockOrder = (items) => localStorage.setItem(SERVICE_ORDER_KEY, JSON.stringify(items.map((item) => item.id)));
const loadSavedCities = () => {
  const cities = readJson(SAVED_CITIES_KEY, ['Москва']);
  return Array.isArray(cities) && cities.length ? cities : ['Москва'];
};
const loadMusicServer = () => ({ ...defaultMusicServer, ...readJson(MUSIC_SERVER_KEY, defaultMusicServer) });
const focusStorageKey = (userId) => `${FOCUS_KEY}-${userId || 'guest'}`;
const calendarStorageKey = (userId) => `${CALENDAR_KEY}-${userId || 'guest'}`;

function WeatherIcon({ code, className = 'h-12 w-12' }) {
  const type = code === 0
    ? 'sun'
    : [80, 81, 82, 95, 96, 99].includes(code)
      ? 'storm'
      : [61, 63, 65].includes(code)
        ? 'rain'
        : [71, 73, 75, 77, 85, 86].includes(code)
          ? 'snow'
          : [45, 48].includes(code)
            ? 'fog'
            : 'cloud';

  return (
    <svg viewBox="0 0 64 64" className={`${className} text-x-accent`} aria-hidden="true">
      {type === 'sun' && (
        <>
          <circle cx="32" cy="32" r="13" fill="currentColor" />
          <path d="M32 5v10M32 49v10M5 32h10M49 32h10M13 13l7 7M44 44l7 7M51 13l-7 7M20 44l-7 7" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
        </>
      )}
      {type !== 'sun' && (
        <path d="M22 43h25a12 12 0 10-3.5-23.5A17 17 0 0011 28a10 10 0 0011 15z" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {type === 'rain' && <path d="M22 50l-4 8M34 50l-4 8M46 50l-4 8" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />}
      {type === 'storm' && (
        <>
          <path d="M24 50l-4 8M45 50l-4 8" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
          <path d="M35 45l-7 11h7l-4 8 11-13h-7l4-6z" fill="currentColor" />
        </>
      )}
      {type === 'snow' && <path d="M22 53h.1M34 55h.1M46 53h.1" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />}
      {type === 'fog' && <path d="M14 50h36M20 57h28" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />}
    </svg>
  );
}

function ServiceDock({ services, activeId, onSelect, onReorder }) {
  const [draggingId, setDraggingId] = useState(null);

  return (
    <div className="sticky top-3 z-20 overflow-x-auto rounded-3xl border border-x-border/70 bg-x-panel/65 p-2 shadow-panel backdrop-blur-xl">
      <div className="flex min-w-max items-center gap-2">
        {services.map((service) => (
          <button
            key={service.id}
            type="button"
            draggable
            onDragStart={() => setDraggingId(service.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (draggingId) onReorder(draggingId, service.id);
              setDraggingId(null);
            }}
            onDragEnd={() => setDraggingId(null)}
            onClick={() => onSelect(service.id)}
            className={`flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-black transition ${
              service.id === activeId
                ? 'bg-cyan-300/12 text-x-accent shadow-neon'
                : 'text-x-muted hover:bg-cyan-300/10 hover:text-x-text'
            }`}
          >
            <span className={`flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br ${service.accent} text-slate-950`}>
              <NavIcon name={service.icon} className="h-4 w-4" />
            </span>
            <span>{service.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MusicPanel() {
  const [query, setQuery] = useState('Lady Gaga');
  const [musicServer, setMusicServer] = useState(loadMusicServer);
  const [selectedTrackId, setSelectedTrackId] = useState('');
  const [playlistName, setPlaylistName] = useState('');
  const [selectedPlaylistId, setSelectedPlaylistId] = useState('');
  const {
    playTrack,
    currentTrack,
    isPlaying,
    playlists,
    activePlaylistId,
    createPlaylist,
    deletePlaylist,
    addToPlaylist,
    removeFromPlaylist,
    playPlaylist,
  } = useMusicStore();

  const musicReady = Boolean(musicServer.serverUrl.trim() && musicServer.username.trim() && musicServer.password);
  const tracksQuery = useQuery({
    queryKey: ['subsonic-music', query, musicServer.serverUrl, musicServer.username],
    queryFn: () => api.post('/music/subsonic/search', {
      q: query,
      serverUrl: musicServer.serverUrl.trim(),
      username: musicServer.username.trim(),
      password: musicServer.password,
    }).then((response) => response.data),
    enabled: musicReady,
    staleTime: 1000 * 60 * 10,
  });

  const tracks = (tracksQuery.data?.tracks || []).map((track) => ({
    ...track,
    year: track.artist || track.channelTitle || 'OpenSubsonic',
  }));
  const selectedTrack = tracks.find((track) => track.id === selectedTrackId) || tracks[0];

  useEffect(() => {
    if (!selectedTrackId && tracks[0]?.id) setSelectedTrackId(tracks[0].id);
  }, [selectedTrackId, tracks]);

  useEffect(() => {
    if (!selectedPlaylistId && playlists[0]?.id) setSelectedPlaylistId(playlists[0].id);
  }, [playlists, selectedPlaylistId]);

  const updateMusicServer = (field, value) => {
    setMusicServer((current) => ({ ...current, [field]: value }));
  };

  const saveMusicServer = () => {
    localStorage.setItem(MUSIC_SERVER_KEY, JSON.stringify(musicServer));
    if (musicReady) tracksQuery.refetch();
  };

  return (
    <section className="rounded-3xl border border-cyan-300/25 bg-x-panel/55 p-4 shadow-panel">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="nebula-section-heading">music</p>
          <h2 className="text-2xl font-black text-x-text">Фоновая музыка</h2>
          <p className="mt-1 text-sm text-x-muted">Поиск по Navidrome/OpenSubsonic и запуск через новый плеер на Howler и WaveSurfer.</p>
        </div>
        <a href="http://localhost:4533" target="_blank" rel="noreferrer" className="btn-outline inline-flex justify-center px-4 py-2 text-sm">
          Открыть Navidrome
        </a>
      </div>

      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_180px_180px_auto]">
        <input value={musicServer.serverUrl} onChange={(event) => updateMusicServer('serverUrl', event.target.value)} className="input-field" placeholder="http://localhost:4533" />
        <input value={musicServer.username} onChange={(event) => updateMusicServer('username', event.target.value)} className="input-field" placeholder="Логин" />
        <input value={musicServer.password} onChange={(event) => updateMusicServer('password', event.target.value)} type="password" className="input-field" placeholder="Пароль" />
        <button type="button" onClick={saveMusicServer} className="btn-outline px-4 py-2 text-sm">Сохранить</button>
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && musicReady) tracksQuery.refetch();
          }}
          className="input-field"
          placeholder="Найти музыку..."
        />
        <button type="button" disabled={!musicReady} onClick={() => tracksQuery.refetch()} className="btn-accent px-5 py-2 text-sm disabled:opacity-50">
          Найти
        </button>
      </div>

      <div className="mt-4 rounded-3xl border border-x-border bg-slate-950/70 p-4">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-x-muted">Текущий трек</p>
        <p className="mt-1 truncate text-xl font-black text-x-text">{selectedTrack?.title || currentTrack?.title || 'Трек не выбран'}</p>
        <p className="text-sm text-x-muted">{selectedTrack?.artist || currentTrack?.artist || 'Музыка появится после поиска'}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={!selectedTrack} onClick={() => playTrack(selectedTrack)} className="btn-accent px-4 py-2 text-sm disabled:opacity-50">
            {isPlaying && currentTrack?.id === selectedTrack?.id ? 'Играет' : 'Слушать'}
          </button>
          {!musicReady && <span className="text-xs font-bold text-amber-200">Чтобы включить сервис, укажите адрес, логин и пароль.</span>}
        </div>
      </div>

      <div className="mt-4 rounded-3xl border border-x-border bg-slate-950/55 p-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-x-muted">Плейлисты</p>
            <p className="text-sm text-x-muted">Собери свои подборки и запускай их из dock.</p>
          </div>
          <div className="flex gap-2">
            <input value={playlistName} onChange={(event) => setPlaylistName(event.target.value)} className="input-field py-2 text-sm" placeholder="Название плейлиста" />
            <button
              type="button"
              onClick={() => {
                const id = createPlaylist(playlistName);
                setPlaylistName('');
                setSelectedPlaylistId(id);
              }}
              className="btn-outline px-4 py-2 text-sm"
            >
              Создать
            </button>
          </div>
        </div>

        {playlists.length > 0 && (
          <div className="mt-3 flex flex-col gap-2 lg:flex-row">
            <select value={selectedPlaylistId} onChange={(event) => setSelectedPlaylistId(event.target.value)} className="input-field py-2 text-sm">
              {playlists.map((playlist) => <option key={playlist.id} value={playlist.id}>{playlist.name}</option>)}
            </select>
            <button type="button" disabled={!selectedTrack || !selectedPlaylistId} onClick={() => addToPlaylist(selectedPlaylistId, selectedTrack)} className="btn-outline px-4 py-2 text-sm disabled:opacity-50">
              Добавить выбранный трек
            </button>
          </div>
        )}

        <div className="mt-3 grid gap-2 lg:grid-cols-2">
          {playlists.map((playlist) => (
            <article key={playlist.id} className={`rounded-2xl border p-3 ${activePlaylistId === playlist.id ? 'border-cyan-300/60 bg-cyan-300/10' : 'border-x-border bg-x-bg/45'}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-black text-x-text">{playlist.name}</p>
                  <p className="text-xs text-x-muted">{playlist.tracks.length} треков</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" disabled={playlist.tracks.length === 0} onClick={() => playPlaylist(playlist.id)} className="rounded-full border border-cyan-300/35 px-3 py-1 text-xs font-black text-x-accent disabled:opacity-50">
                    Старт
                  </button>
                  <button type="button" onClick={() => deletePlaylist(playlist.id)} className="rounded-full border border-red-400/35 px-3 py-1 text-xs font-black text-red-300">
                    Удалить
                  </button>
                </div>
              </div>
              <div className="mt-2 grid gap-1">
                {playlist.tracks.map((track, index) => (
                  <div key={`${playlist.id}-${track.id}-${index}`} className="flex items-center justify-between gap-2 rounded-xl bg-slate-950/45 px-3 py-2 text-xs">
                    <button type="button" onClick={() => playPlaylist(playlist.id, index)} className="truncate text-left font-bold text-x-muted hover:text-x-text">
                      {track.title}
                    </button>
                    <button type="button" onClick={() => removeFromPlaylist(playlist.id, track.id)} className="font-black text-red-300">
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </article>
          ))}
          {playlists.length === 0 && <p className="text-sm text-x-muted">Плейлистов пока нет.</p>}
        </div>
      </div>

      <div className="mt-4 grid gap-2 lg:grid-cols-2">
        {tracksQuery.isLoading && <p className="text-sm text-x-muted">Ищу треки...</p>}
        {tracks.map((track) => (
          <button
            key={track.id}
            type="button"
            onClick={() => {
              setSelectedTrackId(track.id);
              playTrack(track);
            }}
            className={`flex items-center justify-between gap-3 overflow-hidden rounded-2xl border px-4 py-3 text-left transition ${
              selectedTrack?.id === track.id
                ? 'border-cyan-300/60 bg-cyan-300/12 text-x-text shadow-neon'
                : 'border-x-border bg-x-bg/55 text-x-muted hover:border-cyan-300/45 hover:text-x-text'
            }`}
          >
            <span className="min-w-0">
              <span className="block truncate font-black">{track.title}</span>
              <span className="block truncate text-xs text-x-muted">{track.artist || track.channelTitle}</span>
            </span>
            {track.thumbnailUrl && <img src={track.thumbnailUrl} alt="" className="h-12 w-16 flex-shrink-0 rounded-xl object-cover" />}
          </button>
        ))}
      </div>
    </section>
  );
}

function NotesPanel() {
  const qc = useQueryClient();
  const [noteDraft, setNoteDraft] = useState('');
  const [noteColor, setNoteColor] = useState('cyan');
  const [editingNote, setEditingNote] = useState(null);
  const [showNoteHistory, setShowNoteHistory] = useState(false);

  const notesQuery = useQuery({
    queryKey: ['quick-notes'],
    queryFn: () => api.get('/services/notes').then((response) => response.data.notes),
  });
  const noteHistoryQuery = useQuery({
    queryKey: ['quick-notes-history'],
    queryFn: () => api.get('/services/notes/history').then((response) => response.data.history),
    enabled: showNoteHistory,
  });
  const createNoteMutation = useMutation({
    mutationFn: () => api.post('/services/notes', { content: noteDraft, color: noteColor }),
    onSuccess: () => {
      setNoteDraft('');
      qc.invalidateQueries({ queryKey: ['quick-notes'] });
    },
  });
  const updateNoteMutation = useMutation({
    mutationFn: ({ id, data }) => api.patch(`/services/notes/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quick-notes'] }),
  });
  const deleteNoteMutation = useMutation({
    mutationFn: (id) => api.delete(`/services/notes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quick-notes'] }),
  });

  const notes = notesQuery.data || [];
  const colorClasses = {
    cyan: 'border-cyan-300/35 bg-cyan-300/10',
    violet: 'border-violet-300/35 bg-violet-300/10',
    emerald: 'border-emerald-300/35 bg-emerald-300/10',
    amber: 'border-amber-300/35 bg-amber-300/10',
    rose: 'border-rose-300/35 bg-rose-300/10',
  };

  return (
    <section className="rounded-3xl border border-cyan-300/25 bg-x-panel/55 p-4 shadow-panel">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="nebula-section-heading">notes</p>
          <h2 className="text-2xl font-black text-x-text">Быстрые заметки</h2>
        </div>
        <button type="button" onClick={() => setShowNoteHistory(true)} className="btn-outline px-4 py-2 text-sm">История</button>
      </div>

      <div className="rounded-3xl border border-x-border bg-slate-950/70 p-4">
        <textarea
          value={noteDraft}
          onChange={(event) => setNoteDraft(event.target.value)}
          className="input-field min-h-28 resize-none"
          placeholder="Идея, план, короткая заметка..."
          maxLength={1000}
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            {Object.keys(colorClasses).map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setNoteColor(color)}
                className={`h-8 w-8 rounded-full border ${colorClasses[color]} ${noteColor === color ? 'ring-2 ring-x-accent' : ''}`}
                aria-label={`Цвет ${color}`}
              />
            ))}
          </div>
          <button type="button" disabled={!noteDraft.trim() || createNoteMutation.isPending} onClick={() => createNoteMutation.mutate()} className="btn-accent px-5 py-2 text-sm disabled:opacity-50">
            Сохранить
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {notes.map((note) => {
          const isEditing = editingNote?.id === note.id;
          const currentColor = isEditing ? editingNote.color : note.color;
          return (
            <article key={note.id} className={`rounded-3xl border p-4 ${colorClasses[currentColor] || colorClasses.cyan}`}>
              {isEditing ? (
                <>
                  <textarea
                    value={editingNote.content}
                    onChange={(event) => setEditingNote((current) => ({ ...current, content: event.target.value }))}
                    className="input-field min-h-32 resize-none"
                    maxLength={1000}
                    autoFocus
                  />
                  <div className="mt-3 flex gap-2">
                    {Object.keys(colorClasses).map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setEditingNote((current) => ({ ...current, color }))}
                        className={`h-8 w-8 rounded-full border ${colorClasses[color]} ${editingNote.color === color ? 'ring-2 ring-x-accent' : ''}`}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-x-text">{note.content}</p>
              )}
              <div className="mt-4 flex flex-wrap justify-between gap-2">
                {isEditing ? (
                  <>
                    <button type="button" onClick={() => setEditingNote(null)} className="rounded-full border border-x-border px-3 py-1 text-xs font-black text-x-muted">Отмена</button>
                    <button
                      type="button"
                      disabled={!editingNote.content.trim() || updateNoteMutation.isPending}
                      onClick={() => updateNoteMutation.mutate({ id: note.id, data: { content: editingNote.content.trim(), color: editingNote.color } }, { onSuccess: () => setEditingNote(null) })}
                      className="rounded-full border border-cyan-300/45 bg-cyan-300/10 px-3 py-1 text-xs font-black text-x-accent disabled:opacity-50"
                    >
                      Сохранить
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => updateNoteMutation.mutate({ id: note.id, data: { pinned: !note.pinned } })} className="rounded-full border border-x-border px-3 py-1 text-xs font-black text-x-muted">
                      {note.pinned ? 'Открепить' : 'Закрепить'}
                    </button>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setEditingNote({ id: note.id, content: note.content, color: note.color || 'cyan' })} className="rounded-full border border-x-border px-3 py-1 text-xs font-black text-x-muted">Изменить</button>
                      <button type="button" onClick={() => deleteNoteMutation.mutate(note.id)} className="rounded-full border border-red-400/30 px-3 py-1 text-xs font-black text-red-300">Удалить</button>
                    </div>
                  </>
                )}
              </div>
            </article>
          );
        })}
        {!notesQuery.isLoading && notes.length === 0 && <p className="text-sm text-x-muted">Пока пусто. Первая заметка появится здесь.</p>}
      </div>

      {showNoteHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-x-bg/75 p-4 backdrop-blur-md">
          <div className="cosmic-panel max-h-[86vh] w-full max-w-2xl overflow-hidden rounded-3xl">
            <div className="flex items-center justify-between border-b border-x-border px-4 py-3">
              <div>
                <p className="nebula-section-heading">notes history</p>
                <h3 className="text-lg font-black text-x-text">История заметок</h3>
              </div>
              <button type="button" onClick={() => setShowNoteHistory(false)} className="panel-icon-button">
                <NavIcon name="close" className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[calc(86vh-70px)] overflow-y-auto p-4">
              {noteHistoryQuery.isLoading && <p className="text-sm text-x-muted">Загружаю историю...</p>}
              {(noteHistoryQuery.data || []).map((item) => (
                <div key={item.id} className="mb-2 rounded-2xl border border-x-border bg-x-bg/55 p-3 last:mb-0">
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-x-muted">{new Date(item.createdAt).toLocaleString('ru-RU')}</p>
                  <p className="mt-1 text-sm font-bold text-x-text">{item.summary}</p>
                  <p className="mt-1 truncate text-xs text-x-muted">{item.note?.content || 'Заметка удалена'}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function TasksPanel() {
  const qc = useQueryClient();
  const [taskDraft, setTaskDraft] = useState({ title: '', details: '', priority: 'normal', dueDate: '' });
  const [editingTask, setEditingTask] = useState(null);

  const tasksQuery = useQuery({
    queryKey: ['service-tasks'],
    queryFn: () => api.get('/services/tasks').then((response) => response.data.tasks),
  });
  const createTaskMutation = useMutation({
    mutationFn: () => api.post('/services/tasks', taskDraft),
    onSuccess: () => {
      setTaskDraft({ title: '', details: '', priority: 'normal', dueDate: '' });
      qc.invalidateQueries({ queryKey: ['service-tasks'] });
    },
  });
  const updateTaskMutation = useMutation({
    mutationFn: ({ id, data }) => api.patch(`/services/tasks/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-tasks'] }),
  });
  const deleteTaskMutation = useMutation({
    mutationFn: (id) => api.delete(`/services/tasks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-tasks'] }),
  });

  const tasks = tasksQuery.data || [];
  const columns = [['todo', 'Запланировать'], ['doing', 'В работе'], ['done', 'Готово']];
  const priorityLabels = { low: 'Низкий', normal: 'Обычный', high: 'Высокий' };

  return (
    <section className="rounded-3xl border border-violet-300/25 bg-x-panel/55 p-4 shadow-panel">
      <div className="mb-4">
        <p className="nebula-section-heading">tasks</p>
        <h2 className="text-2xl font-black text-x-text">Задачи</h2>
      </div>

      <div className="rounded-3xl border border-x-border bg-slate-950/70 p-4">
        <input value={taskDraft.title} onChange={(event) => setTaskDraft((current) => ({ ...current, title: event.target.value }))} className="input-field" placeholder="Новая задача" maxLength={160} />
        <textarea value={taskDraft.details} onChange={(event) => setTaskDraft((current) => ({ ...current, details: event.target.value }))} className="input-field mt-3 min-h-20 resize-none" placeholder="Детали..." maxLength={1000} />
        <div className="mt-3 grid gap-2 lg:grid-cols-[1fr_1fr_auto]">
          <select value={taskDraft.priority} onChange={(event) => setTaskDraft((current) => ({ ...current, priority: event.target.value }))} className="input-field">
            <option value="low">Низкий приоритет</option>
            <option value="normal">Обычный приоритет</option>
            <option value="high">Высокий приоритет</option>
          </select>
          <input type="date" value={taskDraft.dueDate} onChange={(event) => setTaskDraft((current) => ({ ...current, dueDate: event.target.value }))} className="input-field" />
          <button type="button" disabled={!taskDraft.title.trim() || createTaskMutation.isPending} onClick={() => createTaskMutation.mutate()} className="btn-accent px-5 py-2 text-sm disabled:opacity-50">
            Сохранить
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {columns.map(([status, title]) => (
          <div key={status} className="rounded-3xl border border-x-border bg-x-bg/45 p-3">
            <h3 className="mb-3 text-sm font-black uppercase tracking-[0.14em] text-x-muted">{title}</h3>
            <div className="grid gap-2">
              {tasks.filter((task) => task.status === status).map((task) => {
                const isEditing = editingTask?.id === task.id;
                return (
                  <article key={task.id} className="rounded-2xl border border-x-border bg-slate-950/55 p-3">
                    {isEditing ? (
                      <>
                        <input value={editingTask.title} onChange={(event) => setEditingTask((current) => ({ ...current, title: event.target.value }))} className="input-field" />
                        <textarea value={editingTask.details || ''} onChange={(event) => setEditingTask((current) => ({ ...current, details: event.target.value }))} className="input-field mt-2 min-h-20 resize-none" />
                        <div className="mt-2 grid gap-2">
                          <select value={editingTask.status} onChange={(event) => setEditingTask((current) => ({ ...current, status: event.target.value }))} className="input-field">
                            {columns.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                          </select>
                          <select value={editingTask.priority} onChange={(event) => setEditingTask((current) => ({ ...current, priority: event.target.value }))} className="input-field">
                            <option value="low">Низкий</option>
                            <option value="normal">Обычный</option>
                            <option value="high">Высокий</option>
                          </select>
                        </div>
                        <div className="mt-3 flex gap-2">
                          <button type="button" onClick={() => setEditingTask(null)} className="btn-outline px-3 py-1 text-xs">Отмена</button>
                          <button type="button" onClick={() => updateTaskMutation.mutate({ id: task.id, data: editingTask }, { onSuccess: () => setEditingTask(null) })} className="btn-accent px-3 py-1 text-xs">Сохранить</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="font-black text-x-text">{task.title}</p>
                        {task.details && <p className="mt-1 whitespace-pre-wrap text-sm text-x-muted">{task.details}</p>}
                        <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-x-muted">
                          <span className="rounded-full border border-x-border px-2 py-0.5">Приоритет: {priorityLabels[task.priority]}</span>
                          {task.dueDate && <span className="rounded-full border border-x-border px-2 py-0.5">Срок: {new Date(task.dueDate).toLocaleDateString('ru-RU')}</span>}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {columns.filter(([value]) => value !== task.status).map(([value, label]) => (
                            <button key={value} type="button" onClick={() => updateTaskMutation.mutate({ id: task.id, data: { status: value } })} className="rounded-full border border-x-border px-3 py-1 text-xs font-black text-x-muted">
                              {label}
                            </button>
                          ))}
                          <button type="button" onClick={() => setEditingTask({ ...task, dueDate: task.dueDate?.slice(0, 10) || '' })} className="rounded-full border border-x-border px-3 py-1 text-xs font-black text-x-muted">Изменить</button>
                          <button type="button" onClick={() => deleteTaskMutation.mutate(task.id)} className="rounded-full border border-red-400/30 px-3 py-1 text-xs font-black text-red-300">Удалить</button>
                        </div>
                      </>
                    )}
                  </article>
                );
              })}
              {!tasksQuery.isLoading && tasks.filter((task) => task.status === status).length === 0 && <p className="rounded-2xl border border-dashed border-x-border p-3 text-sm text-x-muted">Пусто</p>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function WeatherPanel() {
  const [weatherCity, setWeatherCity] = useState('Москва');
  const [weatherCoords, setWeatherCoords] = useState(null);
  const [savedCities, setSavedCities] = useState(loadSavedCities);

  const weatherQuery = useQuery({
    queryKey: ['service-weather', weatherCity, weatherCoords?.lat, weatherCoords?.lon],
    queryFn: () => {
      const params = weatherCoords ? { lat: weatherCoords.lat, lon: weatherCoords.lon } : { city: weatherCity };
      return api.get('/services/weather', { params }).then((response) => response.data);
    },
    staleTime: 1000 * 60 * 10,
  });

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => setWeatherCoords({ lat: position.coords.latitude, lon: position.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 1000 * 60 * 20 }
    );
  }, []);

  const saveCity = () => {
    const city = weatherCity.trim();
    if (!city || savedCities.includes(city)) return;
    const next = [...savedCities, city];
    setSavedCities(next);
    localStorage.setItem(SAVED_CITIES_KEY, JSON.stringify(next));
  };

  const weather = weatherQuery.data;
  return (
    <section className="rounded-3xl border border-sky-300/25 bg-x-panel/55 p-4 shadow-panel">
      <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,520px)] lg:items-end">
        <div>
          <p className="nebula-section-heading">weather</p>
          <h2 className="text-2xl font-black text-x-text">Погода</h2>
          <p className="mt-1 text-sm text-x-muted">Прогноз по текущему месту или по выбранному городу.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <input value={weatherCity} onChange={(event) => { setWeatherCoords(null); setWeatherCity(event.target.value); }} onKeyDown={(event) => event.key === 'Enter' && weatherQuery.refetch()} className="input-field" placeholder="Город" />
          <button type="button" onClick={() => weatherQuery.refetch()} className="btn-outline px-4 py-2 text-sm">Обновить</button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={saveCity} className="btn-outline px-4 py-2 text-sm">Сохранить город</button>
        {savedCities.map((city) => (
          <button key={city} type="button" onClick={() => { setWeatherCoords(null); setWeatherCity(city); }} className={`rounded-full border px-3 py-1 text-xs font-black ${!weatherCoords && weatherCity === city ? 'border-cyan-300/45 text-x-accent' : 'border-x-border text-x-muted'}`}>
            {city}
          </button>
        ))}
      </div>

      {weatherQuery.isLoading && <p className="text-sm text-x-muted">Смотрю прогноз...</p>}
      {weatherQuery.error && <p className="text-sm font-bold text-red-300">Город не найден или сервис временно недоступен.</p>}
      {weather && (
        <div className="grid gap-3 xl:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.1fr)]">
          <div className="rounded-3xl border border-cyan-300/25 bg-slate-950/70 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-x-muted">{[weather.city, weather.country].filter(Boolean).join(', ')}</p>
                <p className="mt-2 text-6xl font-black text-x-text">{weather.current.temperature}°</p>
                <p className="mt-2 text-lg font-black text-x-accent">{weather.current.label}</p>
              </div>
              <WeatherIcon code={weather.current.code} className="h-20 w-20 flex-shrink-0 opacity-90" />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
              <div><p className="text-x-muted">Ощущается</p><p className="font-black">{weather.current.feelsLike}°</p></div>
              <div><p className="text-x-muted">Влажность</p><p className="font-black">{weather.current.humidity}%</p></div>
              <div><p className="text-x-muted">Ветер</p><p className="font-black">{weather.current.windSpeed} км/ч</p></div>
            </div>
          </div>
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(148px,1fr))]">
            {weather.daily.map((day) => (
              <div key={day.day} className="rounded-2xl border border-x-border bg-x-bg/55 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-x-muted">{new Date(day.day).toLocaleDateString('ru-RU', { weekday: 'short' })}</p>
                  <WeatherIcon code={day.code} className="h-9 w-9 flex-shrink-0 opacity-85" />
                </div>
                <p className="mt-2 min-h-10 break-words text-sm font-bold leading-tight text-x-text">{day.label}</p>
                <p className="mt-3 text-lg font-black text-x-text">{day.max}°</p>
                <p className="text-sm text-x-muted">{day.min}°</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function DraftsPanel() {
  const { user } = useAuthStore();
  const [serviceDraftText, setServiceDraftText] = useState('');
  const [serviceDrafts, setServiceDrafts] = useState(() => loadDrafts(user?.id));

  const refreshDrafts = () => setServiceDrafts(loadDrafts(user?.id));

  useEffect(() => {
    refreshDrafts();
    window.addEventListener('zwitter:drafts-changed', refreshDrafts);
    return () => window.removeEventListener('zwitter:drafts-changed', refreshDrafts);
  }, [user?.id]);

  return (
    <section className="rounded-3xl border border-fuchsia-300/25 bg-x-panel/55 p-4 shadow-panel">
      <div className="mb-4">
        <p className="nebula-section-heading">drafts</p>
        <h2 className="text-2xl font-black text-x-text">Черновики</h2>
        <p className="mt-1 text-sm text-x-muted">Быстрая точка для набросков постов и служебных заметок.</p>
      </div>

      <div className="rounded-3xl border border-x-border bg-slate-950/70 p-4">
        <textarea value={serviceDraftText} onChange={(event) => setServiceDraftText(event.target.value)} className="input-field min-h-28 resize-none" placeholder="Набросок будущего поста..." maxLength={500} />
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-xs text-x-muted">{serviceDraftText.length}/500</span>
          <button
            type="button"
            onClick={() => {
              if (!serviceDraftText.trim()) return;
              upsertDraft(user?.id, {
                id: `service:${Date.now()}`,
                title: 'Черновик из dock',
                type: 'tweet',
                content: normalizeHashtags(serviceDraftText),
                sourcePath: '/services',
              });
              setServiceDraftText('');
              refreshDrafts();
            }}
            className="btn-accent px-5 py-2 text-sm"
          >
            Сохранить черновик
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        {serviceDrafts.map((draft) => (
          <article key={draft.id} className="rounded-2xl border border-x-border bg-x-bg/55 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-black text-x-text">{draft.title}</p>
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-sm text-x-muted">{draft.content}</p>
              </div>
              <button type="button" onClick={() => { deleteDraft(user?.id, draft.id); refreshDrafts(); }} className="rounded-full border border-red-400/30 px-3 py-1 text-xs font-black text-red-300">
                Удалить
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(draft.tags || []).map((tag) => (
                <span key={tag} className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2 py-1 text-xs font-black text-x-accent">
                  {tag}
                </span>
              ))}
            </div>
          </article>
        ))}
        {serviceDrafts.length === 0 && <p className="text-sm text-x-muted">Черновиков пока нет.</p>}
      </div>
    </section>
  );
}

function FocusPanel() {
  const { user } = useAuthStore();
  const [minutes, setMinutes] = useState(25);
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [mode, setMode] = useState('focus');
  const [history, setHistory] = useState(() => readJson(focusStorageKey(user?.id), []));

  useEffect(() => {
    setHistory(readJson(focusStorageKey(user?.id), []));
  }, [user?.id]);

  useEffect(() => {
    if (!isRunning) return undefined;
    const interval = window.setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          window.clearInterval(interval);
          setIsRunning(false);
          const finishedMode = mode;
          const nextHistory = [{
            id: `focus-${Date.now()}`,
            mode: finishedMode,
            minutes,
            finishedAt: new Date().toISOString(),
          }, ...history].slice(0, 12);
          setHistory(nextHistory);
          localStorage.setItem(focusStorageKey(user?.id), JSON.stringify(nextHistory));
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [history, isRunning, minutes, mode, user?.id]);

  const total = Math.max(minutes * 60, 1);
  const progress = Math.max(0, Math.min(100, Math.round((secondsLeft / total) * 100)));
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  return (
    <section className="rounded-3xl border border-amber-300/25 bg-x-panel/55 p-4 shadow-panel">
      <div className="mb-4">
        <p className="nebula-section-heading">focus</p>
        <h2 className="text-2xl font-black text-x-text">Фокус-сессия</h2>
        <p className="mt-1 text-sm text-x-muted">Таймер для рабочих спринтов и коротких пауз прямо внутри Zwiteer.</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.2fr)]">
        <div className="rounded-3xl border border-x-border bg-slate-950/70 p-5">
          <div className="flex items-center gap-2">
            {[
              ['focus', 'Фокус'],
              ['break', 'Перерыв'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setMode(value);
                  const nextMinutes = value === 'focus' ? 25 : 5;
                  setMinutes(nextMinutes);
                  setSecondsLeft(nextMinutes * 60);
                  setIsRunning(false);
                }}
                className={`rounded-full border px-4 py-2 text-sm font-black ${mode === value ? 'border-cyan-300/45 bg-cyan-300/10 text-x-accent' : 'border-x-border text-x-muted'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-6 text-6xl font-black text-x-text">{mm}:{ss}</p>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-x-bg/70">
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-blue-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => setIsRunning((current) => !current)} className="btn-accent px-4 py-2 text-sm">
              {isRunning ? 'Пауза' : 'Старт'}
            </button>
            <button type="button" onClick={() => { setIsRunning(false); setSecondsLeft(minutes * 60); }} className="btn-outline px-4 py-2 text-sm">
              Сброс
            </button>
          </div>
          <div className="mt-4">
            <label className="settings-label">Длительность</label>
            <input type="range" min="5" max="60" step="5" value={minutes} onChange={(event) => {
              const nextMinutes = Number(event.target.value);
              setMinutes(nextMinutes);
              setSecondsLeft(nextMinutes * 60);
              setIsRunning(false);
            }} className="mt-2 w-full accent-cyan-300" />
            <p className="mt-1 text-sm text-x-muted">{minutes} минут</p>
          </div>
        </div>

        <div className="rounded-3xl border border-x-border bg-x-bg/45 p-4">
          <h3 className="text-sm font-black uppercase tracking-[0.14em] text-x-muted">Последние сессии</h3>
          <div className="mt-3 grid gap-2">
            {history.map((item) => (
              <div key={item.id} className="rounded-2xl border border-x-border bg-slate-950/45 px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-black text-x-text">{item.mode === 'focus' ? 'Фокус' : 'Перерыв'} · {item.minutes} мин</p>
                  <span className="text-xs text-x-muted">{new Date(item.finishedAt).toLocaleString('ru-RU')}</span>
                </div>
              </div>
            ))}
            {history.length === 0 && <p className="text-sm text-x-muted">История появится после первой завершённой сессии.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

function CalendarPanel() {
  const { user } = useAuthStore();
  const [eventDraft, setEventDraft] = useState({ title: '', date: '', time: '', note: '' });
  const [events, setEvents] = useState(() => readJson(calendarStorageKey(user?.id), []));

  useEffect(() => {
    setEvents(readJson(calendarStorageKey(user?.id), []));
  }, [user?.id]);

  const saveEvents = (next) => {
    setEvents(next);
    localStorage.setItem(calendarStorageKey(user?.id), JSON.stringify(next));
  };

  const addEvent = () => {
    if (!eventDraft.title.trim() || !eventDraft.date) return;
    const next = [{
      id: `event-${Date.now()}`,
      title: eventDraft.title.trim(),
      date: eventDraft.date,
      time: eventDraft.time,
      note: eventDraft.note.trim(),
      createdAt: new Date().toISOString(),
    }, ...events].sort((a, b) => `${a.date} ${a.time || '00:00'}`.localeCompare(`${b.date} ${b.time || '00:00'}`));
    saveEvents(next.slice(0, 80));
    setEventDraft({ title: '', date: '', time: '', note: '' });
  };

  return (
    <section className="rounded-3xl border border-emerald-300/25 bg-x-panel/55 p-4 shadow-panel">
      <div className="mb-4">
        <p className="nebula-section-heading">calendar</p>
        <h2 className="text-2xl font-black text-x-text">Календарь</h2>
        <p className="mt-1 text-sm text-x-muted">Здесь можно быстро держать встречи, дедлайны и личные напоминания без лишнего экрана.</p>
      </div>

      <div className="rounded-3xl border border-x-border bg-slate-950/70 p-4">
        <div className="grid gap-2">
          <input value={eventDraft.title} onChange={(event) => setEventDraft((current) => ({ ...current, title: event.target.value }))} className="input-field" placeholder="Что запланировано?" />
          <div className="grid gap-2 sm:grid-cols-2">
            <input type="date" value={eventDraft.date} onChange={(event) => setEventDraft((current) => ({ ...current, date: event.target.value }))} className="input-field" />
            <input type="time" value={eventDraft.time} onChange={(event) => setEventDraft((current) => ({ ...current, time: event.target.value }))} className="input-field" />
          </div>
          <textarea value={eventDraft.note} onChange={(event) => setEventDraft((current) => ({ ...current, note: event.target.value }))} className="input-field min-h-20 resize-none" placeholder="Короткая заметка или адрес" maxLength={240} />
        </div>
        <div className="mt-3 flex justify-end">
          <button type="button" onClick={addEvent} className="btn-accent px-5 py-2 text-sm">Добавить событие</button>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        {events.map((item) => (
          <article key={item.id} className="rounded-2xl border border-x-border bg-x-bg/55 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-lg font-black text-x-text">{item.title}</p>
                <p className="mt-1 text-sm text-x-muted">
                  {new Date(`${item.date}T${item.time || '00:00'}`).toLocaleString('ru-RU', {
                    day: '2-digit',
                    month: 'long',
                    hour: item.time ? '2-digit' : undefined,
                    minute: item.time ? '2-digit' : undefined,
                  })}
                </p>
                {item.note && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-x-muted">{item.note}</p>}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => saveEvents(events.filter((event) => event.id !== item.id))} className="rounded-full border border-red-400/30 px-3 py-1 text-xs font-black text-red-300">
                  Удалить
                </button>
              </div>
            </div>
          </article>
        ))}
        {events.length === 0 && <p className="text-sm text-x-muted">Событий пока нет.</p>}
      </div>
    </section>
  );
}

function ActivePanel({ activeId }) {
  if (activeId === 'music') return <MusicPanel />;
  if (activeId === 'notes') return <NotesPanel />;
  if (activeId === 'tasks') return <TasksPanel />;
  if (activeId === 'weather') return <WeatherPanel />;
  if (activeId === 'focus') return <FocusPanel />;
  if (activeId === 'calendar') return <CalendarPanel />;
  return null;
}

export default function ServicesPage() {
  const [services, setServices] = useState(() => {
    const order = loadDockOrder();
    const byId = new Map(servicesCatalog.map((service) => [service.id, service]));
    const ordered = order.map((id) => byId.get(id)).filter(Boolean);
    const missing = servicesCatalog.filter((service) => !order.includes(service.id));
    return [...ordered, ...missing];
  });
  const [activeId, setActiveId] = useState(services[0]?.id || 'music');

  useEffect(() => {
    saveDockOrder(services);
  }, [services]);

  const activeService = useMemo(
    () => services.find((service) => service.id === activeId) || services[0],
    [activeId, services]
  );

  return (
    <div className="min-h-full">
      <div className="cosmic-header px-4 py-3 sm:px-5">
        <h1 className="flex items-center gap-2 text-xl font-black tracking-normal">
          <NavIcon name="services" className="h-5 w-5 text-x-accent" />
          Мини-сервисы
        </h1>
        <p className="mt-2 text-sm text-x-muted">
          Рабочий dock: сервисы можно переставлять перетаскиванием.
        </p>
      </div>

      <div className="grid gap-5 p-4 sm:p-5">
        <ServiceDock
          services={services}
          activeId={activeService?.id}
          onSelect={setActiveId}
          onReorder={(fromId, toId) => setServices((current) => moveItem(current, fromId, toId))}
        />

        <section className="rounded-3xl border border-x-border/70 bg-x-panel/55 p-5 shadow-panel">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="nebula-section-heading">dock service</p>
              <h2 className="text-2xl font-black text-x-text">{activeService?.title}</h2>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-x-muted">{activeService?.description}</p>
            </div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-x-muted">Перетащите кнопки в dock, чтобы собрать свой порядок</p>
          </div>
        </section>

        <ActivePanel activeId={activeService?.id} />
      </div>
    </div>
  );
}
