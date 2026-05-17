// src/pages/SettingsPage.jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../services/api';
import useAuthStore from '../store/authStore';
import useLanguageStore, { languages } from '../store/languageStore';
import useMusicStore from '../store/musicStore';
import NavIcon from '../components/layout/NavIcon';
import { activatePlusForUser, hasPlusAccess, isPlusUser, savePlusTheme } from '../utils/plus';

const settingsSections = [
  ['profile', 'Профиль', 'Профиль', 'user'],
  ['username', 'Никнейм', 'Профиль', 'user'],
  ['privacy', 'Приватность', 'Аккаунт', 'settings'],
  ['notifications', 'Уведомления', 'Аккаунт', 'bell'],
  ['music', 'Музыка', 'Аккаунт', 'music'],
  ['language', 'Язык', 'Аккаунт', 'compass'],
  ['email', 'Email', 'Аккаунт', 'messages'],
  ['password', 'Пароль', 'Аккаунт', 'settings'],
  ['security', 'Безопасность', 'Аккаунт', 'settings'],
  ['sessions', 'Сессии', 'Аккаунт', 'settings'],
  ['blacklist', 'Чёрный список', 'Аккаунт', 'close'],
  ['accounts', 'Аккаунты', 'Аккаунт', 'user'],
  ['subscription', 'Подписка', 'Plus', 'plus'],
  ['appearance', 'Оформление', 'Plus', 'compass'],
  ['feedback', 'Обратная связь', 'Plus', 'messages'],
  ['danger', 'Удаление', 'Опасная зона', 'close'],
];
const PLUS_PAYMENT_KEY = 'zwitter-plus-payment-id';

const settingsGroups = [
  ['Профиль', settingsSections.filter(([, , group]) => group === 'Профиль')],
  ['Аккаунт', settingsSections.filter(([, , group]) => group === 'Аккаунт')],
  ['Plus', settingsSections.filter(([, , group]) => group === 'Plus')],
  ['Опасная зона', settingsSections.filter(([, , group]) => group === 'Опасная зона')],
];

const subscriptionFeatures = [
  {
    feature: 'Длина звита',
    regular: 'До 280 символов',
    premium: 'До 500 символов и длиннее черновики',
  },
  {
    feature: 'Сообщества',
    regular: 'Создание и ведение сообществ',
    premium: 'Будущая аналитика и дополнительные настройки каналов',
  },
  {
    feature: 'Сообщения',
    regular: 'Личные чаты и группы',
    premium: 'Будущие расширенные функции чатов',
  },
  {
    feature: 'Приоритет',
    regular: 'Обычная очередь функций',
    premium: 'Ранний доступ к новым возможностям Zwiteer',
  },
  {
    feature: 'Поддержка',
    regular: 'Стандартные обновления',
    premium: 'Приоритет в будущих улучшениях аккаунта',
  },
];

const Section = ({ id, title, description, children }) => (
  <section data-settings-section={id} className="settings-section">
    <div className="settings-section-head">
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </div>
    <div className="settings-section-body">{children}</div>
  </section>
);

const Field = ({ label, type = 'text', value, onChange, placeholder, hint, maxLength }) => (
  <label className="mb-4 block">
    <span className="settings-label">{label}</span>
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      maxLength={maxLength}
      className="settings-input"
    />
    {hint && <span className="settings-hint">{hint}</span>}
  </label>
);

const TextAreaField = ({ label, value, onChange, placeholder, hint, maxLength }) => (
  <label className="mb-4 block">
    <span className="settings-label">{label}</span>
    <textarea
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      maxLength={maxLength}
      rows={4}
      className="settings-input settings-textarea"
    />
    {hint && <span className="settings-hint">{hint}</span>}
  </label>
);

const SecurityRow = ({ title, description, children }) => (
  <div className="settings-row">
    <div className="min-w-0">
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
    <div className="flex-shrink-0">{children}</div>
  </div>
);

const FutureBadge = ({ children = 'Скоро' }) => (
  <span className="settings-badge">
    {children}
  </span>
);

const ToggleButton = ({ enabled, onClick, label, disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`flex min-w-32 items-center justify-between gap-3 rounded-xl border px-2 py-1.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
      enabled
        ? 'border-cyan-300/60 bg-cyan-300/12 text-x-accent shadow-neon'
        : 'border-x-border bg-x-bg/70 text-x-muted hover:border-cyan-300/45 hover:text-x-text'
    }`}
    aria-label={label}
    aria-pressed={enabled}
  >
    <span className="px-2">{enabled ? 'Вкл' : 'Выкл'}</span>
    <span className={`h-7 w-12 rounded-full border p-0.5 transition ${enabled ? 'border-cyan-300/45 bg-cyan-300/20' : 'border-x-border bg-slate-950'}`}>
      <span className={`block h-5 w-5 rounded-full transition ${enabled ? 'translate-x-5 bg-x-accent' : 'bg-x-muted/70'}`} />
    </span>
  </button>
);

export default function SettingsPage() {
  const { user, updateUser, logout } = useAuthStore();
  const { language, setLanguage } = useLanguageStore();
  const { hideExplicit, setHideExplicit } = useMusicStore();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const settingsBodyRef = useRef(null);

  const [profile, setProfile] = useState({
    displayName: user?.displayName || '',
    bio: user?.bio || '',
  });
  const [username, setUsername] = useState(user?.username || '');
  const [emailData, setEmailData] = useState({ newEmail: '', currentPassword: '', code: '', pendingEmail: '' });
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [deleteData, setDeleteData] = useState({ currentPassword: '', confirm: '' });
  const [billing, setBilling] = useState('month');
  const [blockedDraft, setBlockedDraft] = useState('');
  const [blockedUsers, setBlockedUsers] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('zwitter-blacklist') || '[]');
    } catch {
      return [];
    }
  });
  const [savedAccounts, setSavedAccounts] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('zwitter-saved-accounts') || '[]');
    } catch {
      return [];
    }
  });
  const [appearance, setAppearance] = useState(() => localStorage.getItem('zwitter-plus-theme') || 'neon');
  const [activeSection, setActiveSection] = useState('profile');
  const [loading, setLoading] = useState({
    profile: false,
    username: false,
    email: false,
    password: false,
    delete: false,
    privacy: false,
    notifications: false,
  });

  const activeEmail = useMemo(() => user?.email || 'email не указан', [user?.email]);
  const plusActive = hasPlusAccess(user);
  const { data: sessionData } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.get('/auth/sessions').then((r) => r.data),
    enabled: !!user,
  });
  const revokeSessionMutation = useMutation({
    mutationFn: (id) => api.delete(`/auth/sessions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions'] });
      toast.success('Сессия завершена');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Не удалось завершить сессию'),
  });
  const createYooKassaPaymentMutation = useMutation({
    mutationFn: (plan) => api.post('/payments/plus/create', {
      plan,
      returnUrl: `${window.location.origin}/settings`,
    }),
    onSuccess: ({ data }) => {
      if (data.paymentId) localStorage.setItem(PLUS_PAYMENT_KEY, data.paymentId);
      if (data.confirmationUrl) {
        window.location.href = data.confirmationUrl;
        return;
      }
      toast.error('YooKassa не вернула ссылку на оплату');
    },
    onError: (error) => toast.error(error.response?.data?.error || 'Не удалось создать оплату YooKassa'),
  });
  const setLoad = (key, val) => setLoading((l) => ({ ...l, [key]: val }));
  const closeSettings = () => {
    if (window.history.state?.idx > 0) {
      navigate(-1);
      return;
    }
    navigate('/home');
  };

  const saveProfile = async () => {
    if (!profile.displayName.trim()) {
      toast.error('Имя не может быть пустым');
      return;
    }
    setLoad('profile', true);
    try {
      const { data } = await api.patch('/users/me/profile', {
        displayName: profile.displayName.trim(),
        bio: profile.bio.trim(),
      });
      updateUser(data.user);
      toast.success('Профиль обновлён');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Ошибка');
    } finally {
      setLoad('profile', false);
    }
  };

  const saveUsername = async () => {
    const nextUsername = username.trim().toLowerCase();
    if (nextUsername.length < 3) {
      toast.error('Минимум 3 символа');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(nextUsername)) {
      toast.error('Только латиница, цифры и _');
      return;
    }
    setLoad('username', true);
    try {
      const { data } = await api.patch('/users/me/profile', { username: nextUsername });
      updateUser(data.user);
      setUsername(data.user.username);
      toast.success('Никнейм изменён');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Никнейм уже занят');
    } finally {
      setLoad('username', false);
    }
  };

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
      setEmailData((current) => ({
        ...current,
        code: '',
        pendingEmail: data.pendingEmail,
        currentPassword: '',
      }));
      toast.success(data.message || 'Код отправлен на новый email');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Ошибка');
    } finally {
      setLoad('email', false);
    }
  };

  const confirmEmail = async () => {
    const pendingEmail = emailData.pendingEmail || emailData.newEmail.trim().toLowerCase();
    if (!pendingEmail || !emailData.code.trim()) {
      toast.error('Введите email и код из письма');
      return;
    }
    setLoad('email', true);
    try {
      const { data } = await api.post('/users/me/email/confirm', {
        newEmail: pendingEmail,
        code: emailData.code.trim(),
      });
      updateUser({ email: data.email, emailVerified: true, emailVerifiedAt: new Date().toISOString() });
      setEmailData({ newEmail: '', currentPassword: '', code: '', pendingEmail: '' });
      toast.success('Email подтверждён и изменён');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Код не подошёл');
    } finally {
      setLoad('email', false);
    }
  };

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
      toast.success('Пароль изменён');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Неверный текущий пароль');
    } finally {
      setLoad('password', false);
    }
  };

  const saveGroupInvitePrivacy = async (blockGroupInvites) => {
    setLoad('privacy', true);
    try {
      const { data } = await api.patch('/users/me/profile', { blockGroupInvites });
      updateUser(data.user);
      toast.success(blockGroupInvites ? 'Добавление в группы запрещено' : 'Добавление в группы разрешено');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Не удалось сохранить настройку');
    } finally {
      setLoad('privacy', false);
    }
  };

  const saveMessagePrivacy = async (messagePrivacy) => {
    setLoad('privacy', true);
    try {
      const { data } = await api.patch('/users/me/profile', { messagePrivacy });
      updateUser(data.user);
      toast.success('Ограничение сообщений сохранено');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Не удалось сохранить настройку');
    } finally {
      setLoad('privacy', false);
    }
  };

  const saveNotificationSetting = async (key, value) => {
    setLoad('notifications', true);
    try {
      const { data } = await api.patch('/users/me/profile', { [key]: value });
      updateUser(data.user);
      toast.success('Настройки уведомлений сохранены');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Не удалось сохранить уведомления');
    } finally {
      setLoad('notifications', false);
    }
  };

  const deleteAccount = async () => {
    if (deleteData.confirm !== user?.username) {
      toast.error('Введи свой никнейм для подтверждения');
      return;
    }
    if (!deleteData.currentPassword) {
      toast.error('Введи текущий пароль');
      return;
    }
    setLoad('delete', true);
    try {
      await api.delete('/users/me', { data: { currentPassword: deleteData.currentPassword } });
      toast.success('Аккаунт удалён');
      await logout();
      navigate('/register', { replace: true });
    } catch (e) {
      toast.error(e.response?.data?.error || 'Не удалось удалить аккаунт');
    } finally {
      setLoad('delete', false);
    }
  };

  const buySubscription = () => {
    activatePlusForUser(user);
    updateUser({ isPlus: true });
    toast.success('Тестовый Plus активирован для этого аккаунта');
  };

  const addBlockedUser = () => {
    const value = blockedDraft.trim().replace(/^@/, '').toLowerCase();
    if (!value) return;
    const next = [...new Set([...blockedUsers, value])];
    setBlockedUsers(next);
    setBlockedDraft('');
    localStorage.setItem('zwitter-blacklist', JSON.stringify(next));
    toast.success('Пользователь добавлен в чёрный список');
  };

  const removeBlockedUser = (username) => {
    const next = blockedUsers.filter((item) => item !== username);
    setBlockedUsers(next);
    localStorage.setItem('zwitter-blacklist', JSON.stringify(next));
  };

  const rememberCurrentAccount = () => {
    if (!user) return;
    const next = [
      { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: user.avatarUrl },
      ...savedAccounts.filter((account) => account.id !== user.id),
    ].slice(0, 5);
    setSavedAccounts(next);
    localStorage.setItem('zwitter-saved-accounts', JSON.stringify(next));
    toast.success('Аккаунт добавлен в переключатель');
  };

  const saveAppearance = (theme) => {
    if (!plusActive) {
      toast.error('Оформление доступно только с Plus');
      return;
    }
    setAppearance(theme);
    savePlusTheme(theme);
    toast.success('Оформление сохранено');
  };

  const showTwoFactorNotice = () => {
    toast('2FA добавлена в настройки как будущая функция. Реальное включение сделаем отдельным шагом.');
  };

  const subscriptionPrice = billing === 'year' ? '2 990 ₽ / год' : '299 ₽ / месяц';

  const showSettingsSection = (id) => {
    setActiveSection(id);
    window.requestAnimationFrame(() => {
      settingsBodyRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const paymentState = params.get('plusPayment');
    const paymentId = params.get('paymentId') || localStorage.getItem(PLUS_PAYMENT_KEY);
    if (paymentState !== 'return' || !paymentId || !user) return;

    let cancelled = false;
    showSettingsSection('subscription');

    api.get(`/payments/plus/${paymentId}`)
      .then(({ data }) => {
        if (cancelled) return;
        if (data.status === 'succeeded' || data.paid) {
          activatePlusForUser(user);
          updateUser({ isPlus: true });
          toast.success('Plus успешно активирован');
        } else if (data.status === 'pending') {
          toast('Платёж ещё обрабатывается YooKassa');
        } else {
          toast.error('Оплата не завершена');
        }
      })
      .catch((error) => {
        if (cancelled) return;
        toast.error(error.response?.data?.error || 'Не удалось проверить оплату YooKassa');
      })
      .finally(() => {
        if (cancelled) return;
        localStorage.removeItem(PLUS_PAYMENT_KEY);
        const nextParams = new URLSearchParams(location.search);
        nextParams.delete('plusPayment');
        nextParams.delete('paymentId');
        const nextSearch = nextParams.toString();
        navigate(`${location.pathname}${nextSearch ? `?${nextSearch}` : ''}`, { replace: true });
      });

    return () => {
      cancelled = true;
    };
  }, [location.pathname, location.search, navigate, updateUser, user]);

  return (
    <div className="settings-stage" data-no-translate="true">
      <div className="settings-window">
        <aside className="settings-sidebar">
          <div className="settings-sidebar-header">
            <button
              type="button"
              onClick={closeSettings}
              className="settings-square-button"
              aria-label="Назад"
            >
              <NavIcon name="settings" className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <p className="settings-kicker">Zwiteer</p>
              <h1>Настройки</h1>
            </div>
            <button
              type="button"
              className="settings-square-button"
              aria-label="Поиск настроек"
              onClick={() => toast('Поиск по настройкам скоро появится')}
            >
              <NavIcon name="search" className="h-4 w-4" />
            </button>
          </div>

          <nav className="settings-sidebar-nav" aria-label="Разделы настроек">
            {settingsGroups.map(([group, items]) => (
              <div key={group} className="settings-sidebar-group">
                <p className="settings-sidebar-title">{group}</p>
                <div className="settings-sidebar-links">
                  {items.map(([id, label, , icon]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => showSettingsSection(id)}
                      aria-current={id === activeSection ? 'page' : undefined}
                      className={[
                        'settings-sidebar-link',
                        id === activeSection ? 'settings-sidebar-link-active' : '',
                        id === 'danger' ? 'settings-sidebar-link-danger' : '',
                      ].filter(Boolean).join(' ')}
                    >
                      <NavIcon name={icon} className="h-4 w-4" />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>

        </aside>

        <main className="settings-main">
          <div className="settings-main-header">
            <div>
              <p>Account Control</p>
              <h2>Настройки аккаунта</h2>
            </div>
            <button
              type="button"
              onClick={closeSettings}
              className="settings-close-button"
              aria-label="Закрыть настройки"
            >
              <NavIcon name="close" className="h-5 w-5" />
            </button>
          </div>

          <div className="settings-mobile-picker">
            <select
              id="settings-mobile-section"
              value={activeSection}
              onChange={(event) => showSettingsSection(event.target.value)}
              className="settings-mobile-picker-select"
            >
              {settingsGroups.map(([group, items]) => (
                <optgroup key={group} label={group}>
                  {items.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div ref={settingsBodyRef} className="settings-main-body">
            {activeSection === 'profile' && (
            <Section
              id="profile"
              title="Информация профиля"
              description="Имя и описание видны другим пользователям в профиле и ленте."
            >
        <Field
          label="Отображаемое имя"
          value={profile.displayName}
          onChange={(e) => setProfile((p) => ({ ...p, displayName: e.target.value }))}
          placeholder="Твоё имя"
          maxLength={50}
        />
        <TextAreaField
          label="О себе"
          value={profile.bio}
          onChange={(e) => setProfile((p) => ({ ...p, bio: e.target.value }))}
          placeholder="Расскажи о себе..."
          hint={`${profile.bio.length}/160 символов`}
          maxLength={160}
        />
        <button type="button" onClick={saveProfile} disabled={loading.profile} className="btn-accent px-5 py-2 text-sm">
          {loading.profile ? 'Сохраняем...' : 'Сохранить профиль'}
        </button>
      </Section>
            )}

      {activeSection === 'username' && (
      <Section
        id="username"
        title="Никнейм"
        description="Username используется в ссылке на профиль и упоминаниях."
      >
        <Field
          label="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="username"
          hint="Только латиница, цифры и _ (мин. 3 символа)"
        />
        <button
          type="button"
          onClick={saveUsername}
          disabled={loading.username || username === user?.username}
          className="btn-accent px-5 py-2 text-sm"
        >
          {loading.username ? 'Меняем...' : 'Изменить никнейм'}
        </button>
      </Section>
      )}

      {activeSection === 'privacy' && (
      <Section
        id="privacy"
        title="Приватность"
        description="Управляй тем, кто может писать тебе и добавлять тебя в групповые чаты."
      >
        <div className="rounded-2xl border border-x-border/75 bg-x-panel/55 px-4 shadow-panel">
          <SecurityRow
            title="Кто может писать мне"
            description="Ограничение влияет на создание новых личных чатов и отправку сообщений в личных диалогах."
          >
            <div className="flex flex-wrap gap-2">
              {[
                ['everyone', 'Все'],
                ['following', 'Мои подписки'],
                ['none', 'Никто'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => saveMessagePrivacy(value)}
                  disabled={loading.privacy}
                  className={`rounded-xl border px-3 py-2 text-xs font-black uppercase tracking-wide transition disabled:opacity-60 ${
                    (user?.messagePrivacy || 'everyone') === value
                      ? 'border-cyan-300/60 bg-cyan-300/12 text-x-accent shadow-neon'
                      : 'border-x-border bg-x-bg/70 text-x-muted hover:border-cyan-300/45 hover:text-x-text'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </SecurityRow>
          <SecurityRow
            title="Не добавлять меня в группы"
            description="Если включено, другие пользователи не смогут выбрать тебя при создании группового чата."
          >
            <ToggleButton
              enabled={Boolean(user?.blockGroupInvites)}
              onClick={() => saveGroupInvitePrivacy(!user?.blockGroupInvites)}
              disabled={loading.privacy}
              label="Запретить добавление в группы"
            />
          </SecurityRow>
        </div>
      </Section>
      )}

      {activeSection === 'notifications' && (
      <Section
        id="notifications"
        title="Уведомления"
        description="Выбери, какие события должны появляться в уведомлениях и бейджах."
      >
        <div className="rounded-2xl border border-x-border/75 bg-x-panel/55 px-4 shadow-panel">
          {[
            ['notifyLikes', 'Лайки', 'Когда кто-то лайкает твой звит.'],
            ['notifyReplies', 'Ответы', 'Когда отвечают на твой звит или тред.'],
            ['notifyRetweets', 'Репосты', 'Когда кто-то репостит твой звит.'],
            ['notifyFollows', 'Подписки', 'Когда на тебя подписываются.'],
            ['notifyMessages', 'Сообщения', 'Когда приходят новые сообщения в чатах.'],
          ].map(([key, title, description]) => (
            <SecurityRow key={key} title={title} description={description}>
              <ToggleButton
                enabled={user?.[key] !== false}
                onClick={() => saveNotificationSetting(key, !(user?.[key] !== false))}
                disabled={loading.notifications}
                label={`Уведомления: ${title}`}
              />
            </SecurityRow>
          ))}
        </div>
      </Section>
      )}

      {activeSection === 'sessions' && (
      <Section
        id="sessions"
        title="Активные сессии"
        description="Устройства и браузеры, где сейчас действуют refresh-сессии аккаунта."
      >
        <div className="rounded-2xl border border-x-border/75 bg-x-panel/55 px-4 shadow-panel">
          {(sessionData?.sessions || []).map((session) => (
            <SecurityRow
              key={session.id}
              title={session.current ? 'Текущая сессия' : `Сессия ${session.id.slice(0, 8)}`}
              description={`Создана ${new Date(session.createdAt).toLocaleString('ru-RU')} · активна до ${new Date(session.expiresAt).toLocaleString('ru-RU')}`}
            >
              <button
                type="button"
                disabled={session.current || revokeSessionMutation.isPending}
                onClick={() => revokeSessionMutation.mutate(session.id)}
                className="rounded-xl border border-red-400/35 px-4 py-2 text-sm font-black text-red-300 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {session.current ? 'Это устройство' : 'Завершить'}
              </button>
            </SecurityRow>
          ))}
          {(sessionData?.sessions || []).length === 0 && (
            <p className="py-4 text-sm text-x-muted">Активных сессий пока не найдено.</p>
          )}
        </div>
      </Section>
      )}

      {activeSection === 'blacklist' && (
      <Section id="blacklist" title="Чёрный список" description="Локальный список пользователей, которых ты хочешь скрывать и проверять перед общением.">
        <div className="rounded-2xl border border-x-border/75 bg-x-panel/55 p-4 shadow-panel">
          <div className="flex gap-2">
            <input value={blockedDraft} onChange={(e) => setBlockedDraft(e.target.value)} className="settings-input mb-0" placeholder="@username" />
            <button type="button" onClick={addBlockedUser} className="btn-accent px-4 py-2 text-sm">Добавить</button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {blockedUsers.map((username) => (
              <button key={username} type="button" onClick={() => removeBlockedUser(username)} className="rounded-full border border-x-border px-3 py-1 text-sm font-black text-x-muted hover:border-red-300/45 hover:text-red-200">
                @{username} ×
              </button>
            ))}
            {blockedUsers.length === 0 && <span className="text-sm text-x-muted">Список пуст.</span>}
          </div>
        </div>
      </Section>
      )}

      {activeSection === 'accounts' && (
      <Section id="accounts" title="Переключение аккаунтов" description="Сохраняет быстрые ярлыки аккаунтов на этом устройстве; вход всё равно подтверждается паролем или сессией.">
        <div className="rounded-2xl border border-x-border/75 bg-x-panel/55 p-4 shadow-panel">
          <button type="button" onClick={rememberCurrentAccount} className="btn-accent px-4 py-2 text-sm">Запомнить текущий аккаунт</button>
          <div className="mt-4 grid gap-2">
            {savedAccounts.map((account) => (
              <button key={account.id} type="button" onClick={() => navigate('/login')} className="flex items-center gap-3 rounded-2xl border border-x-border bg-x-bg/55 px-3 py-2 text-left">
                <div className="h-9 w-9 overflow-hidden rounded-full cosmic-avatar">
                  {account.avatarUrl ? <img src={account.avatarUrl} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center font-black">{account.displayName?.[0]?.toUpperCase()}</div>}
                </div>
                <div>
                  <p className="text-sm font-black text-x-text">{account.displayName}</p>
                  <p className="text-xs text-x-muted">@{account.username}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </Section>
      )}

      {activeSection === 'language' && (
      <Section
        id="language"
        title="Язык"
        description="Переключает язык интерфейса. Название сети Zwiteer не переводится."
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {languages.map(([code, label]) => (
            <button
              key={code}
              type="button"
              onClick={() => {
                setLanguage(code);
                toast.success('Язык обновлён');
              }}
              className={`rounded-2xl border px-4 py-3 text-left text-sm font-black transition ${
                language === code
                  ? 'border-cyan-300/60 bg-cyan-300/12 text-x-accent shadow-neon'
                  : 'border-x-border bg-x-bg/55 text-x-muted hover:border-cyan-300/45 hover:text-x-text'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Section>
      )}

      {activeSection === 'music' && (
      <Section
        id="music"
        title="Музыка"
        description="Быстрые музыкальные настройки для поиска, радио и карточек артистов."
      >
        <div className="rounded-2xl border border-x-border/75 bg-x-panel/55 px-4 shadow-panel">
          <SecurityRow
            title="Скрывать explicit-треки"
            description="Такие треки помечаются отдельно в музыке. Если включить этот переключатель, они пропадут из поиска, радио и страниц артистов."
          >
            <ToggleButton
              enabled={hideExplicit}
              onClick={() => {
                setHideExplicit(!hideExplicit);
                toast.success(hideExplicit ? 'Explicit-треки снова показываются' : 'Explicit-треки скрыты');
              }}
              label="Скрывать explicit-треки"
            />
          </SecurityRow>
        </div>
      </Section>
      )}

      {activeSection === 'appearance' && (
      <Section id="appearance" title="Оформление" description="Темы интерфейса доступны только с Plus.">
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            ['neon', 'Неон'],
            ['midnight', 'Полночь'],
            ['contrast', 'Контраст'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => saveAppearance(value)}
              className={`rounded-2xl border px-4 py-4 text-sm font-black transition ${appearance === value && plusActive ? 'border-cyan-300/60 bg-cyan-300/12 text-x-accent shadow-neon' : 'border-x-border bg-x-bg/55 text-x-muted hover:border-cyan-300/45'}`}
            >
              {label}
              {!plusActive && <span className="mt-1 block text-[10px] uppercase text-fuchsia-200">Plus</span>}
            </button>
          ))}
        </div>
      </Section>
      )}

      {activeSection === 'feedback' && (
      <Section id="feedback" title="Обратная связь" description="Предложения, баги и идеи можно отправить на почту команды.">
        <div className="rounded-2xl border border-x-border/75 bg-x-panel/55 p-4 shadow-panel">
          <a href="mailto:allo100717@gmail.com?subject=Zwiteer%20feedback" className="btn-accent inline-flex px-5 py-2 text-sm">
            Написать на allo100717@gmail.com
          </a>
        </div>
      </Section>
      )}

      {activeSection === 'email' && (
      <Section
        id="email"
        title="Email"
        description={`Текущий email: ${activeEmail}. Смена завершится только после кода с нового адреса.`}
      >
        <Field
          label="Новый email"
          type="email"
          value={emailData.newEmail}
          onChange={(e) => setEmailData((d) => ({ ...d, newEmail: e.target.value }))}
          placeholder="new@email.com"
        />
        <Field
          label="Текущий пароль"
          type="password"
          value={emailData.currentPassword}
          onChange={(e) => setEmailData((d) => ({ ...d, currentPassword: e.target.value }))}
          placeholder="Пароль для подтверждения"
        />
        <button type="button" onClick={saveEmail} disabled={loading.email} className="btn-accent px-5 py-2 text-sm">
          {loading.email ? 'Отправляем...' : 'Отправить код'}
        </button>
        {(emailData.pendingEmail || emailData.newEmail) && (
          <div className="mt-5 rounded-2xl border border-cyan-300/25 bg-x-panel/55 p-4">
            <p className="text-sm font-bold text-x-text">
              Подтверждение для {emailData.pendingEmail || emailData.newEmail}
            </p>
            <Field
              label="Код из письма"
              value={emailData.code}
              onChange={(e) => setEmailData((d) => ({ ...d, code: e.target.value }))}
              placeholder="000000"
              maxLength={6}
            />
            <button type="button" onClick={confirmEmail} disabled={loading.email} className="btn-outline px-5 py-2 text-sm">
              Подтвердить смену email
            </button>
          </div>
        )}
      </Section>
      )}

      {activeSection === 'password' && (
      <Section
        id="password"
        title="Пароль"
        description="Для безопасности после смены пароля лучше заново войти на других устройствах."
      >
        <Field
          label="Текущий пароль"
          type="password"
          value={passwordData.currentPassword}
          onChange={(e) => setPasswordData((d) => ({ ...d, currentPassword: e.target.value }))}
          placeholder="Текущий пароль"
        />
        <Field
          label="Новый пароль"
          type="password"
          value={passwordData.newPassword}
          onChange={(e) => setPasswordData((d) => ({ ...d, newPassword: e.target.value }))}
          placeholder="Новый пароль"
          hint="Минимум 6 символов, 1 цифра"
        />
        <Field
          label="Повторите новый пароль"
          type="password"
          value={passwordData.confirmPassword}
          onChange={(e) => setPasswordData((d) => ({ ...d, confirmPassword: e.target.value }))}
          placeholder="Повторите пароль"
        />
        <button type="button" onClick={savePassword} disabled={loading.password} className="btn-accent px-5 py-2 text-sm">
          {loading.password ? 'Меняем...' : 'Изменить пароль'}
        </button>
      </Section>
      )}

      {activeSection === 'security' && (
      <Section
        id="security"
        title="Безопасность аккаунта"
        description="Настройки входа, подтверждения почты и восстановления доступа."
      >
        <div className="rounded-2xl border border-x-border/75 bg-x-panel/55 px-4 shadow-panel">
          <SecurityRow
            title="Двухфакторная аутентификация"
            description="Дополнительный код при входе. Пока это только место под будущую настройку, реальная защита ещё не активируется."
          >
            <ToggleButton enabled={false} onClick={showTwoFactorNotice} label="Двухфакторная аутентификация скоро появится" />
          </SecurityRow>

          <SecurityRow
            title="Подтверждение email"
            description="После регистрации пользователь подтверждает почту одноразовым кодом из письма."
          >
            <FutureBadge>Код из email</FutureBadge>
          </SecurityRow>

          <SecurityRow
            title="Восстановление пароля"
            description="Сброс пароля идёт через одноразовую ссылку на email, старые сессии после смены пароля удаляются."
          >
            <button
              type="button"
              onClick={() => navigate('/forgot-password')}
              className="rounded-xl border border-cyan-300/45 bg-cyan-300/10 px-4 py-2 text-sm font-black uppercase tracking-wide text-x-accent transition hover:bg-cyan-300/15"
            >
              Сбросить
            </button>
          </SecurityRow>
        </div>
      </Section>
      )}

      {activeSection === 'subscription' && (
      <Section
        id="subscription"
        title="Подписка Zwiteer Plus"
        description="Платная подписка расширяет лимиты и включает ранние функции. Оплата создаётся через YooKassa redirect checkout."
      >
        <div className="overflow-hidden rounded-2xl border border-cyan-300/25 bg-x-panel/60 shadow-panel">
          <div className="border-b border-x-border/70 bg-gradient-to-r from-cyan-300/12 via-x-panel to-blue-500/15 p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-x-accent">Zwiteer Plus</p>
                <h3 className="mt-2 text-2xl font-black text-x-text">{subscriptionPrice}</h3>
                <p className="mt-1 text-sm text-x-muted">
                  До 500 символов в звите, больше пространства для черновиков и ранний доступ к новым настройкам.
                </p>
              </div>
              <div className="flex rounded-xl border border-x-border bg-x-bg/60 p-1">
                <button
                  type="button"
                  onClick={() => setBilling('month')}
                  className={`rounded-lg px-3 py-1.5 text-sm font-bold transition ${billing === 'month' ? 'bg-x-accent text-slate-950 shadow-neon' : 'text-x-muted hover:text-x-text'}`}
                >
                  Месяц
                </button>
                <button
                  type="button"
                  onClick={() => setBilling('year')}
                  className={`rounded-lg px-3 py-1.5 text-sm font-bold transition ${billing === 'year' ? 'bg-x-accent text-slate-950 shadow-neon' : 'text-x-muted hover:text-x-text'}`}
                >
                  Год
                </button>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={buySubscription} className="btn-accent px-5 py-2 text-sm">
                Протестить Plus
              </button>
              <button
                type="button"
                onClick={() => createYooKassaPaymentMutation.mutate(billing)}
                disabled={createYooKassaPaymentMutation.isPending}
                className="rounded-xl border border-x-border px-5 py-2 text-sm font-black text-x-text transition hover:border-cyan-300/40"
              >
                {createYooKassaPaymentMutation.isPending ? 'Создаём платёж...' : 'Оплатить через YooKassa'}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-x-border/70 bg-x-bg/35 text-xs uppercase tracking-[0.12em] text-x-muted">
                <tr>
                  <th className="px-4 py-3 font-black">Возможность</th>
                  <th className="px-4 py-3 font-black">Обычный пользователь</th>
                  <th className="px-4 py-3 font-black text-x-accent">С подпиской</th>
                </tr>
              </thead>
              <tbody>
                {subscriptionFeatures.map((item) => (
                  <tr key={item.feature} className="border-b border-x-border/50 last:border-0">
                    <td className="px-4 py-3 font-bold text-x-text">{item.feature}</td>
                    <td className="px-4 py-3 text-x-muted">{item.regular}</td>
                    <td className="px-4 py-3 text-x-text">{item.premium}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>
      )}

      {activeSection === 'danger' && (
      <Section
        id="danger"
        title="Удалить аккаунт"
        description="Аккаунт, звиты, ответы, лайки, закладки, подписки, уведомления, чаты и созданные сообщества будут удалены без восстановления."
      >
        <Field
          label="Текущий пароль"
          type="password"
          value={deleteData.currentPassword}
          onChange={(e) => setDeleteData((d) => ({ ...d, currentPassword: e.target.value }))}
          placeholder="Пароль для подтверждения"
        />
        <Field
          label={`Введите никнейм ${user?.username || ''}`}
          value={deleteData.confirm}
          onChange={(e) => setDeleteData((d) => ({ ...d, confirm: e.target.value.trim().toLowerCase() }))}
          placeholder={user?.username || 'username'}
        />
        <button
          type="button"
          onClick={deleteAccount}
          disabled={loading.delete}
          className="rounded-xl border border-x-danger/45 bg-x-danger/10 px-5 py-2 text-sm font-black text-x-danger transition hover:bg-x-danger/15"
        >
          {loading.delete ? 'Удаляем...' : 'Удалить аккаунт'}
        </button>
            </Section>
      )}
          </div>
        </main>
      </div>
    </div>
  );
}
