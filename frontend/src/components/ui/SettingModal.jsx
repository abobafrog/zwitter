// src/components/ui/SettingModal.jsx
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';

const Section = ({ title, children }) => (
  <div className="border-b border-x-border px-4 py-5">
    <h2 className="font-bold text-base mb-4">{title}</h2>
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

export default function SettingsModal({ onClose }) {
  const { user, updateUser } = useAuthStore();

  const [profile, setProfile] = useState({
    displayName: user?.displayName || '',
    bio: user?.bio || '',
  });
  const [username, setUsername] = useState(user?.username || '');
  const [emailData, setEmailData] = useState({ newEmail: '', currentPassword: '' });
  const [passwordData, setPasswordData] = useState({
    currentPassword: '', newPassword: '', confirmPassword: '',
  });
  const [loading, setLoading] = useState({
    profile: false, username: false, email: false, password: false,
  });

  const setLoad = (key, val) => setLoading((l) => ({ ...l, [key]: val }));

  const saveProfile = async () => {
    if (!profile.displayName.trim()) { toast.error('Имя не может быть пустым'); return; }
    setLoad('profile', true);
    try {
      const { data } = await api.patch('/users/me/profile', {
        displayName: profile.displayName,
        bio: profile.bio,
      });
      updateUser(data.user);
      toast.success('Профиль обновлён!');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Ошибка');
    } finally {
      setLoad('profile', false);
    }
  };

  const saveUsername = async () => {
    if (username.trim().length < 3) { toast.error('Минимум 3 символа'); return; }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) { toast.error('Только латиница, цифры и _'); return; }
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

  const saveEmail = async () => {
    if (!emailData.newEmail || !emailData.currentPassword) { toast.error('Заполните все поля'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailData.newEmail)) { toast.error('Некорректный email'); return; }
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

  const savePassword = async () => {
    if (!passwordData.currentPassword || !passwordData.newPassword) { toast.error('Заполните все поля'); return; }
    if (passwordData.newPassword.length < 6) { toast.error('Минимум 6 символов'); return; }
    if (!/\d/.test(passwordData.newPassword)) { toast.error('Пароль должен содержать цифру'); return; }
    if (passwordData.newPassword !== passwordData.confirmPassword) { toast.error('Пароли не совпадают'); return; }
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
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-black border border-x-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        {/* Шапка */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-x-border sticky top-0 bg-black z-10">
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 transition-colors">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
              <path d="M18.3 5.71a1 1 0 00-1.41 0L12 10.59 7.11 5.7A1 1 0 005.7 7.11L10.59 12 5.7 16.89a1 1 0 001.41 1.41L12 13.41l4.89 4.89a1 1 0 001.41-1.41L13.41 12l4.89-4.89a1 1 0 000-1.4z"/>
            </svg>
          </button>
          <h2 className="font-bold text-lg">Настройки</h2>
          <div className="w-8" />
        </div>

        {/* Имя и био */}
        <Section title="Информация профиля">
          <Field label="Отображаемое имя" value={profile.displayName}
            onChange={(e) => setProfile((p) => ({ ...p, displayName: e.target.value }))}
            placeholder="Твоё имя" />
          <Field label="О себе" value={profile.bio}
            onChange={(e) => setProfile((p) => ({ ...p, bio: e.target.value }))}
            placeholder="Расскажи о себе..." hint="Максимум 160 символов" />
          <button onClick={saveProfile} disabled={loading.profile} className="btn-primary px-5 py-2 text-sm">
            {loading.profile ? 'Сохраняем...' : 'Сохранить'}
          </button>
        </Section>

        {/* Username */}
        <Section title="Никнейм">
          <Field label="Username" value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username" hint="Только латиница, цифры и _ (мин. 3 символа)" />
          <button onClick={saveUsername} disabled={loading.username || username === user?.username}
            className="btn-primary px-5 py-2 text-sm">
            {loading.username ? 'Меняем...' : 'Изменить никнейм'}
          </button>
        </Section>

        {/* Email */}
        <Section title="Изменить email">
          <Field label="Новый email" type="email" value={emailData.newEmail}
            onChange={(e) => setEmailData((d) => ({ ...d, newEmail: e.target.value }))}
            placeholder="new@email.com" />
          <Field label="Текущий пароль" type="password" value={emailData.currentPassword}
            onChange={(e) => setEmailData((d) => ({ ...d, currentPassword: e.target.value }))}
            placeholder="••••••••" />
          <button onClick={saveEmail} disabled={loading.email} className="btn-primary px-5 py-2 text-sm">
            {loading.email ? 'Меняем...' : 'Изменить email'}
          </button>
        </Section>

        {/* Пароль */}
        <Section title="Изменить пароль">
          <Field label="Текущий пароль" type="password" value={passwordData.currentPassword}
            onChange={(e) => setPasswordData((d) => ({ ...d, currentPassword: e.target.value }))}
            placeholder="••••••••" />
          <Field label="Новый пароль" type="password" value={passwordData.newPassword}
            onChange={(e) => setPasswordData((d) => ({ ...d, newPassword: e.target.value }))}
            placeholder="••••••••" hint="Минимум 6 символов, 1 цифра" />
          <Field label="Повторите пароль" type="password" value={passwordData.confirmPassword}
            onChange={(e) => setPasswordData((d) => ({ ...d, confirmPassword: e.target.value }))}
            placeholder="••••••••" />
          <button onClick={savePassword} disabled={loading.password} className="btn-primary px-5 py-2 text-sm">
            {loading.password ? 'Меняем...' : 'Изменить пароль'}
          </button>
        </Section>

      </div>
    </div>
  );
}