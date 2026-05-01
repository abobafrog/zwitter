import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import TweetCard from '../components/chat/TweetCard';
import NavIcon from '../components/layout/NavIcon';

export default function BookmarksPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['bookmarks'],
    queryFn: () => api.get('/tweets/bookmarks?limit=50').then((r) => r.data),
  });

  const tweets = data?.tweets || [];

  return (
    <div className="min-h-full">
      <div className="cosmic-header px-4 py-3 sm:px-5">
        <p className="nebula-section-heading">личная коллекция</p>
        <h1 className="flex items-center gap-2 text-xl font-black tracking-normal">
          <NavIcon name="bookmark" className="h-5 w-5 text-x-accent" />
          Закладки
        </h1>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-x-accent border-t-transparent" />
        </div>
      ) : tweets.length > 0 ? (
        <div className="py-4">
          {tweets.map((tweet) => <TweetCard key={tweet.id} tweet={tweet} queryKey={['bookmarks']} />)}
        </div>
      ) : (
        <div className="px-8 py-16 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-x-border bg-cyan-300/10 text-x-accent shadow-neon">
            <NavIcon name="bookmark" className="h-6 w-6" />
          </div>
          <p className="text-xl font-black">Здесь будут сохранённые посты</p>
          <p className="mt-2 text-sm text-x-muted">Нажимай на закладку под постом, и он появится в этой ленте.</p>
        </div>
      )}
    </div>
  );
}
