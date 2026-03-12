// src/pages/ProfilePage.jsx
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import toast from 'react-hot-toast';
import api from '../services/api';
import useAuthStore from '../store/authStore';
import TweetCard from '../components/chat/TweetCard';
import EditProfileModal from '../components/ui/EditProfileModal';

export default function ProfilePage() {
  const { username } = useParams();
  const { user: me } = useAuthStore();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState('tweets');
  const [editOpen, setEditOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['profile', username],
    queryFn: () => api.get(`/users/${username}`).then((r) => r.data.user),
  });

  const { data: tweetsData } = useQuery({
    queryKey: ['user-tweets', username],
    queryFn: () => api.get(`/tweets/feed?authorUsername=${username}&limit=20`).then((r) => r.data),
    enabled: !!data,
  });

  const followMutation = useMutation({
    mutationFn: () => api.post(`/users/${data.id}/follow`),
    onSuccess: ({ data: res }) => {
      qc.invalidateQueries({ queryKey: ['profile', username] });
      toast.success(res.following ? 'Вы подписались!' : 'Вы отписались');
    },
  });

  const startChatMutation = useMutation({
    mutationFn: () => api.post('/chats', { targetUserId: data.id }),
    onSuccess: ({ data: res }) => navigate(`/messages/${res.chat.id}`),
    onError: (err) => toast.error(err.response?.data?.error || 'Ошибка'),
  });

  if (isLoading) return (
    <div className="flex justify-center py-16">
      <div className="w-7 h-7 border-2 border-x-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error || !data) return (
    <div className="flex flex-col items-center py-16 px-8 text-center">
      <p className="text-2xl font-bold mb-2">Пользователь не найден</p>
      <p className="text-x-muted">Этого аккаунта не существует</p>
    </div>
  );

  const isMe = me?.id === data.id;
  const joinDate = format(new Date(data.createdAt), 'MMMM yyyy', { locale: ru });

  return (
    <div>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-black/80 backdrop-blur-md border-b border-x-border px-4 py-3 flex items-center gap-6">
        <button onClick={() => navigate(-1)} className="p-1 rounded-full hover:bg-white/10">
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M20 11H7.414l4.293-4.293-1.414-1.414L3.586 12l6.707 6.707 1.414-1.414L7.414 13H20v-2z"/></svg>
        </button>
        <div>
          <h1 className="text-xl font-bold leading-tight">{data.displayName}</h1>
          <p className="text-x-muted text-sm">{data._count?.tweets} твитов</p>
        </div>
      </div>

      {/* Banner */}
      <div className="h-48 bg-gradient-to-br from-x-accent/40 to-purple-900/40 overflow-hidden">
  {data.bannerUrl && (
    <img src={data.bannerUrl} alt="banner" className="w-full h-full object-cover" />
  )}
</div>

      {/* Profile info */}
      <div className="px-4 pb-4">
        <div className="flex items-start justify-between -mt-16 mb-3">
          <div className="w-32 h-32 rounded-full border-4 border-black bg-x-surface overflow-hidden">
            {data.avatarUrl
              ? <img src={data.avatarUrl} alt={data.displayName} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-5xl font-black">
                  {data.displayName?.[0]?.toUpperCase()}
                </div>
            }
          </div>
          <div className="flex gap-2 mt-16">
            {isMe ? (
              <button className="btn-outline text-sm px-4 py-1.5">Редактировать</button>
            ) : (
              <>
               <button
      onClick={() => setEditOpen(true)}
      className="btn-outline text-sm px-4 py-1.5"
    >
      Редактировать
    </button>
    {editOpen && (
      <EditProfileModal
        user={data}
        onClose={() => setEditOpen(false)}
      />
    )}
  </>
            )}
          </div>
        </div>

        <div className="mb-3">
          <div className="flex items-center gap-1">
            <h2 className="text-xl font-black">{data.displayName}</h2>
            {data.isVerified && (
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-x-accent"><path d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z"/></svg>
            )}
          </div>
          <p className="text-x-muted">@{data.username}</p>
        </div>

        {data.bio && <p className="mb-3 text-[15px]">{data.bio}</p>}

        <div className="flex items-center gap-1 text-x-muted text-sm mb-3">
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
            <path d="M7 4V3h2v1h6V3h2v1h1.5C19.89 4 21 5.12 21 6.5v12c0 1.38-1.11 2.5-2.5 2.5h-13C4.12 21 3 19.88 3 18.5v-12C3 5.12 4.12 4 5.5 4H7zm0 2H5.5c-.27 0-.5.22-.5.5v12c0 .28.23.5.5.5h13c.28 0 .5-.22.5-.5v-12c0-.28-.22-.5-.5-.5H17v1h-2V6H9v1H7V6zm0 6h2v-2H7v2zm0 4h2v-2H7v2zm4-4h2v-2h-2v2zm0 4h2v-2h-2v2zm4-4h2v-2h-2v2z"/>
          </svg>
          <span>Присоединился {joinDate}</span>
        </div>

        <div className="flex gap-4 text-sm">
          <span><strong>{data._count?.following}</strong> <span className="text-x-muted">Подписок</span></span>
          <span><strong>{data._count?.followers}</strong> <span className="text-x-muted">Подписчиков</span></span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-x-border">
        {['tweets', 'replies'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-4 text-sm font-semibold transition-colors hover:bg-white/5 ${tab === t ? 'border-b-2 border-x-accent text-x-text' : 'text-x-muted'}`}
          >
            {t === 'tweets' ? 'Твиты' : 'Ответы'}
          </button>
        ))}
      </div>

      {/* Tweets */}
      {tweetsData?.tweets?.map((tweet) => (
        <TweetCard key={tweet.id} tweet={tweet} queryKey={['user-tweets', username]} />
      ))}
      {(!tweetsData?.tweets || tweetsData.tweets.length === 0) && (
        <div className="py-12 text-center text-x-muted">
          <p>Нет твитов</p>
        </div>
      )}
    </div>
  );
}
