// src/pages/SettingsPage.jsx
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';
import useAuthStore from '../store/authStore';

const settingsSections = [
  ['profile', 'Профиль'],
  ['username', 'Никнейм'],
  ['email', 'Email'],
  ['password', 'Пароль'],
  ['security', 'Безопасность'],
  ['subscription', 'Подписка'],
  ['danger', 'Удаление'],
];

const subscriptionFeatures = [
  {
    feature: 'Профиль и публикации',
    regular: 'Базовый профиль, звиты и ответы',
    premium: 'Расширенный профиль и будущие инструменты оформления',
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
  <section id={id} className="border-b border-x-border/70 bg-x-bg/20 px-4 py-5 sm:px-6">
    <div className="mb-5 max-w-xl">
      <h2 className="text-lg font-black text-x-text">{title}</h2>
      {description && <p className="mt-1 text-sm text-x-muted">{description}</p>}
    </div>
    <div className="max-w-xl">{children}</div>
  </section>
);

const Field = ({ label, type = 'text', value, onChange, placeholder, hint, maxLength }) => (
  <label className="mb-4 block">
    <span className="mb-1.5 block text-sm font-semibold text-x-muted">{label}</span>
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      maxLength={maxLength}
      className="input-field"
    />
    {hint && <span className="mt-1.5 block text-xs text-x-muted">{hint}</span>}
  </label>
);

const TextAreaField = ({ label, value, onChange, placeholder, hint, maxLength }) => (
  <label className="mb-4 block">
    <span className="mb-1.5 block text-sm font-semibold text-x-muted">{label}</span>
    <textarea
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      maxLength={maxLength}
      rows={4}
      className="input-field resize-none"
    />
    {hint && <span className="mt-1.5 block text-xs text-x-muted">{hint}</span>}
  </label>
);

const SecurityRow = ({ title, description, children }) => (
  <div className="flex flex-col gap-3 border-b border-x-border/60 py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between">
    <div className="min-w-0">
      <h3 className="font-bold text-x-text">{title}</h3>
      <p className="mt-1 text-sm text-x-muted">{description}</p>
    </div>
    <div className="flex-shrink-0">{children}</div>
  </div>
);

const FutureBadge = ({ children = 'Скоро' }) => (
  <span className="inline-flex items-center rounded-full border border-cyan-300/35 bg-cyan-300/10 px-3 py-1 text-xs font-black uppercase tracking-normal text-x-accent">
    {children}
  </span>
);

export default function SettingsPage() {
  const { user, updateUser, logout } = useAuthStore();
  const navigate = useNavigate();

  const [profile, setProfile] = useState({
    displayName: user?.displayName || '',
    bio: user?.bio || '',
  });
  const [username, setUsername] = useState(user?.username || '');
  const [emailData, setEmailData] = useState({ newEmail: '', currentPassword: '' });
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [deleteData, setDeleteData] = useState({ currentPassword: '', confirm: '' });
  const [billing, setBilling] = useState('month');
  const [loading, setLoading] = useState({
    profile: false,
    username: false,
    email: false,
    password: false,
    delete: false,
  });

  const activeEmail = useMemo(() => user?.email || 'email не указан', [user?.email]);
  const setLoad = (key, val) => setLoading((l) => ({ ...l, [key]: val }));

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
      updateUser({ email: data.email });
      setEmailData({ newEmail: '', currentPassword: '' });
      toast.success('Email изменён');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Ошибка');
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
    toast('Оплата подписки скоро появится. Сейчас это витрина будущего тарифа.');
  };

  const showTwoFactorNotice = () => {
    toast('2FA добавлена в настройки как будущая функция. Реальное включение сделаем отдельным шагом.');
  };

  const subscriptionPrice = billing === 'year' ? '2 990 ₽ / год' : '299 ₽ / месяц';

  return (
    <div className="min-h-full bg-x-bg/10">
      <div className="cosmic-header px-4 py-3 sm:px-5">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="panel-icon-button h-10 w-10 flex-shrink-0"
            aria-label="Назад"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
              <path d="M20 11H7.414l4.293-4.293-1.414-1.414L3.586 12l6.707 6.707 1.414-1.414L7.414 13H20v-2z" />
            </svg>
          </button>
          <div className="min-w-0">
            <p className="nebula-section-heading">Account Control</p>
            <h1 className="text-xl font-black tracking-normal">Настройки</h1>
          </div>
        </div>
      </div>

      <div className="border-b border-x-border/70 bg-x-panel/20 px-4 py-4 sm:px-6">
        <div className="flex flex-wrap gap-2">
          {settingsSections.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="nebula-pill">
              {label}
            </a>
          ))}
        </div>
      </div>

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
        <button onClick={saveProfile} disabled={loading.profile} className="btn-accent px-5 py-2 text-sm">
          {loading.profile ? 'Сохраняем...' : 'Сохранить профиль'}
        </button>
      </Section>

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
          onClick={saveUsername}
          disabled={loading.username || username === user?.username}
          className="btn-accent px-5 py-2 text-sm"
        >
          {loading.username ? 'Меняем...' : 'Изменить никнейм'}
        </button>
      </Section>

      <Section
        id="email"
        title="Email"
        description={`Текущий email: ${activeEmail}`}
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
        <button onClick={saveEmail} disabled={loading.email} className="btn-accent px-5 py-2 text-sm">
          {loading.email ? 'Меняем...' : 'Изменить email'}
        </button>
      </Section>

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
        <button onClick={savePassword} disabled={loading.password} className="btn-accent px-5 py-2 text-sm">
          {loading.password ? 'Меняем...' : 'Изменить пароль'}
        </button>
      </Section>

      <Section
        id="security"
        title="Безопасность аккаунта"
        description="Настройки входа, подтверждения почты и восстановления доступа."
      >
        <div className="rounded-3xl border border-x-border/75 bg-x-panel/50 px-4 shadow-panel">
          <SecurityRow
            title="Двухфакторная аутентификация"
            description="Дополнительный код при входе. Пока это только место под будущую настройку, реальная защита ещё не активируется."
          >
            <button
              type="button"
              onClick={showTwoFactorNotice}
              className="flex min-w-32 items-center justify-between gap-3 rounded-full border border-x-border bg-x-bg/70 px-2 py-1.5 text-sm font-bold text-x-muted transition hover:border-cyan-300/45 hover:text-x-text"
              aria-label="Двухфакторная аутентификация скоро появится"
            >
              <span className="px-2">Выкл</span>
              <span className="h-7 w-12 rounded-full border border-x-border bg-slate-950 p-0.5">
                <span className="block h-5 w-5 rounded-full bg-x-muted/70" />
              </span>
            </button>
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
              className="rounded-full border border-cyan-300/45 px-4 py-2 text-sm font-black uppercase tracking-wide text-x-accent transition hover:bg-cyan-300/10"
            >
              Сбросить
            </button>
          </SecurityRow>
        </div>
      </Section>

      <Section
        id="subscription"
        title="Подписка Zwiteer Plus"
        description="Здесь будет покупка подписки. Возможности будут расширяться постепенно, поэтому блок сразу сделан как сравнение тарифов."
      >
        <div className="overflow-hidden rounded-3xl border border-cyan-300/25 bg-x-panel/60 shadow-panel">
          <div className="border-b border-x-border/70 bg-gradient-to-r from-cyan-300/12 via-x-panel to-blue-500/15 p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="nebula-section-heading">Zwiteer Plus</p>
                <h3 className="mt-2 text-2xl font-black text-x-text">{subscriptionPrice}</h3>
                <p className="mt-1 text-sm text-x-muted">
                  Будущие расширенные возможности аккаунта в одном тарифе.
                </p>
              </div>
              <div className="flex rounded-full border border-x-border bg-x-bg/60 p-1">
                <button
                  type="button"
                  onClick={() => setBilling('month')}
                  className={`rounded-full px-3 py-1.5 text-sm font-bold transition ${billing === 'month' ? 'bg-x-accent text-slate-950 shadow-neon' : 'text-x-muted hover:text-x-text'}`}
                >
                  Месяц
                </button>
                <button
                  type="button"
                  onClick={() => setBilling('year')}
                  className={`rounded-full px-3 py-1.5 text-sm font-bold transition ${billing === 'year' ? 'bg-x-accent text-slate-950 shadow-neon' : 'text-x-muted hover:text-x-text'}`}
                >
                  Год
                </button>
              </div>
            </div>
            <button type="button" onClick={buySubscription} className="btn-accent mt-4 px-5 py-2 text-sm">
              Купить подписку
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-x-border/70 text-xs uppercase tracking-[0.16em] text-x-muted">
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
          onClick={deleteAccount}
          disabled={loading.delete}
          className="rounded-full border border-x-danger/45 bg-x-danger/10 px-5 py-2 text-sm font-black text-x-danger transition hover:bg-x-danger/15"
        >
          {loading.delete ? 'Удаляем...' : 'Удалить аккаунт'}
        </button>
      </Section>
    </div>
  );
}
