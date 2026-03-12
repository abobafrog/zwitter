// src/pages/LoginPage.jsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import useAuthStore from '../store/authStore';


const Check = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current text-green-500 flex-shrink-0">
    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
  </svg>
);

const Cross = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current text-red-500 flex-shrink-0">
    <path d="M18.3 5.71a1 1 0 00-1.41 0L12 10.59 7.11 5.7A1 1 0 005.7 7.11L10.59 12 5.7 16.89a1 1 0 001.41 1.41L12 13.41l4.89 4.89a1 1 0 001.41-1.41L13.41 12l4.89-4.89a1 1 0 000-1.4z" />
  </svg>
);

const Spinner = () => (
  <div className="w-4 h-4 border-2 border-x-muted border-t-transparent rounded-full animate-spin flex-shrink-0" />
);

export default function LoginPage() {
  const [form, setForm] = useState({ login: '', password: '' });
  const [touched, setTouched] = useState({ login: false, password: false });
  const { login, isLoading } = useAuthStore();
  const navigate = useNavigate();

  const handleChange = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    setTouched((t) => ({ ...t, [field]: true }));
  };

  // Проверяем существует ли пользователь — запрос идёт когда введено 3+ символов
  const loginValue = form.login.trim();
  const { data: checkData, isFetching: isChecking } = useQuery({
    queryKey: ['check-user', loginValue],
    queryFn: () => api.get(`/auth/check-user?login=${loginValue}`).then((r) => r.data),
    enabled: loginValue.length >= 3,
    staleTime: 5000,
    retry: false,
  });

  const userExists = loginValue.length >= 3 ? checkData?.exists : null;
  const showLoginIndicator = touched.login && loginValue.length >= 3 && !isChecking;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched({ login: true, password: true });

    if (!form.login || !form.password) {
      toast.error('Заполните все поля');
      return;
    }

    const result = await login(form.login, form.password);
    if (result.success) {
      toast.success('Добро пожаловать!');
      navigate('/home');
    } else {
      // Определяем тип ошибки
      const err = result.error || '';
      if (err.includes('пароль') || err.includes('password') || err.includes('неверн')) {
        toast.error('Неверный пароль');
      } else if (err.includes('не найден') || err.includes('логин')) {
        toast.error('Пользователь не найден');
      } else {
        toast.error(err || 'Ошибка входа');
      }
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-8 py-12">
      <div className="w-full max-w-sm">


        <h1 className="text-4xl font-black mb-8">Войти в Zwiteer</h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">

          {/* Поле логина с проверкой существования */}
          <div>
            <label className="block text-sm text-x-muted mb-1.5">Никнейм</label>
            <div className="relative flex items-center">
              <input
                type="text"
                value={form.login}
                onChange={handleChange('login')}
                placeholder="email@example.com"
                className={`input-field pr-10 ${
                  touched.login && loginValue.length >= 3 && !isChecking
                    ? userExists
                      ? 'border-green-500 focus:border-green-500'
                      : 'border-red-500 focus:border-red-500'
                    : ''
                }`}
                autoComplete="username"
              />
              {/* Иконка справа */}
              <span className="absolute right-3">
                {touched.login && loginValue.length >= 3 && (
                  isChecking
                    ? <Spinner />
                    : userExists
                      ? <Check />
                      : <Cross />
                )}
              </span>
            </div>

            {/* Подсказка под полем */}
            {showLoginIndicator && (
              <p className={`mt-1.5 flex items-center gap-1.5 text-xs ${userExists ? 'text-green-500' : 'text-red-400'}`}>
                {userExists ? <Check /> : <Cross />}
                {userExists ? 'Пользователь найден' : 'Пользователь не найден'}
              </p>
            )}
          </div>

          {/* Поле пароля — без галочки */}
          <div>
            <label className="block text-sm text-x-muted mb-1.5">Пароль</label>
            <input
              type="password"
              value={form.password}
              onChange={handleChange('password')}
              placeholder="zzz••••••••"
              className="input-field"
              autoComplete="current-password"
            />
          </div>

          <button type="submit" disabled={isLoading} className="btn-primary py-3 mt-2">
            {isLoading ? 'Входим...' : 'Войти'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-x-muted">
            Нет аккаунта?{' '}
            <Link to="/register" className="text-x-accent hover:underline font-semibold">
              Зарегистрироваться
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}