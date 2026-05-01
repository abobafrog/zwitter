import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import api from '../services/api';
import NavIcon from '../components/layout/NavIcon';

const notificationText = {
  like: 'оценил ваш пост',
  retweet: 'сделал репост',
  reply: 'ответил на ваш пост',
  follow: 'подписался на вас',
};

const notificationLetter = {
  like: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.08C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
  retweet: 'M7 7h8.17l-2.58-2.59L14 3l5 5-5 5-1.41-1.41L15.17 9H7v3H5V9a2 2 0 012-2zm10 5h2v3a2 2 0 01-2 2H8.83l2.58 2.59L10 21l-5-5 5-5 1.41 1.41L8.83 15H17v-3z',
  reply: 'M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-.9-5-3.9-10-11-11z',
  follow: 'M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zM15 14c-2.67 0-8 1.34-8 4v2h10v-2c0-1.2.75-2.27 1.87-3.11C17.42 14.34 15.98 14 15 14zM6 10V7H3V5h3V2h2v3h3v2H8v3H6z',
};

function NotificationItem({ item }) {
  const navigate = useNavigate();
  const timeAgo = formatDistanceToNow(new Date(item.createdAt), { locale: ru, addSuffix: true });
  const iconPath = notificationLetter[item.type] || notificationLetter.follow;
  const openActor = () => navigate(`/${item.from.username}`);
  const openTarget = () => {
    if (item.tweet?.id) navigate(`/tweet/${item.tweet.id}`);
    else openActor();
  };

  return (
    <article className={`flex w-full gap-3 border-b border-x-border/70 px-4 py-4 text-left transition hover:bg-cyan-300/10 sm:px-5 ${item.isRead ? 'bg-x-bg/10' : 'bg-cyan-300/[0.07]'}`}>
      <div className="mt-1 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-300/10 font-black text-x-accent shadow-neon">
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
          <path d={iconPath} />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <button type="button" onClick={openActor} className="flex min-w-0 items-center gap-2 rounded-2xl text-left transition hover:text-x-accent">
            <div className="h-9 w-9 flex-shrink-0 rounded-full cosmic-avatar">
              {item.from.avatarUrl ? (
                <img src={item.from.avatarUrl} alt={item.from.displayName} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm font-black">
                  {item.from.displayName?.[0]?.toUpperCase()}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate font-black">{item.from.displayName}</p>
              <p className="truncate text-sm text-x-muted">@{item.from.username}</p>
            </div>
          </button>
          <button
            type="button"
            onClick={openTarget}
            className="mt-0.5 flex-shrink-0 rounded-full border border-x-border bg-x-surface/80 px-3 py-1 text-xs font-black text-x-accent transition hover:border-x-accent/70 hover:bg-cyan-300/10"
          >
            Перейти
          </button>
        </div>
        <p className="mt-2 text-sm text-x-text/90">
          {notificationText[item.type] || 'отправил уведомление'} <span className="text-x-muted">{timeAgo}</span>
        </p>
        {item.tweet?.content && (
          <p className="mt-2 line-clamp-2 rounded-2xl border border-x-border/70 bg-x-surface/45 px-3 py-2 text-sm text-x-muted">
            {item.tweet.content}
          </p>
        )}
      </div>
    </article>
  );
}

export default function NotificationsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications').then((r) => r.data),
  });

  const notifications = data?.notifications || [];
  const unreadCount = data?.unreadCount || 0;

  const markReadMutation = useMutation({
    mutationFn: () => api.patch('/notifications'),
    onSuccess: () => {
      qc.setQueryData(['notifications'], (current) => current
        ? {
            ...current,
            unreadCount: 0,
            notifications: current.notifications.map((item) => ({ ...item, isRead: true })),
          }
        : current);
    },
  });

  useEffect(() => {
    if (unreadCount > 0 && !markReadMutation.isPending) {
      markReadMutation.mutate();
    }
  }, [unreadCount, markReadMutation.isPending]);

  return (
    <div className="min-h-full">
      <div className="cosmic-header px-4 py-3 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="nebula-section-heading">сигналы аккаунта</p>
            <h1 className="flex items-center gap-2 text-xl font-black tracking-normal">
              <NavIcon name="bell" className="h-5 w-5 text-x-accent" />
              Уведомления
            </h1>
          </div>
          <span className="rounded-full border border-x-border bg-x-surface/80 px-3 py-1.5 text-xs font-black text-x-muted">
            Просмотрено
          </span>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-x-accent border-t-transparent" />
        </div>
      ) : notifications.length > 0 ? (
        <div>
          {notifications.map((item) => <NotificationItem key={item.id} item={item} />)}
        </div>
      ) : (
        <div className="px-8 py-16 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-x-border bg-cyan-300/10 text-x-accent shadow-neon">
            <NavIcon name="bell" className="h-6 w-6" />
          </div>
          <p className="text-xl font-black">Пока тихо</p>
          <p className="mt-2 text-sm text-x-muted">Лайки, репосты, ответы и подписки появятся здесь.</p>
        </div>
      )}
    </div>
  );
}
