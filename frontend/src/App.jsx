// src/App.jsx
import { Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from './store/authStore';
import { useSocket } from './hooks/useSocket';
import Layout from './components/layout/Layout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import HomePage from './pages/HomePage';
import ChatsPage from './pages/ChatsPage';
import ProfilePage from './pages/ProfilePage';
import SettingsPage from './pages/SettingPage';

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated() ? children : <Navigate to="/login" replace />;
};

const GuestRoute = ({ children }) => {
  const { isAuthenticated } = useAuthStore();
  return !isAuthenticated() ? children : <Navigate to="/home" replace />;
};

function App() {
  useSocket();

  return (
    <Routes>
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/" element={<Navigate to="/home" replace />} />
      <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
      <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/home" element={<HomePage />} />
        <Route path="/messages" element={<ChatsPage />} />
        <Route path="/messages/:chatId" element={<ChatsPage />} />
        <Route path="/:username" element={<ProfilePage />} />
      </Route>
    </Routes>
  );
}

export default App;
