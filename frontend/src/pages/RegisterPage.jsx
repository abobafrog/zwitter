// src/pages/RegisterPage.jsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import {useEffect } from 'react';
import api from '../services/api';

// Задержка чтобы не спамить запросами при каждом символе
const useDebounce = (value, delay = 600) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
};

const XLogo = () => (
  <svg viewBox="0 0 24 24" className="w-10 h-10 fill-current">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.74l7.73-8.835L1.254 2.25H8.08l4.259 5.631zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

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

const rules = {
  displayName: [
    { id: 'len', label: 'Минимум 2 символа', test: (v) => v.length >= 2 },
  ],
  username: [
    { id: 'len', label: 'От 3 до 50 символов', test: (v) => v.length >= 3 && v.length <= 50 },
    { id: 'chars', label: 'Только латиница, цифры и _', test: (v) => /^[a-zA-Z0-9_]+$/.test(v) },
  ],
  email: [
    { id: 'format', label: 'Корректный email', test: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) },
  ],
  password: [
    { id: 'len', label: 'Минимум 6 символов', test: (v) => v.length >= 6 },
    { id: 'digit', label: 'Минимум одна цифра', test: (v) => /\d/.test(v) },
  ],
};

function ValidatedInput({ label, type = 'text', value, onChange, fieldKey, placeholder, prefix, touched, serverError }) {
  const fieldRules = rules[fieldKey] || [];
  const rulesPassed = fieldRules.every((r) => r.test(value));
  const allPassed = rulesPassed && !serverError;
  const showIndicator = touched && value.length > 0;

  return (
    <div>
      <label className="block text-sm text-x-muted mb-1.5">{label}</label>
      <div className="relative flex items-center">
        {prefix && (
          <span className="absolute left-3 text-x-muted select-none">{prefix}</span>
        )}
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={type === 'password' ? 'new-password' : 'off'}
          className={`input-field pr-10 ${prefix ? 'pl-7' : ''} ${
            showIndicator
              ? allPassed
                ? 'border-green-500 focus:border-green-500'
                : 'border-red-500 focus:border-red-500'
              : ''
          }`}
        />
        {showIndicator && (
          <span className="absolute right-3">
            {allPassed ? <Check /> : <Cross />}
          </span>
        )}
      </div>

      {/* Ошибки правил валидации */}
      {touched && value.length > 0 && !rulesPassed && (
        <ul className="mt-1.5 flex flex-col gap-0.5">
          {fieldRules.map((rule) => {
            const passed = rule.test(value);
            return (
              <li key={rule.id} className={`flex items-center gap-1.5 text-xs ${passed ? 'text-green-500' : 'text-red-400'}`}>
                {passed ? <Check /> : <Cross />}
                <span>{rule.label}</span>
              </li>
            );
          })}
        </ul>
      )}

      {/* Ошибка с сервера (занят никнейм/email) */}
      {showIndicator && serverError && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-red-400">
          <Cross />
          {serverError}
        </p>
      )}
    </div>
  );
}

export default function RegisterPage() {
  const [form, setForm] = useState({ username: '', email: '', password: '', displayName: '' });
  const [touched, setTouched] = useState({ username: false, email: false, password: false, displayName: false });
  const { register, isLoading } = useAuthStore();
  const navigate = useNavigate();
  const debouncedUsername = useDebounce(form.username);
const debouncedEmail = useDebounce(form.email);
const [serverErrors, setServerErrors] = useState({ username: null, email: null });

// Проверяем никнейм на сервере
useEffect(() => {
  if (!form.username || form.username.length < 3) {
    setServerErrors((p) => ({ ...p, username: null }));
    return;
  }
  api.get(`/auth/check?username=${form.username.toLowerCase()}`)
    .then(({ data }) => {
      setServerErrors((p) => ({
        ...p,
        username: data.usernameTaken ? 'Этот никнейм уже занят' : null,
      }));
    })
    .catch(() => {});
}, [debouncedUsername]);

// Проверяем email на сервере
useEffect(() => {
  if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    setServerErrors((p) => ({ ...p, email: null }));
    return;
  }
  api.get(`/auth/check?email=${form.email.toLowerCase()}`)
    .then(({ data }) => {
      setServerErrors((p) => ({
        ...p,
        email: data.emailTaken ? 'Эта почта уже зарегистрирован' : null,
      }));
    })
    .catch(() => {});
}, [debouncedEmail]);

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const isFormValid = Object.keys(rules).every((field) =>
    rules[field].every((rule) => rule.test(form[field] || ''))
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched({ username: true, email: true, password: true, displayName: true });

    if (!isFormValid) {
      toast.error('Исправь ошибки в форме');
      return;
    }

    const result = await register(form);
    if (result.success) {
      toast.success('Аккаунт создан! Добро пожаловать!');
      navigate('/home');
    } else {
      const err = result.error || '';
      console.log('Ошибка с сервера:', err); // временно для отладки
    
      if (err.includes('email') || err.includes('Email')) {
        toast.error('Эта почта уже зарегистрирован');
      } else if (err.includes('username') || err.includes('никнейм') || err.includes('Никнейм')) {
        toast.error('Этот никнейм уже занят');
      } else {
        toast.error(err || 'Ошибка регистрации');
      }
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-8 py-12">
      <div className="w-full max-w-sm">
        
        <h1 className="text-3xl font-black mb-6">Создать аккаунт в Zwiteer</h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <ValidatedInput label="Отображаемое имя" value={form.displayName}
            onChange={handleChange('displayName')} fieldKey="displayName"
            placeholder="Иван Иванов" touched={touched.displayName} />

          <ValidatedInput label="Никнейм" value={form.username}
            onChange={handleChange('username')} fieldKey="username"
            placeholder="username" prefix="@" touched={touched.username} serverError={serverErrors.username} /> 

          <ValidatedInput label="Почта" type="email" value={form.email}
            onChange={handleChange('email')} fieldKey="email"
            placeholder="email@example.com" touched={touched.email} serverError={serverErrors.email} />

          <ValidatedInput label="Пароль" type="password" value={form.password}
            onChange={handleChange('password')} fieldKey="password"
            placeholder="••••••••" touched={touched.password} />

          <button type="submit" disabled={isLoading} className="btn-primary py-3 mt-2">
            {isLoading ? 'Создаём...' : 'Создать аккаунт'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-x-muted">
            Уже есть аккаунт?{' '}
            <Link to="/login" className="text-x-accent hover:underline font-semibold">Войти</Link>
          </p>
        </div>
      </div>
    </div>
  );
}