// src/pages/HomePage.jsx
import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import api from '../services/api';
import TweetCard from '../components/chat/TweetCard';
import TweetComposer from '../components/chat/TweetComposer';
import useAuthStore from '../store/authStore';

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

  // Infinite scroll
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage(); },
      { threshold: 0.1 }
    );
    if (loaderRef.current) obs.observe(loaderRef.current);
    return () => obs.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const tweets = data?.pages.flatMap((p) => p.tweets) ?? [];

  return (
    <div>
      {/* Header */}
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
      </div>

      {/* Composer */}
      {isAuthenticated() && <TweetComposer />}

      {/* Feed */}
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
    </div>
  );
}
