// src/components/layout/Sidebar.jsx
import { NavLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import useChatStore from '../../store/chatStore';
import NavIcon from './NavIcon';

const staticItems = [
  { label: 'Обзор', icon: 'compass', to: '/explore' },
  { label: 'Уведомления', icon: 'bell', to: '/notifications', badge: 'notifications' },
  { label: 'Сообщества', icon: 'community', to: '/communities' },
  { label: 'Закладки', icon: 'bookmark', to: '/bookmarks' },
  { label: 'Мини-сервисы', icon: 'services', to: '/services' },
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

export default function Sidebar({ onHideSidebar }) {
  const { user, logout } = useAuthStore();
  const { chats } = useChatStore();
  const navigate = useNavigate();
  const totalUnread = chats.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
  const { data: notificationData } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications').then((r) => r.data),
    enabled: !!user,
    staleTime: 10000,
  });
  const unreadNotifications = notificationData?.unreadCount || 0;

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

  return (
    <>
      <aside className="relative hidden h-full min-h-0 flex-col overflow-y-auto border-r border-x-border/80 bg-x-bg/45 px-3 py-5 backdrop-blur-xl lg:flex">
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

          {staticItems.map((item) => {
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

          <NavLink to="/settings" className={navLinkClass}>
            <NavIcon name="settings" />
            <span>Настройки</span>
          </NavLink>
        </div>

        <button
          type="button"
          onClick={() => navigate('/home')}
          className="mt-5 flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-x-accent to-blue-500 px-4 py-3 text-sm font-black text-slate-950 shadow-neon transition hover:brightness-110"
        >
          <NavIcon name="plus" className="h-4 w-4" />
          <span>Создать пост</span>
        </button>

        {user && (
          <div className="mt-auto rounded-3xl border border-x-border/80 bg-x-panel/70 p-3 shadow-panel">
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
                <p className="truncate text-xs text-x-muted">@{user.username}</p>
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
        )}
      </aside>
    </>
  );
}
