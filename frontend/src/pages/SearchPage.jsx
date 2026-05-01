import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import TweetCard from '../components/chat/TweetCard';
import NavIcon from '../components/layout/NavIcon';

function UserResult({ user }) {
  const navigate = useNavigate();

  return (
    <button type="button" onClick={() => navigate(`/${user.username}`)} className="flex w-full items-center gap-3 rounded-3xl border border-x-border/70 bg-x-panel/45 p-4 text-left transition hover:border-cyan-300/45 hover:bg-cyan-300/10">
      <div className="h-12 w-12 flex-shrink-0 rounded-full cosmic-avatar">
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt={user.displayName} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-black">
            {user.displayName?.[0]?.toUpperCase()}
          </div>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate font-black">{user.displayName}</p>
        <p className="truncate text-sm text-x-muted">@{user.username}</p>
      </div>
    </button>
  );
}

function CommunityResult({ community }) {
  const navigate = useNavigate();

  return (
    <button type="button" onClick={() => navigate(`/community/${community.username}`)} className="flex w-full items-center gap-3 rounded-3xl border border-cyan-300/30 bg-cyan-300/[0.06] p-4 text-left transition hover:border-cyan-300/50 hover:bg-cyan-300/10">
      <div className="h-12 w-12 flex-shrink-0 rounded-2xl cosmic-avatar">
        {community.avatarUrl ? (
          <img src={community.avatarUrl} alt={community.displayName} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-black">
            {community.displayName?.[0]?.toUpperCase()}
          </div>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate font-black">{community.displayName}</p>
        <p className="truncate text-sm text-x-muted">@{community.username} · сообщество</p>
      </div>
    </button>
  );
}

function PopularCard({ item, type }) {
  const navigate = useNavigate();
  const isCommunity = type === 'community';
  const title = isCommunity ? item.displayName || item.name : item.displayName;
  const handleClick = () => navigate(isCommunity ? `/community/${item.username || item.slug}` : `/${item.username}`);

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-48 flex-none rounded-3xl border border-x-border/70 bg-x-panel/50 p-4 text-left transition hover:border-cyan-300/45 hover:bg-cyan-300/10"
    >
      <div className={`mb-3 h-14 w-14 cosmic-avatar ${isCommunity ? 'rounded-2xl' : 'rounded-full'}`}>
        {item.avatarUrl ? (
          <img src={item.avatarUrl} alt={title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xl font-black">
            {title?.[0]?.toUpperCase()}
          </div>
        )}
      </div>
      <p className="truncate font-black text-x-text">{title}</p>
      <p className="truncate text-sm text-x-muted">@{item.username}</p>
      <p className="mt-2 text-xs font-bold text-x-muted">
        {isCommunity
          ? `${item._count?.members || item._count?.followers || 0} участников`
          : `${item._count?.followers || 0} подписчиков`}
      </p>
    </button>
  );
}

function PopularSection({ users, communities }) {
  if (!users.length && !communities.length) return null;

  return (
    <section className="border-b border-x-border/70 px-4 py-5 sm:px-5">
      <div className="mb-3">
        <p className="nebula-section-heading">рекомендации</p>
        <h2 className="text-lg font-black text-x-text">Популярное</h2>
      </div>
      {communities.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-sm font-black uppercase tracking-[0.12em] text-x-muted">Сообщества</h3>
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:-mx-5 sm:px-5">
            {communities.map((community) => (
              <PopularCard key={community.id} item={community} type="community" />
            ))}
          </div>
        </div>
      )}
      {users.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-black uppercase tracking-[0.12em] text-x-muted">Аккаунты</h3>
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:-mx-5 sm:px-5">
            {users.map((user) => (
              <PopularCard key={user.id} item={user} type="user" />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const [draft, setDraft] = useState(initialQuery);
  const query = initialQuery.trim();
  const hasQuery = query.length > 0;

  useEffect(() => {
    setDraft(initialQuery);
  }, [initialQuery]);

  const usersQuery = useQuery({
    queryKey: ['page-search-users', query],
    queryFn: () => api.get(`/users/search?q=${encodeURIComponent(query)}&includeSelf=1`).then((r) => r.data.users),
    enabled: hasQuery,
    staleTime: 5000,
  });

  const tweetsQuery = useQuery({
    queryKey: ['page-search-tweets', query],
    queryFn: () => api.get(`/tweets/search?q=${encodeURIComponent(query)}`).then((r) => r.data.tweets),
    enabled: hasQuery,
    staleTime: 5000,
  });

  const communitiesQuery = useQuery({
    queryKey: ['page-search-communities', query],
    queryFn: () => api.get(`/communities?q=${encodeURIComponent(query)}`).then((r) => r.data.communities),
    enabled: hasQuery,
    staleTime: 5000,
  });

  const popularQuery = useQuery({
    queryKey: ['search-popular'],
    queryFn: () => api.get('/tweets/explore').then((r) => r.data),
    staleTime: 30000,
  });

  const submitSearch = (event) => {
    event.preventDefault();
    const next = draft.trim();
    setSearchParams(next ? { q: next } : {});
  };

  const users = usersQuery.data || [];
  const tweets = tweetsQuery.data || [];
  const communities = communitiesQuery.data || [];
  const popularUsers = popularQuery.data?.users || [];
  const popularCommunities = popularQuery.data?.communities || [];
  const isLoading = usersQuery.isLoading || tweetsQuery.isLoading || communitiesQuery.isLoading;
  const hasResults = users.length > 0 || tweets.length > 0 || communities.length > 0;

  return (
    <div className="min-h-full">
      <div className="cosmic-header px-4 py-3 sm:px-5">
        <div className="mb-4">
          <p className="nebula-section-heading">глобальный поиск</p>
          <h1 className="flex items-center gap-2 text-xl font-black tracking-normal">
            <NavIcon name="search" className="h-5 w-5 text-x-accent" />
            Поиск
          </h1>
        </div>
        <form onSubmit={submitSearch} className="relative">
          <NavIcon name="search" className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-x-muted" />
          <input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Найти пользователей, посты или сообщества"
            className="input-field py-4 pl-12 text-lg"
          />
        </form>
      </div>

      <PopularSection users={popularUsers} communities={popularCommunities} />

      {!hasQuery ? (
        <div className="px-8 py-12 text-center text-x-muted">
          <p className="text-lg font-black text-x-text">Введите запрос</p>
          <p className="mt-1 text-sm">Поиск покажет пользователей, сообщества и посты.</p>
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-x-accent border-t-transparent" />
        </div>
      ) : hasResults ? (
        <div className="grid gap-5 p-4 sm:p-5">
          {users.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-black">Люди</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {users.map((user) => <UserResult key={user.id} user={user} />)}
              </div>
            </section>
          )}

          {communities.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-black">Сообщества</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {communities.map((community) => <CommunityResult key={community.id} community={community} />)}
              </div>
            </section>
          )}

          {tweets.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-black">Посты</h2>
              <div className="-mx-4 sm:-mx-5">
                {tweets.map((tweet) => <TweetCard key={tweet.id} tweet={tweet} queryKey={['page-search-tweets', query]} />)}
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="px-8 py-16 text-center text-x-muted">
          <p className="text-lg font-black text-x-text">Ничего не найдено</p>
          <p className="mt-1 text-sm">Попробуй другой запрос.</p>
        </div>
      )}
    </div>
  );
}
