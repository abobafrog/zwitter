// src/components/layout/Sidebar.jsx
import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/authStore';
import useChatStore from '../../store/chatStore';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import SettingsModal from '../ui/SettingModal';

export default function Sidebar() {
  const { user, logout } = useAuthStore();
  const { chats } = useChatStore();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const totalUnread = chats.reduce((sum, c) => sum + (c.unreadCount || 0), 0);

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
    navigate('/login');
  };

  return (
    <>
      {/* Боковая панель */}
      <nav className="w-72px flex flex-col items-center py-4 px-2 sticky top-0 h-screen border-r border-x-border gap-2">

        {/* Верхние иконки */}
        <div className="flex flex-col items-center gap-1 flex-1 w-full">

          {/* Главная */}
          <NavLink to="/home" className={({ isActive }) =>
            `flex items-center justify-center w-12 h-12 rounded-full transition-colors ${isActive ? 'bg-white/10' : 'hover:bg-white/10'}`
          } title="Главная">
            {({ isActive }) => (
              <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
                {isActive
                  ? <path d="M21.591 7.146L12.52 1.157c-.316-.21-.724-.21-1.04 0l-9.071 5.99c-.26.173-.409.456-.409.757v13.183c0 .502.418.913.929.913H8.4c.511 0 .929-.41.929-.913v-7.075h5.352v7.075c0 .502.417.913.928.913h5.471c.511 0 .929-.41.929-.913V7.903c0-.301-.158-.584-.418-.757z"/>
                  : <path d="M22.46 7.57L12.357 2.115c-.223-.12-.49-.12-.713 0L1.543 7.57c-.364.197-.5.652-.303 1.017.135.25.394.393.66.393.12 0 .243-.03.356-.09l.815-.44L4.7 19.963c.214 1.215 1.308 2.062 2.658 2.062h9.282c1.352 0 2.445-.848 2.663-2.087l1.626-11.497.818.442c.364.193.82.06 1.017-.304.196-.363.06-.818-.304-1.017zM12 15.435c-1.399 0-2.538-1.139-2.538-2.538S10.6 10.36 12 10.36s2.538 1.138 2.538 2.537S13.399 15.435 12 15.435z"/>
                }
              </svg>
            )}
          </NavLink>

          {/* Сообщения */}
          <NavLink to="/messages" className={({ isActive }) =>
            `relative flex items-center justify-center w-12 h-12 rounded-full transition-colors ${isActive ? 'bg-white/10' : 'hover:bg-white/10'}`
          } title="Сообщения">
            {({ isActive }) => (
              <>
                <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
                  {isActive
                    ? <path d="M19.25 3.018H4.75C3.233 3.018 2 4.252 2 5.77v12.495c0 1.518 1.233 2.753 2.75 2.753h14.5c1.517 0 2.75-1.235 2.75-2.753V5.771c0-1.518-1.233-2.753-2.75-2.753zm-2.01 5.528l-5.39 3.795c-.218.153-.505.153-.722 0l-5.39-3.795c-.4-.282-.494-.833-.213-1.233.28-.4.832-.494 1.233-.213L12 10.771l4.242-2.988c.4-.28.952-.187 1.232.213.282.4.188.951-.213 1.232z"/>
                    : <path d="M1.998 5.5c0-1.381 1.119-2.5 2.5-2.5h15c1.381 0 2.5 1.119 2.5 2.5v13c0 1.381-1.119 2.5-2.5 2.5h-15c-1.381 0-2.5-1.119-2.5-2.5v-13zm2.5-.5c-.276 0-.5.224-.5.5v2.764l8 3.638 8-3.638V5.5c0-.276-.224-.5-.5-.5h-15zm15.5 5.463l-7.5 3.41-7.5-3.41V18.5c0 .276.224.5.5.5h14c.276 0 .5-.224.5-.5v-8.037z"/>
                  }
                </svg>
                {totalUnread > 0 && (
                  <span className="absolute top-1 right-1 bg-x-accent text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                    {totalUnread > 9 ? '9+' : totalUnread}
                  </span>
                )}
              </>
            )}
          </NavLink>

          {/* Поиск */}
          <button
            onClick={() => setSearchOpen((v) => !v)}
            className={`flex items-center justify-center w-12 h-12 rounded-full transition-colors ${searchOpen ? 'bg-white/10 text-x-accent' : 'hover:bg-white/10'}`}
            title="Поиск"
          >
            <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
              <path d="M10.25 3.75c-3.59 0-6.5 2.91-6.5 6.5s2.91 6.5 6.5 6.5c1.795 0 3.419-.726 4.596-1.904 1.178-1.177 1.904-2.801 1.904-4.596 0-3.59-2.91-6.5-6.5-6.5zm-8.5 6.5c0-4.694 3.806-8.5 8.5-8.5s8.5 3.806 8.5 8.5c0 1.986-.682 3.815-1.814 5.272l4.521 4.521-1.414 1.414-4.521-4.521A8.456 8.456 0 0110.25 18.75c-4.694 0-8.5-3.806-8.5-8.5z"/>
            </svg>
          </button>
        </div>

        {/* Профиль снизу */}
        {user && (
          <div className="relative w-full flex justify-center">
            {/* Аватарка → на профиль */}
            <button
              onClick={() => navigate(`/${user.username}`)}
              className="w-10 h-10 rounded-full bg-x-surface overflow-hidden border border-x-border hover:opacity-80 transition-opacity"
              title={user.displayName}
            >
              {user.avatarUrl
                ? <img src={user.avatarUrl} alt={user.displayName} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center font-bold text-sm">
                    {user.displayName?.[0]?.toUpperCase() || '?'}
                  </div>
              }
            </button>

            {/* Три точки рядом с аватаркой */}
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="absolute -top-1 -right-1 w-5 h-5 bg-x-surface border border-x-border rounded-full flex items-center justify-center hover:bg-white/20 transition-colors"
            >
              
              <svg viewBox="0 0 24 24" className="w-3 h-3 fill-current text-x-muted">
                <path d="M12 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 12c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
              </svg>
            </button>

            {/* Выпадающее меню */}
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} />
                <div className="absolute bottom-14 left-0 z-30 w-52 bg-x-surface border border-x-border rounded-2xl shadow-xl overflow-hidden py-1">
                  <div className="px-4 py-3 border-b border-x-border">
                    <p className="font-bold text-sm truncate">{user.displayName}</p>
                    <p className="text-x-muted text-xs truncate">@{user.username}</p>
                  </div>
                  <button
                    onClick={(e) => { 
                      e.stopPropagation();
                      console.log('клик настройки', settingsOpen);
                      setMenuOpen(false); 
                      setSettingsOpen(true);
                      console.log('после setSettingsOpen');
                    }}
                    className="flex items-center gap-3 w-full px-4 py-3 hover:bg-white/5 transition-colors"
                  >
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current text-x-muted">
                      <path d="M12 8.666c-1.838 0-3.333 1.496-3.333 3.334s1.495 3.333 3.333 3.333 3.333-1.495 3.333-3.333S13.838 8.666 12 8.666zm7.5 2.167c.041-.375.083-.75.083-1.167s-.042-.792-.083-1.167l2.5-1.958-2.5-4.333-2.917 1.208c-.625-.458-1.292-.833-2.041-1.125L14.167 0h-5l-.375 2.291c-.75.292-1.417.667-2.042 1.125L3.833 2.208l-2.5 4.333 2.5 1.958C3.792 8.875 3.75 9.25 3.75 9.666s.042.792.083 1.167l-2.5 1.959 2.5 4.333 2.917-1.208c.625.458 1.292.833 2.041 1.125L9.167 19.5h5l.375-2.292c.75-.291 1.417-.666 2.042-1.125l2.916 1.208 2.5-4.333-2.5-1.958z"/>
                    </svg>
                    <span className="text-sm font-medium">Настройки</span>
                  </button>
                  <button
                    onClick={() => { setMenuOpen(false); navigate(`/${user.username}`); }}
                    className="flex items-center gap-3 w-full px-4 py-3 hover:bg-white/5 transition-colors"
                  >
                    
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current text-x-muted">
                      <path d="M17.863 13.44c1.477 1.58 2.366 3.8 2.632 6.46l.11 1.1H3.395l.11-1.1c.266-2.66 1.155-4.88 2.632-6.46C7.627 11.85 9.648 11 12 11s4.373.85 5.863 2.44zM12 2C9.791 2 8 3.79 8 6s1.791 4 4 4 4-1.79 4-4-1.791-4-4-4z"/>
                    </svg>
                    <span className="text-sm font-medium">Мой профиль</span>
                  </button>
                  <div className="border-t border-x-border" />
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-3 w-full px-4 py-3 hover:bg-white/5 transition-colors text-x-danger"
                  >
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                      <path d="M16 13v-2H7V8l-5 4 5 4v-3h9zm-1-9H5a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2v-3h-2v3H5V6h10v3h2V6a2 2 0 00-2-2z"/>
                    </svg>
                    <span className="text-sm font-medium">Выйти</span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </nav>

      {/* Выдвижная панель поиска */}
      {searchOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => { setSearchOpen(false); setSearchQuery(''); }} />
          <div className="fixed left-[72px] top-0 h-screen w-72 bg-black border-r border-x-border z-20 flex flex-col shadow-2xl">
            <div className="px-4 py-4 border-b border-x-border">
              <h2 className="font-bold text-lg mb-3">Поиск</h2>
              <div className="relative">
                <svg viewBox="0 0 24 24" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 fill-current text-x-muted">
                  <path d="M10.25 3.75c-3.59 0-6.5 2.91-6.5 6.5s2.91 6.5 6.5 6.5c1.795 0 3.419-.726 4.596-1.904 1.178-1.177 1.904-2.801 1.904-4.596 0-3.59-2.91-6.5-6.5-6.5zm-8.5 6.5c0-4.694 3.806-8.5 8.5-8.5s8.5 3.806 8.5 8.5c0 1.986-.682 3.815-1.814 5.272l4.521 4.521-1.414 1.414-4.521-4.521A8.456 8.456 0 0110.25 18.75c-4.694 0-8.5-3.806-8.5-8.5z"/>
                </svg>
                <input
                  autoFocus
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Поиск пользователей..."
                  className="w-full bg-x-surface rounded-full py-2.5 pl-9 pr-4 text-sm placeholder-x-muted focus:outline-none focus:ring-1 focus:ring-x-accent"
                />
              </div>
            </div>
            <SearchResults
              query={searchQuery}
              onSelect={(username) => {
                navigate(`/${username}`);
                setSearchOpen(false);
                setSearchQuery('');
              }}
            />
          </div>
          {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
        </>
      )}
    </>
  );
}

// Результаты поиска
function SearchResults({ query, onSelect }) {
  const { data, isLoading } = useQuery({
    queryKey: ['sidebar-search', query],
    queryFn: () => api.get(`/users/search?q=${query}`).then((r) => r.data.users),
    enabled: query.trim().length > 0,
    staleTime: 3000,
  });

  if (!query.trim()) return (
    <div className="flex flex-col items-center justify-center flex-1 text-x-muted text-sm px-4 text-center py-8">
      <p>Введи имя или @username</p>
    </div>
  );

  if (isLoading) return (
    <div className="flex justify-center py-8">
      <div className="w-6 h-6 border-2 border-x-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!data?.length) return (
    <div className="py-8 text-center text-x-muted text-sm">Никого не найдено</div>
  );

  return (
    <div className="overflow-y-auto flex-1">
      {data.map((user) => (
        <button key={user.id} onClick={() => onSelect(user.username)}
          className="flex items-center gap-3 w-full px-4 py-3 hover:bg-white/5 transition-colors text-left">
          <div className="w-10 h-10 rounded-full bg-x-surface border border-x-border overflow-hidden flex-shrink-0">
            {user.avatarUrl
              ? <img src={user.avatarUrl} alt={user.displayName} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center font-bold text-sm">
                  {user.displayName?.[0]?.toUpperCase()}
                </div>
            }
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm truncate">{user.displayName}</p>
            <p className="text-x-muted text-sm truncate">@{user.username}</p>
          </div>
        </button>
      ))}
    </div>
  );
}