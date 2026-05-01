// src/components/layout/Layout.jsx
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import NavIcon from './NavIcon';
import useAuthStore from '../../store/authStore';
import useChatStore from '../../store/chatStore';

function MobileNav() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { chats } = useChatStore();
  const totalUnread = chats.reduce((sum, c) => sum + (c.unreadCount || 0), 0);

  const items = [
    { to: '/home', icon: 'home', label: 'Главная' },
    { to: '/messages', icon: 'messages', label: 'Чаты', badge: totalUnread },
    { action: () => navigate('/home'), icon: 'plus', label: 'Создать', primary: true },
    { to: '/notifications', icon: 'bell', label: 'Уведомления' },
    { to: user ? `/${user.username}` : '/login', icon: 'user', label: 'Профиль' },
  ];

  return (
    <nav className="nebula-mobile-nav" aria-label="Мобильная навигация">
      {items.map((item) => {
        const content = (
          <>
            <NavIcon name={item.icon} className="h-5 w-5" />
            {item.badge > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-x-accent px-1 text-[10px] font-black text-slate-950 shadow-neon">
                {item.badge > 9 ? '9+' : item.badge}
              </span>
            )}
          </>
        );

        if (item.to) {
          return (
            <NavLink
              key={item.label}
              to={item.to}
              className={({ isActive }) =>
                `nebula-mobile-action relative ${isActive ? 'nebula-mobile-action-active' : ''}`
              }
              aria-label={item.label}
            >
              {content}
            </NavLink>
          );
        }

        return (
          <button
            key={item.label}
            type="button"
            onClick={item.action}
            className={`nebula-mobile-action relative ${item.primary ? 'bg-gradient-to-r from-x-accent to-blue-500 text-slate-950 shadow-neon' : ''}`}
            aria-label={item.label}
          >
            {content}
          </button>
        );
      })}
    </nav>
  );
}

export default function Layout() {
  const location = useLocation();
  const mainRef = useRef(null);
  const scrollFadeRef = useRef(null);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [scrollStars, setScrollStars] = useState(0);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    setScrollStars(0);
    if (scrollFadeRef.current) window.clearInterval(scrollFadeRef.current);
  }, [location.pathname]);

  const handleMainScroll = (event) => {
    const movement = Math.abs(event.currentTarget.scrollTop - (event.currentTarget.dataset.lastScrollTop || 0));
    event.currentTarget.dataset.lastScrollTop = event.currentTarget.scrollTop;
    const spark = Math.min(1, 0.18 + movement / 140);
    setScrollStars((current) => Math.min(1, current + spark * 0.34));

    if (scrollFadeRef.current) window.clearInterval(scrollFadeRef.current);
    scrollFadeRef.current = window.setInterval(() => {
      setScrollStars((current) => {
        const next = Math.max(0, current - 0.045);
        if (next === 0 && scrollFadeRef.current) {
          window.clearInterval(scrollFadeRef.current);
          scrollFadeRef.current = null;
        }
        return next;
      });
    }, 90);
  };

  const frameClassName = [
    'nebula-app-frame',
    !leftPanelOpen ? 'nebula-app-frame-left-hidden' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className="cosmic-shell" style={{ '--scroll-stars': scrollStars }}>
      <div className="space-backdrop" aria-hidden="true">
        <span className="spark-star spark-one" />
        <span className="spark-star spark-two" />
        <span className="spark-star spark-three spark-muted" />
        <span className="spark-star spark-four" />
        <span className="spark-star spark-five spark-soft" />
        <span className="spark-star spark-six" />
        <span className="spark-star spark-seven spark-muted" />
        <span className="spark-star spark-eight" />
        <span className="spark-star spark-nine spark-soft" />
        <span className="spark-star spark-ten" />
        <span className="spark-star scroll-spark scroll-spark-one" />
        <span className="spark-star scroll-spark scroll-spark-two" />
        <span className="spark-star scroll-spark scroll-spark-three" />
        <span className="spark-star scroll-spark scroll-spark-four" />
        <span className="spark-star scroll-spark scroll-spark-five" />
        <span className="spark-star scroll-spark scroll-spark-six" />
        <span className="spark-star scroll-spark scroll-spark-seven" />
        <span className="spark-star scroll-spark scroll-spark-eight" />
        <span className="spark-star scroll-spark scroll-spark-nine" />
        <span className="spark-star scroll-spark scroll-spark-ten" />
        <span className="meteor meteor-one" />
        <span className="meteor meteor-two" />
        <span className="meteor meteor-three" />
        <span className="meteor meteor-reverse meteor-four" />
        <span className="meteor meteor-reverse meteor-five" />
        <span className="meteor meteor-six" />
        <span className="meteor meteor-reverse meteor-seven" />
        <span className="ufo ufo-one" />
        <span className="ufo ufo-two" />
      </div>

      {!leftPanelOpen && (
        <button
          type="button"
          onClick={() => setLeftPanelOpen(true)}
          className="layout-restore-button layout-restore-left"
          aria-label="Показать левую панель"
          title="Показать левую панель"
        >
          <NavIcon name="expandLeft" className="h-5 w-5" />
        </button>
      )}

      <div className="nebula-page">
        <div className={frameClassName}>
          <div className="nebula-left-slot">
            {leftPanelOpen && (
              <Sidebar
                onHideSidebar={() => setLeftPanelOpen(false)}
              />
            )}
          </div>
          <main ref={mainRef} className="nebula-main-column" onScroll={handleMainScroll}>
            <Outlet />
          </main>
        </div>
      </div>
      <MobileNav />
    </div>
  );
}
