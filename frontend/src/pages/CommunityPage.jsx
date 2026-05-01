import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../services/api';
import NavIcon from '../components/layout/NavIcon';
import TweetCard from '../components/chat/TweetCard';
import TweetComposer from '../components/chat/TweetComposer';

export default function CommunityPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['community', slug],
    queryFn: () => api.get(`/communities/${slug}`).then((r) => r.data.community),
  });
  const { data: tweetsData } = useQuery({
    queryKey: ['community-tweets', slug],
    queryFn: () => api.get(`/communities/${slug}/tweets`).then((r) => r.data),
    enabled: !!data,
  });

  const joinMutation = useMutation({
    mutationFn: () => api.post(`/communities/${slug}/join`),
    onSuccess: ({ data: res }) => {
      qc.invalidateQueries({ queryKey: ['community', slug] });
      qc.invalidateQueries({ queryKey: ['communities'] });
      qc.invalidateQueries({ queryKey: ['explore'] });
      toast.success(res.member ? 'Вы вступили в сообщество' : 'Вы вышли из сообщества');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Не удалось обновить участие'),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-x-accent border-t-transparent" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="px-8 py-16 text-center text-x-muted">
        <p className="text-lg font-black text-x-text">Сообщество не найдено</p>
      </div>
    );
  }

  const isOwner = data.memberRole === 'owner';

  return (
    <div className="min-h-full">
      <div className="cosmic-header flex items-center gap-4 px-4 py-3">
        <button type="button" onClick={() => navigate(-1)} className="panel-icon-button">
          <NavIcon name="expandLeft" className="h-5 w-5" />
        </button>
        <div>
          <p className="nebula-section-heading">Сообщество</p>
          <h1 className="text-xl font-black">{data.name}</h1>
        </div>
      </div>

      <div className="relative z-0 h-40 overflow-hidden cosmic-banner sm:h-48">
        {data.bannerUrl && <img src={data.bannerUrl} alt={data.name} className="h-full w-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-x-bg/80 via-transparent to-transparent" />
      </div>

      <section className="relative z-10 border-b border-x-border/80 bg-x-panel/95 px-4 pb-5 shadow-[0_-18px_34px_rgba(3,7,18,0.62)]">
        <div className="-mt-12 mb-4 flex items-start justify-between gap-3">
          <div className="relative z-20 h-24 w-24 rounded-3xl border-4 border-x-bg bg-x-bg cosmic-avatar shadow-neon">
            {data.avatarUrl ? (
              <img src={data.avatarUrl} alt={data.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-3xl font-black">
                {data.name?.[0]?.toUpperCase()}
              </div>
            )}
          </div>
          <button
            type="button"
            disabled={joinMutation.isPending || isOwner}
            onClick={() => joinMutation.mutate()}
            className={`mt-11 px-4 py-2 text-sm ${data.isMember ? 'btn-outline' : 'btn-accent'} ${isOwner ? 'opacity-70' : ''}`}
          >
            {isOwner ? 'Вы владелец' : data.isMember ? 'Выйти' : 'Вступить'}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-black">{data.name}</h2>
          <span className="rounded-full border border-cyan-300/35 bg-cyan-300/10 px-2 py-0.5 text-xs font-black uppercase tracking-normal text-x-accent">
            Канал
          </span>
        </div>
        <p className="text-x-muted">@{data.slug}</p>
        {data.bio && <p className="mt-3 text-[15px]">{data.bio}</p>}
        <div className="mt-4 flex flex-wrap gap-4 text-sm text-x-muted">
          <span><strong className="text-x-text">{data._count?.members || 0}</strong> участников</span>
          <span>Создатель: <strong className="text-x-text">@{data.owner?.username}</strong></span>
        </div>
      </section>

      {isOwner && (
        <TweetComposer
          defaultCommunityId={data.id}
          placeholder={`Новая запись в ${data.name}`}
          queryKey={['community-tweets', slug]}
        />
      )}

      <div className="py-4">
        {(tweetsData?.tweets || []).length > 0 ? (
          tweetsData.tweets.map((tweet) => (
            <TweetCard key={tweet.id} tweet={tweet} queryKey={['community-tweets', slug]} />
          ))
        ) : (
          <div className="px-8 py-16 text-center text-x-muted">
            <p className="text-lg font-black text-x-text">Записей пока нет</p>
            <p className="mt-1 text-sm">Владелец может опубликовать первый звит от лица сообщества.</p>
          </div>
        )}
      </div>
    </div>
  );
}
