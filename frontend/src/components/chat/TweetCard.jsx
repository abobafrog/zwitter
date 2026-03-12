// src/components/chat/TweetCard.jsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/authStore';


export default function TweetCard({ tweet, queryKey }) {
  const navigate = useNavigate();
const [imageModal, setImageModal] = useState(null);
const [zoom, setZoom] = useState(1);
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [liked, setLiked] = useState(tweet.likes?.length > 0);
  const [retweeted, setRetweeted] = useState(tweet.retweets?.length > 0);
  const [likeCount, setLikeCount] = useState(tweet._count?.likes || 0);
  const [retweetCount, setRetweetCount] = useState(tweet._count?.retweets || 0);

  const likeMutation = useMutation({
    mutationFn: () => api.post(`/tweets/${tweet.id}/like`),
    onMutate: () => {
      setLiked((l) => !l);
      setLikeCount((c) => liked ? c - 1 : c + 1);
    },
    onError: () => {
      setLiked((l) => !l);
      setLikeCount((c) => liked ? c + 1 : c - 1);
      toast.error('Ошибка');
    },
  });

  const retweetMutation = useMutation({
    mutationFn: () => api.post(`/tweets/${tweet.id}/retweet`),
    onMutate: () => {
      setRetweeted((r) => !r);
      setRetweetCount((c) => retweeted ? c - 1 : c + 1);
    },
    onError: () => {
      setRetweeted((r) => !r);
      setRetweetCount((c) => retweeted ? c + 1 : c - 1);
      toast.error('Ошибка');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/tweets/${tweet.id}`),
    onSuccess: () => {
      if (queryKey) qc.invalidateQueries({ queryKey });
      toast.success('Твит удалён');
    },
  });

  const timeAgo = formatDistanceToNow(new Date(tweet.createdAt), { locale: ru, addSuffix: true });

  return (
    <article className="flex gap-3 px-4 py-3 border-b border-x-border hover:bg-white/[0.02] transition-colors max-w-[900px] mx-auto border-r border-l">      
      {/* Аватарка слева */}
      <div
  className="flex-shrink-0 self-start cursor-pointer"
  onClick={(e) => { e.stopPropagation(); navigate(`/${tweet.author.username}`); }}
>
  <div className="w-10 h-10 rounded-full bg-x-surface overflow-hidden border border-x-border">
    {tweet.author.avatarUrl
      ? <img src={tweet.author.avatarUrl} alt={tweet.author.displayName} className="w-full h-full object-cover" />
      : <div className="w-full h-full flex items-center justify-center font-bold text-sm">
          {tweet.author.displayName?.[0]?.toUpperCase()}
        </div>
    }
  </div>
</div>
  
      {/* Весь контент справа */}
      <div className="flex-1 min-w-0">
  
        {/* Ник + время + корзина */}
        <div className="flex items-center gap-1 mb-0.5 flex-wrap">
        <Link to={`/${tweet.author.username}`} className="font-bold hover:underline cursor-pointer" onClick={(e) => e.stopPropagation()}>
                    {tweet.author.displayName}
          </Link>
          {tweet.author.isVerified && (
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-x-accent flex-shrink-0">
              <path d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z"/>
            </svg>
          )}
          <span className="text-x-muted text-sm">@{tweet.author.username} · {timeAgo}</span>
          {user?.id === tweet.author.id && (
            <button
              onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(); }}
              className="ml-auto text-x-muted hover:text-x-danger transition-colors p-1 rounded-full hover:bg-x-danger/10"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                <path d="M16 6V4.5C16 3.12 14.88 2 13.5 2h-3C9.11 2 8 3.12 8 4.5V6H3v2h1.06l.81 11.21C4.98 20.78 6.28 22 7.86 22h8.27c1.58 0 2.88-1.22 3-2.79L19.93 8H21V6h-5zm-6-1.5c0-.28.22-.5.5-.5h3c.27 0 .5.22.5.5V6h-4V4.5zm7.13 15.03c-.04.52-.47.97-1 .97H7.86c-.53 0-.96-.45-1-.97L6.07 8h11.85l-.79 11.53z"/>
              </svg>
            </button>
          )}
        </div>
  
        {/* Текст */}
        <p className="text-[15px] leading-normal whitespace-pre-wrap break-words">{tweet.content}</p>
  
        {/* Картинка */}
        {tweet.imageUrl && (
  <div
    className="mt-3 rounded-2xl overflow-hidden border border-x-border cursor-zoom-in"
    onClick={(e) => { e.stopPropagation(); setImageModal(tweet.imageUrl); setZoom(1); }}
  >
    <img src={tweet.imageUrl} alt="Tweet media" className="w-full object-cover max-h-96" />
  </div>
)}

{/* Модалка с фото */}
{imageModal && (
  <div
    className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center"
    onClick={() => { setImageModal(null); setZoom(1); }}
  >
    {/* Кнопки управления */}
    <div
      className="absolute top-4 right-4 flex items-center gap-2 z-10"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Уменьшить */}
      <button
        onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
        className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
        title="Уменьшить"
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
          <path d="M19 13H5v-2h14v2z"/>
        </svg>
      </button>

      {/* Текущий зум */}
      <span className="text-white text-sm font-mono bg-white/10 px-3 py-1 rounded-full">
        {Math.round(zoom * 100)}%
      </span>

      {/* Увеличить */}
      <button
        onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))}
        className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
        title="Увеличить"
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
        </svg>
      </button>

      {/* Сбросить зум */}
      <button
        onClick={() => setZoom(1)}
        className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
        title="Сбросить"
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
          <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
        </svg>
      </button>

      {/* Закрыть */}
      <button
        onClick={() => { setImageModal(null); setZoom(1); }}
        className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
        title="Закрыть"
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
          <path d="M18.3 5.71a1 1 0 00-1.41 0L12 10.59 7.11 5.7A1 1 0 005.7 7.11L10.59 12 5.7 16.89a1 1 0 001.41 1.41L12 13.41l4.89 4.89a1 1 0 001.41-1.41L13.41 12l4.89-4.89a1 1 0 000-1.4z"/>
        </svg>
      </button>
    </div>

    {/* Подсказка */}
    <p className="absolute bottom-4 text-white/40 text-xs">
      Прокрутка колеса мыши для зума · Клик вне фото для закрытия
    </p>

    {/* Картинка */}
    <div
      className="overflow-auto max-w-[90vw] max-h-[85vh] flex items-center justify-center"
      onClick={(e) => e.stopPropagation()}
      onWheel={(e) => {
        e.preventDefault();
        if (e.deltaY < 0) setZoom((z) => Math.min(4, +(z + 0.1).toFixed(2)));
        else setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)));
      }}
    >
      <img
        src={imageModal}
        alt="Full size"
        style={{ transform: `scale(${zoom})`, transition: 'transform 0.2s ease' }}
        className="max-w-[85vw] max-h-[80vh] object-contain rounded-lg"
      />
    </div>
  </div>
)}
  
        {/* Кнопки */}
        <div className="flex items-center gap-6 mt-3 -ml-2">
          <button className="tweet-action" title="Ответить">
            <span className="tweet-action-icon">
              <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] fill-current">
                <path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z"/>
              </svg>
            </span>
            <span className="text-sm">{tweet._count?.replies || 0}</span>
          </button>
  
          <button
            className={`tweet-action ${retweeted ? 'text-x-success' : ''} hover:text-x-success group`}
            onClick={(e) => { e.stopPropagation(); if (user) retweetMutation.mutate(); }}
          >
            <span className="tweet-action-icon group-hover:bg-x-success/10">
              <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] fill-current">
                <path d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z"/>
              </svg>
            </span>
            <span className="text-sm">{retweetCount}</span>
          </button>
  
          <button
            className={`tweet-action ${liked ? 'text-x-danger' : ''} hover:text-x-danger group`}
            onClick={(e) => { e.stopPropagation(); if (user) likeMutation.mutate(); }}
          >
            <span className="tweet-action-icon group-hover:bg-x-danger/10">
              <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] fill-current">
                {liked
                  ? <path d="M20.884 13.19c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"/>
                  : <path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"/>
                }
              </svg>
            </span>
            <span className="text-sm">{likeCount}</span>
          </button>
        </div>
      </div>
  
    </article>
  );
}
