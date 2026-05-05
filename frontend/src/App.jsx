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
        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route path="/home" element={<HomePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/communities" element={<ExplorePage mode="communities" />} />
          <Route path="/community/:slug" element={<CommunityPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/bookmarks" element={<BookmarksPage />} />
          <Route path="/services" element={<ServicesPage />} />
          <Route path="/tweet/:id" element={<TweetPage />} />
          <Route path="/messages" element={<ChatsPage />} />
          <Route path="/messages/:chatId" element={<ChatsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/:username" element={<ProfilePage />} />
        </Route>
      </Routes>
    </>
  );
}

export default App;
