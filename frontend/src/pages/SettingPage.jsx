// src/pages/SettingsPage.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';
import useAuthStore from '../store/authStore';

const Section = ({ title, children }) => (
  <div className="border-b border-x-border px-4 py-5">
    <h2 className="font-bold text-lg mb-4">{title}</h2>
    {children}
  </div>
);

const Field = ({ label, type = 'text', value, onChange, placeholder, hint }) => (
  <div className="mb-4">
    <label className="block text-sm text-x-muted mb-1.5">{label}</label>
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className="input-field"
    />
    {hint && <p className="text-xs text-x-muted mt-1">{hint}</p>}
  </div>
);

export default function SettingsPage() {
  const { user, updateUser } = useAuthStore();
  const navigate = useNavigate();

  // Данные профиля
  const [profile, setProfile] = useState({
    displayName: user?.displayName || '',
    bio: user?.bio || '',
    birthDate: user?.birthDate || '',
  });

  // Смена username
  const [username, setUsername] = useState(user?.username || '');

  // Смена email
  const [emailData, setEmailData] = useState({
    newEmail: '',
    currentPassword: '',
  });

  // Смена пароля
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [loading, setLoading] = useState({
    profile: false,
    username: false,
    email: false,
    password: false,
  });

  const setLoad = (key, val) => setLoading((l) => ({ ...l, [key]: val }));

  // Сохранить профиль
  const saveProfile = async () => {
    if (!profile.displayName.trim()) {
      toast.error('Имя не может быть пустым');
      return;
    }
    setLoad('profile', true);
    try {
      const { data } = await api.patch('/users/me/profile', {
        displayName: profile.displayName,
        bio: profile.bio,
        birthDate: profile.birthDate || null,
      });
      updateUser(data.user);
      toast.success('Профиль обновлён!');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Ошибка');
    } finally {
      setLoad('profile', false);
    }
  };

  // Сменить username
  const saveUsername = async () => {
    if (username.trim().length < 3) {
      toast.error('Минимум 3 символа');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      toast.error('Только латиница, цифры и _');
      return;
    }
    setLoad('username', true);
    try {
      const { data } = await api.patch('/users/me/profile', { username: username.toLowerCase() });
      updateUser(data.user);
      toast.success('Никнейм изменён!');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Никнейм уже занят');
    } finally {
      setLoad('username', false);
    }
  };

  // Сменить email
  const saveEmail = async () => {
    if (!emailData.newEmail || !emailData.currentPassword) {
      toast.error('Заполните все поля');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailData.newEmail)) {
      toast.error('Некорректный email');
      return;
    }
    setLoad('email', true);
    try {
      const { data } = await api.patch('/users/me/email', emailData);
      updateUser({ email: data.email });
      setEmailData({ newEmail: '', currentPassword: '' });
      toast.success('Email изменён!');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Ошибка');
    } finally {
      setLoad('email', false);
    }
  };

  // Сменить пароль
  const savePassword = async () => {
    if (!passwordData.currentPassword || !passwordData.newPassword) {
      toast.error('Заполните все поля');
      return;
    }
    if (passwordData.newPassword.length < 6) {
      toast.error('Новый пароль минимум 6 символов');
      return;
    }
    if (!/\d/.test(passwordData.newPassword)) {
      toast.error('Пароль должен содержать цифру');
      return;
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error('Пароли не совпадают');
      return;
    }
    setLoad('password', true);
    try {
      await api.patch('/users/me/password', {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
      });
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast.success('Пароль изменён!');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Неверный текущий пароль');
    } finally {
      setLoad('password', false);
    }
  };

  return (
    <div>
      {/* Заголовок */}
      <div className="sticky top-0 z-10 bg-black/80 backdrop-blur-md border-b border-x-border px-4 py-3 flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-1 rounded-full hover:bg-white/10">
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
            <path d="M20 11H7.414l4.293-4.293-1.414-1.414L3.586 12l6.707 6.707 1.414-1.414L7.414 13H20v-2z"/>
          </svg>
        </button>
        <h1 className="text-xl font-bold">Настройки</h1>
      </div>

      {/* Имя и био */}
      <Section title="Информация профиля">
        <Field
          label="Отображаемое имя"
          value={profile.displayName}
          onChange={(e) => setProfile((p) => ({ ...p, displayName: e.target.value }))}
          placeholder="Твоё имя"
        />
        <Field
          label="О себе"
          value={profile.bio}
          onChange={(e) => setProfile((p) => ({ ...p, bio: e.target.value }))}
          placeholder="Расскажи о себе..."
          hint="Максимум 160 символов"
        />
        <Field
          label="Дата рождения"
          type="date"
          value={profile.birthDate}
          onChange={(e) => setProfile((p) => ({ ...p, birthDate: e.target.value }))}
        />
        <button
          onClick={saveProfile}
          disabled={loading.profile}
          className="btn-accent px-5 py-2 text-sm"
        >
          {loading.profile ? 'Сохраняем...' : 'Сохранить'}
        </button>
      </Section>

      {/* Username */}
      <Section title="Никнейм">
        <Field
          label="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="username"
          hint="Только латиница, цифры и _ (мин. 3 символа)"
        />
        <button
          onClick={saveUsername}
          disabled={loading.username || username === user?.username}
          className="btn-accent px-5 py-2 text-sm"
        >
          {loading.username ? 'Меняем...' : 'Изменить никнейм'}
        </button>
      </Section>

      {/* Email */}
      <Section title="Изменить email">
        <Field
          label="Новый email"
          type="email"
          value={emailData.newEmail}
          onChange={(e) => setEmailData((d) => ({ ...d, newEmail: e.target.value }))}
          placeholder="new@email.com"
        />
        <Field
          label="Текущий пароль (для подтверждения)"
          type="password"
          value={emailData.currentPassword}
          onChange={(e) => setEmailData((d) => ({ ...d, currentPassword: e.target.value }))}
          placeholder="••••••••"
        />
        <button
          onClick={saveEmail}
          disabled={loading.email}
          className="btn-accent px-5 py-2 text-sm"
        >
          {loading.email ? 'Меняем...' : 'Изменить email'}
        </button>
      </Section>

      {/* Пароль */}
      <Section title="Изменить пароль">
        <Field
          label="Текущий пароль"
          type="password"
          value={passwordData.currentPassword}
          onChange={(e) => setPasswordData((d) => ({ ...d, currentPassword: e.target.value }))}
          placeholder="••••••••"
        />
        <Field
          label="Новый пароль"
          type="password"
          value={passwordData.newPassword}
          onChange={(e) => setPasswordData((d) => ({ ...d, newPassword: e.target.value }))}
          placeholder="••••••••"
          hint="Минимум 6 символов, 1 цифра"
        />
        <Field
          label="Повторите новый пароль"
          type="password"
          value={passwordData.confirmPassword}
          onChange={(e) => setPasswordData((d) => ({ ...d, confirmPassword: e.target.value }))}
          placeholder="••••••••"
        />
        <button
          onClick={savePassword}
          disabled={loading.password}
          className="btn-accent px-5 py-2 text-sm"
        >
          {loading.password ? 'Меняем...' : 'Изменить пароль'}
        </button>
      </Section>
    </div>
  );
}