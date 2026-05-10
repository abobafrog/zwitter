// src/App.jsx
import { useEffect, useRef } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import useAuthStore from './store/authStore';
import { useSocket } from './hooks/useSocket';
import Layout from './components/layout/Layout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import HomePage from './pages/HomePage';
import ChatsPage from './pages/ChatsPage';
import ProfilePage from './pages/ProfilePage';
import SettingsPage from './pages/SettingPage';
import TweetPage from './pages/TweetPage';
import BookmarksPage from './pages/BookmarksPage';
import NotificationsPage from './pages/NotificationsPage';
import ExplorePage from './pages/ExplorePage';
import CommunityPage from './pages/CommunityPage';
import SearchPage from './pages/SearchPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import ServicesPage from './pages/ServicesPage';
import MusicPage from './pages/MusicPage';
import MusicArtistPage from './pages/MusicArtistPage';
import GlobalTranslator from './components/i18n/GlobalTranslator';
import { applyPlusTheme } from './utils/plus';

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, hasCheckedAuth } = useAuthStore();
  if (!hasCheckedAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-x-bg">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-x-accent border-t-transparent" />
      </div>
    );
  }
  return isAuthenticated() ? children : <Navigate to="/login" replace />;
};

const GuestRoute = ({ children }) => {
  const { isAuthenticated, hasCheckedAuth } = useAuthStore();
  if (!hasCheckedAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-x-bg">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-x-accent border-t-transparent" />
      </div>
    );
  }
  return !isAuthenticated() ? children : <Navigate to="/home" replace />;
};

const ScrollToRouteTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname]);

  return null;
};

function App() {
  const initializeAuth = useAuthStore((state) => state.initializeAuth);
  const authInitRef = useRef(false);
  useSocket();

  useEffect(() => {
    if (authInitRef.current) return;
    authInitRef.current = true;
    initializeAuth();
  }, [initializeAuth]);

  useEffect(() => {
    applyPlusTheme();
  }, []);

  return (
    <>
      <GlobalTranslator />
      <ScrollToRouteTop />
      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
        <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/forgot-password" element={<GuestRoute><ForgotPasswordPage /></GuestRoute>} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route element={<Layout />}>
          <Route path="/home" element={<HomePage />} />
          <Route path="/music" element={<MusicPage />} />
          <Route path="/services" element={<ServicesPage />} />
          <Route path="/tweet/:id" element={<TweetPage />} />
          <Route path="/search" element={<ProtectedRoute><SearchPage /></ProtectedRoute>} />
          <Route path="/explore" element={<ProtectedRoute><ExplorePage /></ProtectedRoute>} />
          <Route path="/communities" element={<ProtectedRoute><ExplorePage mode="communities" /></ProtectedRoute>} />
          <Route path="/community/:slug" element={<ProtectedRoute><CommunityPage /></ProtectedRoute>} />
          <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
          <Route path="/bookmarks" element={<ProtectedRoute><BookmarksPage /></ProtectedRoute>} />
          <Route path="/music/artist/:artistSlug" element={<ProtectedRoute><MusicArtistPage /></ProtectedRoute>} />
          <Route path="/messages" element={<ProtectedRoute><ChatsPage /></ProtectedRoute>} />
          <Route path="/messages/:chatId" element={<ProtectedRoute><ChatsPage /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
          <Route path="/:username" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
        </Route>
      </Routes>
    </>
  );
}

export default App;
