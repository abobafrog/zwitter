import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../services/api';
import TweetCard from '../components/chat/TweetCard';
import NavIcon from '../components/layout/NavIcon';

function UserOrbitCard({ user, variant = 'user' }) {
  const navigate = useNavigate();
  const isCommunity = variant === 'community' || user.isCommunity;

  return (
    <button
      type="button"
      onClick={() => navigate(isCommunity ? `/community/${user.username}` : `/${user.username}`)}
      className={`nebula-card rounded-3xl p-4 text-left transition hover:border-cyan-300/45 hover:bg-cyan-300/10 ${
        isCommunity ? 'border-cyan-300/35 bg-cyan-300/[0.06]' : ''
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`h-12 w-12 flex-shrink-0 cosmic-avatar ${isCommunity ? 'rounded-2xl' : 'rounded-full'}`}>
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt={user.displayName} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center font-black">
              {user.displayName?.[0]?.toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <p className="truncate font-black">{user.displayName}</p>
            {user.isVerified && <span className="h-2 w-2 rounded-full bg-x-accent shadow-neon" />}
          </div>
          <p className="truncate text-sm text-x-muted">
            @{user.username} {isCommunity ? '· сообщество' : ''}
          </p>
        </div>
      </div>
      {user.bio && <p className="mt-3 line-clamp-2 text-sm text-x-muted">{user.bio}</p>}
      <div className="mt-3 flex gap-3 text-xs text-x-muted">
        <span><strong className="text-x-text">{user._count?.followers || 0}</strong> {isCommunity ? 'участников' : 'подписчиков'}</span>
        <span><strong className="text-x-text">{user._count?.tweets || 0}</strong> {isCommunity ? 'записей' : 'постов'}</span>
      </div>
    </button>
  );
}

function CreateCommunityModal({ onClose }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', slug: '', bio: '' });

  const mutation = useMutation({
    mutationFn: () => api.post('/communities', form),
    onSuccess: ({ data }) => {
      qc.invalidateQueries({ queryKey: ['communities'] });
      qc.invalidateQueries({ queryKey: ['explore'] });
      toast.success('Сообщество создано');
      onClose();
      navigate(`/community/${data.community.slug}`);
    },
    onError: (err) => toast.error(err.response?.data?.error || err.response?.data?.details?.[0]?.message || 'Не удалось создать сообщество'),
  });

  const update = (field) => (event) => {
    const value = field === 'slug'
      ? event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '')
      : event.target.value;
    setForm((current) => ({ ...current, [field]: value }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-x-bg/80 px-4 backdrop-blur-xl" onClick={onClose}>
      <form
        onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}
        className="nebula-card w-full max-w-md rounded-3xl p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-black">Создать сообщество</h2>
          <button type="button" onClick={onClose} className="panel-icon-button" aria-label="Закрыть">
            <NavIcon name="close" className="h-4 w-4" />
          </button>
        </div>
        <div className="grid gap-3">
          <label className="grid gap-1.5 text-sm font-bold">
            Название
            <input value={form.name} onChange={update('name')} className="input-field" placeholder="Например, Product Club" maxLength={100} />
          </label>
          <label className="grid gap-1.5 text-sm font-bold">
            Адрес
            <input value={form.slug} onChange={update('slug')} className="input-field" placeholder="product_club" maxLength={50} />
          </label>
          <label className="grid gap-1.5 text-sm font-bold">
            Описание
            <textarea value={form.bio} onChange={update('bio')} className="input-field min-h-24 resize-none" placeholder="О чем это сообщество" maxLength={180} />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-outline px-4 py-2 text-sm" onClick={onClose}>Отмена</button>
          <button type="submit" className="btn-accent px-4 py-2 text-sm" disabled={mutation.isPending || !form.name.trim() || form.slug.length < 3}>
            {mutation.isPending ? 'Создаю...' : 'Создать'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function ExplorePage({ mode = 'explore' }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const isCommunities = mode === 'communities';
  const currentFilter = searchParams.get('q') || '';
  const [draft, setDraft] = useState(currentFilter);
  const [createOpen, setCreateOpen] = useState(false);

  const endpoint = useMemo(() => {
    if (isCommunities) {
      const params = new URLSearchParams();
      if (currentFilter) params.set('q', currentFilter);
      const query = params.toString();
      return `/communities${query ? `?${query}` : ''}`;
    }
    const params = new URLSearchParams();
    if (currentFilter) params.set('q', currentFilter);
    const query = params.toString();
    return `/tweets/explore${query ? `?${query}` : ''}`;
  }, [currentFilter, isCommunities]);

  const { data, isLoading } = useQuery({
    queryKey: [isCommunities ? 'communities' : 'explore', currentFilter],
    queryFn: () => api.get(endpoint).then((r) => r.data),
    staleTime: 20000,
  });

  const setFilter = (value) => {
    setDraft(value);
    if (!value) {
      setSearchParams({});
      return;
    }
    setSearchParams({ q: value });
  };

  const submitSearch = (event) => {
    event.preventDefault();
    setFilter(draft.trim());
  };

  const title = isCommunities ? 'Сообщества' : 'Обзор';
  const subtitle = isCommunities ? 'паблики и клубы' : 'поиск и рекомендации';
  const discoveryUsers = isCommunities ? (data?.communities || []) : (data?.users || []);

  return (
    <div className="min-h-full">
      <div className="cosmic-header px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="nebula-section-heading">{subtitle}</p>
            <h1 className="text-xl font-black tracking-normal">{title}</h1>
          </div>
          <form onSubmit={submitSearch} className="relative w-full sm:max-w-xs">
            <NavIcon name="search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-x-muted" />
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={isCommunities ? 'Найти сообщество' : 'Найти в обзоре'}
              className="input-field pl-10"
            />
          </form>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-x-accent border-t-transparent" />
        </div>
      ) : (
        <>
          <section className="border-b border-x-border/80 bg-x-panel/25 p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-black">{isCommunities ? (currentFilter ? 'Найденные сообщества' : 'Популярные сообщества') : 'Кого читать'}</h2>
              {isCommunities && (
                <button type="button" onClick={() => setCreateOpen(true)} className="text-sm font-bold text-x-accent hover:text-x-accent-hover">
                  Создать
                </button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {discoveryUsers.slice(0, isCommunities ? 8 : 4).map((user) => (
                <UserOrbitCard key={user.id} user={user} variant={isCommunities ? 'community' : 'user'} />
              ))}
            </div>
            {discoveryUsers.length === 0 && (
              <div className="rounded-3xl border border-x-border/70 bg-x-bg/25 px-5 py-10 text-center">
                <p className="text-lg font-black text-x-text">Сообщества не найдены</p>
                <p className="mt-1 text-sm text-x-muted">Попробуй другое название или создай новое сообщество.</p>
              </div>
            )}
          </section>

          {!isCommunities && (
            <div className="py-4">
              {(data?.tweets || []).length > 0 ? (
                data.tweets.map((tweet) => <TweetCard key={tweet.id} tweet={tweet} queryKey={['explore', currentFilter]} />)
            ) : (
              <div className="px-8 py-16 text-center text-x-muted">
                <p className="text-lg font-black text-x-text">Пока ничего не найдено</p>
                <p className="mt-1 text-sm">Попробуй другой запрос или вернись ко всем постам.</p>
              </div>
            )}
            </div>
          )}
        </>
      )}
      {createOpen && <CreateCommunityModal onClose={() => setCreateOpen(false)} />}
    </div>
  );
}
