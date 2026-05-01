import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Введите корректный email');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
      toast.success('Проверь почту');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Не удалось отправить письмо');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="cosmic-auth">
      <div className="cosmic-auth-card">
        <p className="nebula-section-heading">Zwiteer Security</p>
        <h1 className="mb-4 text-3xl font-black text-x-text">Восстановление пароля</h1>
        {sent ? (
          <div className="rounded-3xl border border-cyan-300/30 bg-cyan-300/10 p-5 text-sm text-x-muted">
            <p className="font-bold text-x-text">Если такой email зарегистрирован, письмо уже отправлено.</p>
            <p className="mt-2">Открой ссылку из письма и задай новый пароль.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <label>
              <span className="mb-1.5 block text-sm font-semibold text-x-muted">Email аккаунта</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="email@example.com"
                className="input-field"
                autoComplete="email"
              />
            </label>
            <button type="submit" disabled={loading} className="btn-primary py-3">
              {loading ? 'Отправляем...' : 'Отправить ссылку'}
            </button>
          </form>
        )}
        <div className="mt-6 text-center">
          <Link to="/login" className="font-semibold text-x-accent hover:underline">
            Вернуться ко входу
          </Link>
        </div>
      </div>
    </div>
  );
}
