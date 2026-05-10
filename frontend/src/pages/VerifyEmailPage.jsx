import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';

export default function VerifyEmailPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialEmail = useMemo(
    () => location.state?.verificationEmail || params.get('email') || '',
    [location.state?.verificationEmail, params]
  );
  const [form, setForm] = useState({ email: initialEmail, code: '' });
  const [devCode, setDevCode] = useState(location.state?.devVerificationCode || '');
  const [loading, setLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [verified, setVerified] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    const email = form.email.trim();
    const code = form.code.trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Введите корректный email');
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      toast.error('Код должен состоять из 6 цифр');
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post('/auth/verify-email', { email, code });
      setVerified(true);
      toast.success(data.message || 'Email подтверждён');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Код не подошёл');
    } finally {
      setLoading(false);
    }
  };

  const resendVerification = async () => {
    const email = form.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Введите email, куда отправить код');
      return;
    }

    setIsResending(true);
    try {
      const { data } = await api.post('/auth/resend-verification', { email });
      if (data.devVerificationCode) {
        setDevCode(data.devVerificationCode);
        setForm((prev) => ({ ...prev, code: data.devVerificationCode }));
      }
      toast.success('Если email не подтверждён, новый код отправлен');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Не удалось отправить код');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="cosmic-auth">
      <div className="cosmic-auth-card">
        <p className="nebula-section-heading">Zwiteer Security</p>
        <h1 className="mb-4 text-3xl font-black text-x-text">Подтверждение email</h1>

        {verified ? (
          <div className="rounded-3xl border border-cyan-300/30 bg-cyan-300/10 p-5 text-sm text-x-muted">
            <p className="font-bold text-x-text">Email подтверждён.</p>
            <p className="mt-2">Теперь можно войти в аккаунт Zwiteer.</p>
            <button
              type="button"
              onClick={() => navigate('/login', { replace: true })}
              className="btn-primary mt-5 w-full py-3"
            >
              Перейти ко входу
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <p className="rounded-3xl border border-x-border bg-x-panel/60 p-4 text-sm text-x-muted">
              Мы отправляем на почту одноразовый код. Введи его здесь, чтобы активировать аккаунт.
            </p>
            {devCode && (
              <button
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, code: devCode }))}
                className="rounded-3xl border border-amber-300/30 bg-amber-300/10 p-4 text-left text-sm font-bold text-amber-100"
              >
                Dev-код для локального запуска: {devCode}
              </button>
            )}
            <label>
              <span className="mb-1.5 block text-sm font-semibold text-x-muted">Email</span>
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="email@example.com"
                className="input-field"
                autoComplete="email"
              />
            </label>
            <label>
              <span className="mb-1.5 block text-sm font-semibold text-x-muted">Код из письма</span>
              <input
                type="text"
                value={form.code}
                onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value.replace(/\D/g, '').slice(0, 6) }))}
                placeholder="123456"
                className="input-field text-center text-2xl font-black tracking-[0.3em]"
                inputMode="numeric"
                autoComplete="one-time-code"
              />
            </label>
            <button type="submit" disabled={loading} className="btn-primary py-3">
              {loading ? 'Проверяем...' : 'Подтвердить'}
            </button>
            <button
              type="button"
              onClick={resendVerification}
              disabled={isResending}
              className="rounded-full border border-x-border px-4 py-3 text-sm font-bold text-x-accent transition hover:border-cyan-300/50 hover:bg-cyan-300/10 disabled:opacity-60"
            >
              {isResending ? 'Отправляем...' : 'Отправить код ещё раз'}
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
