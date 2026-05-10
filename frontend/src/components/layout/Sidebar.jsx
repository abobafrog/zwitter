// src/components/layout/Sidebar.jsx
import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import useChatStore from '../../store/chatStore';
import useMusicStore from '../../store/musicStore';
import NavIcon from './NavIcon';
import { isPlusUser } from '../../utils/plus';
import { getCalendarNotifications } from '../../utils/calendarNotifications';

const staticItems = [
  { label: 'Уведомления', icon: 'bell', to: '/notifications', badge: 'notifications' },
  { label: 'Закладки', icon: 'bookmark', to: '/bookmarks' },
  { label: 'Музыка', icon: 'music', to: '/music' },
  { label: 'Мини-сервисы', icon: 'services', to: '/services' },
];

const guestItems = [
  { label: 'Музыка', icon: 'music', to: '/music' },
  { label: 'Погода', icon: 'compass', to: '/services' },
];

function BrandMark() {
  return (
    <div className="flex items-center gap-3 px-3">
      <div className="relative h-9 w-9 rounded-full border border-cyan-300/40 bg-cyan-300/10 shadow-neon">
        <div className="absolute left-2 top-2 h-4 w-4 rotate-45 rounded-sm bg-gradient-to-br from-cyan-300 to-blue-500" />
        <div className="absolute bottom-2 right-2 h-3 w-3 rounded-full bg-fuchsia-400/80" />
      </div>
      <div>
        <p className="bg-gradient-to-r from-cyan-200 to-blue-300 bg-clip-text text-base font-black text-transparent">
          Zwiteer
        </p>
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-x-muted">Social</p>
      </div>
    </div>
  );
}

function SidebarMusicArtwork({ track }) {
  const [failed, setFailed] = useState(false);
  if (track?.thumbnailUrl && !failed) {
    return <img src={track.thumbnailUrl} alt="" onError={() => setFailed(true)} className="h-11 w-11 flex-shrink-0 rounded-xl object-cover" />;
  }
  return (
    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-cyan-300/25 bg-cyan-300/10 text-x-accent">
      <NavIcon name="music" className="h-5 w-5" />
    </div>
  );
}

const shortenText = (value = '', maxLength = 28) => {
  const text = value?.toString?.().trim?.() || '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
};

export default function Sidebar({ onHideSidebar }) {
  const { user, logout } = useAuthStore();
  const { chats } = useChatStore();
  const { currentTrack, isPlaying, playlists, pausePlayback, resumePlayback, showPanel } = useMusicStore();
  const navigate = useNavigate();
  const totalUnread = chats.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
  const [musicSearch, setMusicSearch] = useState('');
  const [calendarUnread, setCalendarUnread] = useState(() => (user ? getCalendarNotifications(user.id).unreadCount : 0));
  const { data: notificationData } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications').then((r) => r.data),
    enabled: !!user,
    staleTime: 10000,
  });
  useEffect(() => {
    const refresh = () => setCalendarUnread(user ? getCalendarNotifications(user.id).unreadCount : 0);
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('zwitter:calendar-updated', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('zwitter:calendar-updated', refresh);
    };
  }, [user]);

  const unreadNotifications = (notificationData?.unreadCount || 0) + calendarUnread;

  const navLinkClass = ({ isActive }) =>
    `group flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold transition ${
      isActive
        ? 'bg-cyan-300/[0.14] text-x-text shadow-neon'
        : 'text-x-muted hover:bg-cyan-300/10 hover:text-x-text'
    }`;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const requireRegistration = () => navigate('/register');

  const openMusicSearch = () => {
    const nextQuery = musicSearch.trim();
    navigate(nextQuery ? `/music?musicQuery=${encodeURIComponent(nextQuery)}` : '/music');
  };

  return (
    <>
      <aside className="nebula-sidebar-shell relative hidden h-full min-h-0 flex-col overflow-y-auto border-r border-x-border/80 bg-x-bg/45 px-3 py-5 backdrop-blur-xl lg:flex">
        <div className="flex items-center justify-between gap-2">
          <BrandMark />
          <button
            type="button"
            onClick={onHideSidebar}
            className="panel-icon-button"
            aria-label="Скрыть левую панель"
            title="Скрыть левую панель"
          >
            <NavIcon name="collapseLeft" className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-7 grid gap-1">
          <NavLink to="/home" className={navLinkClass}>
            <NavIcon name="home" />
            <span>Главная</span>
          </NavLink>

          {user && (
            <>
              <NavLink to="/search" className={navLinkClass}>
                <NavIcon name="search" />
                <span>Поиск</span>
              </NavLink>

              <NavLink to="/messages" className={navLinkClass}>
                <span className="relative">
                  <NavIcon name="messages" />
                  {totalUnread > 0 && (
                    <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-x-accent px-1 text-[10px] font-black text-slate-950 shadow-neon">
                      {totalUnread > 9 ? '9+' : totalUnread}
                    </span>
                  )}
                </span>
                <span>Сообщения</span>
              </NavLink>
            </>
          )}

          {(user ? staticItems : guestItems).map((item) => {
            const badge = item.badge === 'notifications' ? unreadNotifications : 0;
            return (
              <NavLink key={item.label} to={item.to} className={navLinkClass}>
                <span className="relative">
                  <NavIcon name={item.icon} />
                  {badge > 0 && (
                    <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-x-accent px-1 text-[10px] font-black text-slate-950 shadow-neon">
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </span>
                <span>{item.label}</span>
              </NavLink>
            );
          })}

          {user && (
            <NavLink to={`/${user.username}`} className={navLinkClass}>
              <NavIcon name="user" />
              <span>Профиль</span>
            </NavLink>
          )}

          {user && (
            <NavLink to="/settings" className={navLinkClass}>
              <NavIcon name="settings" />
              <span>Настройки</span>
            </NavLink>
          )}
        </div>

        <section className="mt-5 rounded-3xl border border-cyan-300/20 bg-x-panel/70 p-3 shadow-panel">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-x-accent">music</p>
              <p className="text-sm font-black text-x-text">Музыкальный блок</p>
            </div>
            <button type="button" onClick={() => navigate('/music')} className="panel-icon-button" aria-label="Открыть музыку">
              <NavIcon name="music" className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 flex gap-2">
            <input
              value={musicSearch}
              onChange={(event) => setMusicSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') openMusicSearch();
              }}
              className="input-field h-10 flex-1 px-3 py-2 text-sm"
              placeholder="Найти трек..."
            />
            <button type="button" onClick={openMusicSearch} className="rounded-2xl border border-cyan-300/35 px-3 text-x-accent transition hover:bg-cyan-300/10">
              <NavIcon name="search" className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 rounded-2xl border border-x-border bg-x-bg/45 p-3">
            {currentTrack ? (
              <>
                <div className="flex items-center gap-3">
                  <SidebarMusicArtwork track={currentTrack} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-x-text" title={currentTrack.title}>{shortenText(currentTrack.title, 28)}</p>
                    <p className="truncate text-xs text-x-muted" title={currentTrack.artist || 'Без артиста'}>{shortenText(currentTrack.artist || 'Без артиста', 24)}</p>
                    <p className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-cyan-200/80">{currentTrack.providerLabel || 'Muffon'}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => (isPlaying ? pausePlayback() : resumePlayback())}
                    className="flex-1 rounded-2xl border border-cyan-300/35 bg-cyan-300/10 px-3 py-2 text-sm font-black text-x-accent"
                  >
                    {isPlaying ? 'Пауза' : 'Играть'}
                  </button>
                  <button type="button" onClick={showPanel} className="rounded-2xl border border-x-border px-3 py-2 text-sm font-black text-x-muted transition hover:text-x-text">
                    Окно
                  </button>
                </div>
              </>
            ) : (
              <div>
                <p className="text-sm font-bold text-x-muted">Выбери трек в музыкальной библиотеке.</p>
                <button type="button" onClick={() => navigate('/music')} className="mt-3 w-full rounded-2xl border border-cyan-300/35 bg-cyan-300/10 px-3 py-2 text-sm font-black text-x-accent">
                  Открыть библиотеку
                </button>
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between text-xs font-bold text-x-muted">
            <span>Плейлистов: {playlists.length}</span>
            <button type="button" onClick={() => navigate('/music')} className="transition hover:text-x-text">Управление</button>
          </div>
        </section>

        <div className="mt-5 grid gap-2">
          <button
            type="button"
            onClick={() => (user ? navigate('/home') : requireRegistration())}
            className="nebula-sidebar-compose flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-x-accent to-blue-500 px-4 py-3 text-sm font-black text-slate-950 shadow-neon transition hover:brightness-110"
          >
            <NavIcon name="plus" className="h-4 w-4" />
            <span>Создать звит</span>
          </button>
        </div>

        {user ? (
          <div className="nebula-sidebar-profile-card mt-auto rounded-3xl border border-x-border/80 bg-x-panel/70 p-3 shadow-panel">
            <button
              type="button"
              onClick={() => navigate(`/${user.username}`)}
              className="flex w-full items-center gap-3 text-left"
            >
              <div className="h-11 w-11 rounded-full cosmic-avatar">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.displayName} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center font-black">
                    {user.displayName?.[0]?.toUpperCase() || '?'}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{user.displayName}</p>
                <div className="flex items-center gap-2">
                  <p className="truncate text-xs text-x-muted">@{user.username}</p>
                  {isPlusUser(user) && (
                    <span className="plus-star-badge plus-star-badge-small" title="Plus" aria-label="Plus">
                      <span className="plus-star-badge-core">★</span>
                    </span>
                  )}
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="mt-3 w-full rounded-2xl border border-x-danger/35 bg-x-danger/10 px-3 py-2 text-sm font-bold text-x-danger transition hover:bg-x-danger/15"
            >
              Выйти
            </button>
          </div>
        ) : (
          <div className="nebula-sidebar-profile-card mt-auto rounded-3xl border border-cyan-300/25 bg-x-panel/70 p-3 shadow-panel">
            <p className="text-sm font-black text-x-text">Войдите, чтобы писать, подписываться и сохранять.</p>
            <div className="mt-3 grid gap-2">
              <button type="button" onClick={() => navigate('/register')} className="rounded-2xl bg-cyan-300 px-3 py-2 text-sm font-black text-slate-950">
                Зарегистрироваться
              </button>
              <button type="button" onClick={() => navigate('/login')} className="rounded-2xl border border-x-border px-3 py-2 text-sm font-bold text-x-muted transition hover:text-x-text">
                Войти
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
