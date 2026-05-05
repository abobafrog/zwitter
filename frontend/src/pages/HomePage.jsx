// src/pages/HomePage.jsx
import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import api from '../services/api';
import TweetCard from '../components/chat/TweetCard';
import TweetComposer from '../components/chat/TweetComposer';
import useAuthStore from '../store/authStore';



const topicSeeds = ['#идея', '#релиз', '#вопрос', '#мысли', '#дизайн', '#музыка'];

const ideaCards = [
  {
    title: 'Спроси аудиторию',
    text: 'Короткий вопрос с одним хэштегом обычно получает больше ответов.',
  },
  {
    title: 'Покажи прогресс',
    text: 'Расскажи, что изменилось сегодня: релиз, правка, мысль или новая находка.',
  },
  {
    title: 'Добавь контекст',
    text: 'Фото, ссылка или опрос делают пост понятнее и помогают начать разговор.',
  },
];

const extractTags = (tweets) => tweets
  .flatMap((tweet) => tweet.content?.match(/#[\p{L}\p{N}_-]+/gu) || [])
  .reduce((acc, tag) => {
    acc.set(tag, (acc.get(tag) || 0) + 1);
    return acc;
  }, new Map());

export default function HomePage() {
  const { isAuthenticated } = useAuthStore();
  const [feedMode, setFeedMode] = useState('all');
  const loaderRef = useRef(null);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ['feed', feedMode],
    queryFn: ({ pageParam }) =>
      api.get(`/tweets/feed?limit=20&mode=${feedMode}${pageParam ? `&cursor=${pageParam}` : ''}`).then((r) => r.data),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    initialPageParam: undefined,
  });

  useEffect(() => {
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage(); },
      { threshold: 0.1 }
    );
    if (loaderRef.current) obs.observe(loaderRef.current);
    return () => obs.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const tweets = data?.pages.flatMap((p) => p.tweets) ?? [];
  const tagStats = [...extractTags(tweets).entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const trendingTags = tagStats.length ? tagStats : topicSeeds.map((tag) => [tag, 0]);
  const feedStats = {
    posts: tweets.length,
    replies: tweets.reduce((sum, tweet) => sum + (tweet._count?.replies || 0), 0),
    reactions: tweets.reduce((sum, tweet) => sum + (tweet._count?.likes || 0) + (tweet._count?.retweets || 0), 0),
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <main className="min-w-0">
        <div className="cosmic-header px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="nebula-section-heading">Zwiteer Feed</p>
              <h1 className="text-xl font-black tracking-normal">Главная</h1>
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              <button type="button" onClick={() => setFeedMode('all')} className={`nebula-pill ${feedMode === 'all' ? 'border-x-accent/70 text-x-text' : ''}`}>Главная</button>
              <button type="button" onClick={() => setFeedMode('following')} className={`nebula-pill ${feedMode === 'following' ? 'border-x-accent/70 text-x-text' : ''}`}>Подписки</button>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center sm:hidden">
            <button type="button" onClick={() => setFeedMode('all')} className={`nebula-pill ${feedMode === 'all' ? 'border-x-accent/70 text-x-text' : ''}`}>Главная</button>
            <button type="button" onClick={() => setFeedMode('following')} className={`nebula-pill ${feedMode === 'following' ? 'border-x-accent/70 text-x-text' : ''}`}>Подписки</button>
            <a href="/explore" className="nebula-pill">Обзор</a>
          </div>
        </div>

        {isAuthenticated() && <TweetComposer />}

        <section className="mx-3 mb-3 grid grid-cols-3 gap-2 sm:mx-4">
          <div className="rounded-2xl border border-x-border/70 bg-x-panel/45 px-3 py-2">
            <p className="text-lg font-black text-x-text">{feedStats.posts}</p>
            <p className="text-xs font-bold text-x-muted">звитов</p>
          </div>
          <div className="rounded-2xl border border-x-border/70 bg-x-panel/45 px-3 py-2">
            <p className="text-lg font-black text-x-text">{feedStats.replies}</p>
            <p className="text-xs font-bold text-x-muted">ответов</p>
          </div>
          <div className="rounded-2xl border border-x-border/70 bg-x-panel/45 px-3 py-2">
            <p className="text-lg font-black text-x-text">{feedStats.reactions}</p>
            <p className="text-xs font-bold text-x-muted">реакций</p>
          </div>
        </section>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-7 h-7 border-2 border-x-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tweets.length === 0 ? (
          <div className="flex flex-col items-center py-16 px-8 text-center">
            <p className="text-2xl font-black mb-2 text-x-text">Нет звитов</p>
            <p className="text-x-muted">Когда появятся звиты, они будут здесь</p>
          </div>
        ) : (
          <>
            {tweets.map((tweet) => (
              <TweetCard key={tweet.id} tweet={tweet} queryKey={['feed', feedMode]} />
            ))}

            <div ref={loaderRef} className="flex justify-center py-6">
              {isFetchingNextPage && (
                <div className="w-6 h-6 border-2 border-x-accent border-t-transparent rounded-full animate-spin" />
              )}
              {!hasNextPage && tweets.length > 0 && (
                <p className="text-x-muted text-sm">Вы дочитали до конца</p>
              )}
            </div>
          </>
        )}
      </main>

      <aside className="hidden px-4 py-4 xl:block">
        <div className="sticky top-4 space-y-4">
          <section className="rounded-3xl border border-x-border/75 bg-x-panel/55 p-4 shadow-panel backdrop-blur-xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="nebula-section-heading">Signal Board</p>
                <h2 className="text-lg font-black">Тренды</h2>
              </div>
              <a href="/explore" className="text-sm font-bold text-x-accent hover:underline">Обзор</a>
            </div>
            <div className="space-y-2">
              {trendingTags.map(([tag, count]) => (
                <a
                  key={tag}
                  href={`/search?q=${encodeURIComponent(tag)}`}
                  className="flex items-center justify-between rounded-2xl border border-x-border/60 bg-x-surface/45 px-3 py-2 transition hover:border-cyan-300/40"
                >
                  <span className="font-bold text-x-text">{tag}</span>
                  <span className="text-xs font-bold text-x-muted">{count ? `${count} пост.` : 'тема'}</span>
                </a>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-x-border/75 bg-x-panel/55 p-4 shadow-panel backdrop-blur-xl">
            <p className="nebula-section-heading">Creator Kit</p>
            <h2 className="mb-3 text-lg font-black">Идеи для активности</h2>
            <div className="space-y-3">
              {ideaCards.map((idea) => (
                <div key={idea.title} className="rounded-2xl border border-x-border/60 bg-x-surface/45 p-3">
                  <p className="font-black text-x-text">{idea.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-x-muted">{idea.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-emerald-300/20 bg-emerald-300/10 p-4">
            <p className="text-sm font-bold text-emerald-100">
              Совет: пост с вопросом и одним хэштегом легче найти в поиске и проще комментировать.
            </p>
          </section>
        </div>
      </aside>
    </div>
  );
}
