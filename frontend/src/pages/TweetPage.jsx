import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import TweetCard from '../components/chat/TweetCard';
import TweetComposer from '../components/chat/TweetComposer';

export default function TweetPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({
    queryKey: ['tweet', id],
    queryFn: () => api.get(`/tweets/${id}`).then((r) => r.data.tweet),
    enabled: !!id,
  });

  return (
    <div className="min-h-full">
      <div className="cosmic-header flex items-center gap-4 px-4 py-3 sm:px-5">
        <button type="button" onClick={() => navigate(-1)} className="panel-icon-button h-9 w-9" aria-label="Назад">
          <span className="text-lg">‹</span>
        </button>
        <div>
          <p className="nebula-section-heading">пост и ответы</p>
          <h1 className="text-xl font-black tracking-normal">Звит</h1>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-x-accent border-t-transparent" />
        </div>
      ) : error || !data ? (
        <div className="px-8 py-16 text-center text-x-muted">
          <p className="text-xl font-black text-x-text">Пост не найден</p>
        </div>
      ) : (
        <>
          <div className="py-4">
            <TweetCard tweet={data} queryKey={['tweet', id]} detail />
            <div className="mx-3 rounded-3xl border border-x-border/70 bg-x-panel/35 px-5 py-4 text-sm text-x-muted sm:mx-4">
              <div className="flex flex-wrap items-center gap-5">
                <span><b className="text-x-text">{data._count?.replies || 0}</b> комментариев</span>
                <span><b className="text-x-text">{data._count?.likes || 0}</b> лайков</span>
                <span><b className="text-x-text">{data._count?.retweets || 0}</b> репостов</span>
                <span><b className="text-x-text">{data.viewsCount || 0}</b> просмотров</span>
              </div>
            </div>
          </div>
          <div className="border-y border-x-border/80 bg-x-panel/20 px-4 py-3 sm:px-5">
            <p className="nebula-section-heading">обсуждение</p>
            <h2 className="text-lg font-black text-x-text">Комментарии</h2>
          </div>
          <TweetComposer parentId={data.id} placeholder={`Ответить @${data.author.username}`} queryKey={['tweet', id]} />
          <div className="py-4">
            {(data.replies || []).length > 0 ? (
              data.replies.map((reply) => <TweetCard key={reply.id} tweet={reply} queryKey={['tweet', id]} />)
            ) : (
              <div className="px-8 py-12 text-center text-sm text-x-muted">Ответов пока нет</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
