// src/components/layout/Layout.jsx
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import Sidebar from './Sidebar';
import NavIcon from './NavIcon';
import useAuthStore from '../../store/authStore';
import useChatStore from '../../store/chatStore';
import BackgroundMusicPlayer from '../music/BackgroundMusicPlayer';

const SKY_OBJECT_VARIANTS = [
  'comet-variant-01',
  'comet-variant-02',
  'comet-variant-03',
  'comet-variant-04',
  'comet-variant-05',
  'comet-variant-06',
  'comet-variant-07',
  'comet-variant-08',
  'comet-variant-09',
  'comet-variant-10',
  'comet-variant-11',
  'comet-variant-12',
  'asteroid-type-01',
  'asteroid-type-02',
  'asteroid-type-03',
  'ufo-detailed',
];

const pickSkyObjects = () => {
  const pool = [...SKY_OBJECT_VARIANTS];
  return Array.from({ length: 6 }, () => {
    const index = Math.floor(Math.random() * pool.length);
    return pool.splice(index, 1)[0];
  });
};

const getScrollRestorationKey = (location) => `${location.pathname}${location.search}`;
const scrollStorageKey = (key) => `zwiteer-scroll:${key}`;

function MobileNav() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { chats } = useChatStore();
  const totalUnread = chats.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
  const protectedAction = (path = '/register') => {
    navigate(user ? path : '/register');
  };

  const items = [
    { to: '/home', icon: 'home', label: 'Главная' },
    { action: () => protectedAction('/messages'), icon: 'messages', label: 'Чаты', badge: user ? totalUnread : 0 },
    { to: '/music', icon: 'music', label: 'Музыка' },
    { to: '/services', icon: 'compass', label: 'Сервисы' },
    { action: () => protectedAction(user ? `/${user.username}` : '/register'), icon: 'user', label: 'Профиль' },
    { action: () => protectedAction('/settings'), icon: 'settings', label: 'Настройки' },
  ];

  return (
    <nav className="nebula-mobile-nav" aria-label="Мобильная навигация">
      {items.map((item) => {
        const content = (
          <>
            <span className="nebula-mobile-action-icon-wrap">
              <NavIcon name={item.icon} className="h-5 w-5" />
            </span>
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
            className="nebula-mobile-action relative"
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
  const navigationType = useNavigationType();
  const mainRef = useRef(null);
  const scrollFadeRef = useRef(null);
  const scrollPositionsRef = useRef(new Map());
  const activeScrollKeyRef = useRef(getScrollRestorationKey(location));
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [scrollStars, setScrollStars] = useState(0);
  const [skyObjects, setSkyObjects] = useState(() => pickSkyObjects());

  const getSavedScrollTop = (key) => {
    if (scrollPositionsRef.current.has(key)) {
      return scrollPositionsRef.current.get(key);
    }

    const stored = window.sessionStorage.getItem(scrollStorageKey(key));
    const parsed = stored ? Number(stored) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const rememberScrollTop = (key, scrollTop, preserveSavedPosition = false) => {
    const savedScrollTop = getSavedScrollTop(key);
    if (preserveSavedPosition && scrollTop === 0 && savedScrollTop > 0) return;

    scrollPositionsRef.current.set(key, scrollTop);
    window.sessionStorage.setItem(scrollStorageKey(key), String(scrollTop));
  };

  useLayoutEffect(() => {
    const main = mainRef.current;
    const nextKey = getScrollRestorationKey(location);

    activeScrollKeyRef.current = nextKey;
    const savedScrollTop = navigationType === 'POP' ? getSavedScrollTop(nextKey) : 0;
    main?.scrollTo({ top: savedScrollTop, left: 0, behavior: 'auto' });
    if (main) main.dataset.lastScrollTop = String(savedScrollTop);
    setScrollStars(0);
    setSkyObjects(pickSkyObjects());
    if (scrollFadeRef.current) window.clearInterval(scrollFadeRef.current);

    return () => {
      if (mainRef.current) {
        rememberScrollTop(nextKey, mainRef.current.scrollTop, true);
      }
    };
  }, [location.pathname, location.search, navigationType]);

  useEffect(() => () => {
    if (scrollFadeRef.current) window.clearInterval(scrollFadeRef.current);
  }, []);

  const handleMainScroll = (event) => {
    const lastScrollTop = Number(event.currentTarget.dataset.lastScrollTop || 0);
    const movement = Math.abs(event.currentTarget.scrollTop - lastScrollTop);
    event.currentTarget.dataset.lastScrollTop = event.currentTarget.scrollTop;
    rememberScrollTop(activeScrollKeyRef.current, event.currentTarget.scrollTop);
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
        <span className="milky-way-band" />
        <span className="nebula-cloud nebula-cloud-one" />
        <span className="nebula-cloud nebula-cloud-two" />
        <span className="nebula-cloud nebula-cloud-three" />
        <span className="star-dust star-dust-deep" />
        <span className="star-dust star-dust-near" />
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
        <span className="bright-star bright-star-one" />
        <span className="bright-star bright-star-two" />
        <span className="bright-star bright-star-three" />
        {skyObjects.map((objectClass, index) => (
          <span
            key={`${location.key}-${objectClass}-${index}`}
            className={`sky-object sky-object-${index + 1} ${objectClass}`}
          />
        ))}
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
      <BackgroundMusicPlayer />
      <MobileNav />
    </div>
  );
}
