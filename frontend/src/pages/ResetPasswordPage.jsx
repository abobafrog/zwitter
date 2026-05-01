import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [loading, setLoading] = useState(false);
  const token = params.get('token');

  const submit = async (event) => {
    event.preventDefault();
    if (!token) {
      toast.error('В ссылке нет токена восстановления');
      return;
    }
    if (form.password.length < 6 || !/\d/.test(form.password)) {
      toast.error('Пароль минимум 6 символов и 1 цифра');
      return;
    }
    if (form.password !== form.confirm) {
      toast.error('Пароли не совпадают');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, password: form.password });
      toast.success('Пароль обновлён');
      navigate('/login', { replace: true });
    } catch (error) {
      toast.error(error.response?.data?.error || 'Не удалось обновить пароль');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="cosmic-auth">
      <div className="cosmic-auth-card">
        <p className="nebula-section-heading">Zwiteer Security</p>
        <h1 className="mb-4 text-3xl font-black text-x-text">Новый пароль</h1>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <label>
            <span className="mb-1.5 block text-sm font-semibold text-x-muted">Новый пароль</span>
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              placeholder="Новый пароль"
              className="input-field"
              autoComplete="new-password"
            />
          </label>
          <label>
            <span className="mb-1.5 block text-sm font-semibold text-x-muted">Повторите пароль</span>
            <input
              type="password"
              value={form.confirm}
              onChange={(event) => setForm((current) => ({ ...current, confirm: event.target.value }))}
              placeholder="Повторите пароль"
              className="input-field"
              autoComplete="new-password"
            />
          </label>
          <button type="submit" disabled={loading} className="btn-primary py-3">
            {loading ? 'Сохраняем...' : 'Сохранить пароль'}
          </button>
        </form>
        <div className="mt-6 text-center">
          <Link to="/login" className="font-semibold text-x-accent hover:underline">
            Вернуться ко входу
          </Link>
        </div>
      </div>
    </div>
  );
}
