// src/components/chat/TweetCard.jsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import PhotoViewer from '../ui/PhotoViewer';

const extractTags = (content = '') => [...new Set(content.match(/#[\p{L}\p{N}_-]+/gu) || [])].slice(0, 6);
const LINK_MARKER = /\[\[link:(.+?)\]\]/;
const POLL_MARKER = /\[\[poll:(.+?)\]\]/;
const FILE_MARKER = /\[\[file:(.+?)\|(.+?)\]\]/;

const parseTweetContent = (content = '') => {
  const link = content.match(LINK_MARKER)?.[1] || '';
  const pollRaw = content.match(POLL_MARKER)?.[1] || '';
  const fileMatch = content.match(FILE_MARKER);
  const pollParts = pollRaw ? pollRaw.split('|').map((part) => part.trim()).filter(Boolean) : [];
  const [pollQuestion, ...pollOptions] = pollParts;
  const plainContent = content
    .replace(LINK_MARKER, '')
    .replace(POLL_MARKER, '')
    .replace(FILE_MARKER, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return {
    plainContent,
    linkUrl: link,
    pollQuestion: pollQuestion || '',
    pollOptions,
    file: fileMatch ? { name: fileMatch[1], url: fileMatch[2] } : null,
  };
};

const buildTweetContent = ({ text, linkUrl, pollQuestion, pollOptions }) => {
  const parts = [text.trim()];
  if (linkUrl.trim()) parts.push(`[[link:${linkUrl.trim()}]]`);
  const cleanedPollOptions = pollOptions.map((option) => option.trim()).filter(Boolean);
  if (pollQuestion.trim() && cleanedPollOptions.length > 0) {
    parts.push(`[[poll:${[pollQuestion.trim(), ...cleanedPollOptions].join('|')}]]`);
  }
  return parts.filter(Boolean).join('\n\n').trim();
};

export default function TweetCard({ tweet, queryKey, detail = false }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [viewingImage, setViewingImage] = useState(null);
  const [liked, setLiked] = useState(tweet.likes?.length > 0);
  const [retweeted, setRetweeted] = useState(tweet.retweets?.length > 0);
  const [bookmarked, setBookmarked] = useState(tweet.bookmarks?.length > 0);
  const [likeCount, setLikeCount] = useState(Math.max(0, tweet._count?.likes || tweet.likesCount || 0));
  const [retweetCount, setRetweetCount] = useState(Math.max(0, tweet._count?.retweets || tweet.retweetsCount || 0));
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [pollVotes, setPollVotes] = useState(() => ({}));
  const [editing, setEditing] = useState(false);
  const { data: chatsData } = useQuery({
    queryKey: ['share-chats'],
    queryFn: () => api.get('/chats').then((r) => r.data.chats),
    enabled: showShareSheet && !!user,
    staleTime: 15000,
  });
  const displayAuthor = tweet.community
    ? {
        id: tweet.community.id,
        username: tweet.community.slug,
        displayName: tweet.community.name,
        avatarUrl: tweet.community.avatarUrl,
        isVerified: tweet.community.isVerified,
        isCommunity: true,
      }
    : tweet.author;
  const replyTarget = tweet.parent
    ? {
        name: tweet.parent.community?.name || tweet.parent.author?.displayName,
        username: tweet.parent.community?.slug || tweet.parent.author?.username,
        path: tweet.parent.community ? `/community/${tweet.parent.community.slug}` : `/${tweet.parent.author?.username}`,
      }
    : null;

  const invalidate = () => {
    if (queryKey) qc.invalidateQueries({ queryKey });
    qc.invalidateQueries({ queryKey: ['feed'] });
    qc.invalidateQueries({ queryKey: ['tweet'] });
    qc.invalidateQueries({ queryKey: ['user-tweets'] });
    qc.invalidateQueries({ queryKey: ['community-tweets'] });
    qc.invalidateQueries({ queryKey: ['explore'] });
    qc.invalidateQueries({ queryKey: ['search'] });
    qc.invalidateQueries({ queryKey: ['bookmarks'] });
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };

  const likeMutation = useMutation({
    mutationFn: () => api.post(`/tweets/${tweet.id}/like`),
    onMutate: () => {
      setLiked((current) => !current);
      setLikeCount((count) => Math.max(0, liked ? count - 1 : count + 1));
    },
    onError: () => {
      setLiked((current) => !current);
      setLikeCount((count) => Math.max(0, liked ? count + 1 : count - 1));
      toast.error('Ошибка');
    },
    onSuccess: ({ data }) => {
      if (typeof data.count === 'number') setLikeCount(Math.max(0, data.count));
      if (typeof data.liked === 'boolean') setLiked(data.liked);
    },
    onSettled: invalidate,
  });

  const retweetMutation = useMutation({
    mutationFn: () => api.post(`/tweets/${tweet.id}/retweet`),
    onMutate: () => {
      setRetweeted((current) => !current);
      setRetweetCount((count) => Math.max(0, retweeted ? count - 1 : count + 1));
    },
    onError: () => {
      setRetweeted((current) => !current);
      setRetweetCount((count) => Math.max(0, retweeted ? count + 1 : count - 1));
      toast.error('Ошибка');
    },
    onSuccess: ({ data }) => {
      if (typeof data.count === 'number') setRetweetCount(Math.max(0, data.count));
      if (typeof data.retweeted === 'boolean') setRetweeted(data.retweeted);
    },
    onSettled: invalidate,
  });

  const bookmarkMutation = useMutation({
    mutationFn: () => api.post(`/tweets/${tweet.id}/bookmark`),
    onMutate: () => setBookmarked((current) => !current),
    onError: () => {
      setBookmarked((current) => !current);
      toast.error('Ошибка закладки');
    },
    onSettled: invalidate,
  });

  const replyMutation = useMutation({
    mutationFn: () => api.post('/tweets', { content: replyText.trim(), parentId: tweet.id }),
    onSuccess: () => {
      setReplyText('');
      setReplyOpen(false);
      toast.success('Ответ опубликован');
      invalidate();
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Не удалось ответить'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/tweets/${tweet.id}`),
    onSuccess: () => {
      invalidate();
      toast.success('Звит удалён');
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      const content = buildTweetContent({
        text: editText,
        linkUrl: editLinkUrl,
        pollQuestion: editPollQuestion,
        pollOptions: editPollOptions,
      });
      const fd = new FormData();
      fd.append('content', content);
      if (editAttachment) fd.append('attachment', editAttachment);
      if (clearImage) fd.append('clearImage', 'true');
      return api.patch(`/tweets/${tweet.id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: () => {
      invalidate();
      setEditing(false);
      setEditAttachment(null);
      toast.success('Звит обновлён');
    },
    onError: (error) => toast.error(error.response?.data?.error || 'Не удалось обновить звит'),
  });

  const timeAgo = formatDistanceToNow(new Date(tweet.createdAt), { locale: ru, addSuffix: true });
  const requireAuth = (action) => {
    if (!user) {
      toast.error('Сначала войдите в аккаунт');
      return;
    }
    action();
  };
  const openTweetPage = () => {
    if (!detail) navigate(`/tweet/${tweet.id}`);
  };
  const tweetUrl = `${window.location.origin}/tweet/${tweet.id}`;
  const parsedContent = parseTweetContent(tweet.content);
  const [editText, setEditText] = useState(parsedContent.plainContent);
  const [editLinkUrl, setEditLinkUrl] = useState(parsedContent.linkUrl);
  const [editPollQuestion, setEditPollQuestion] = useState(parsedContent.pollQuestion);
  const [editPollOptions, setEditPollOptions] = useState(parsedContent.pollOptions.length > 0 ? parsedContent.pollOptions : ['', '']);
  const [editAttachment, setEditAttachment] = useState(null);
  const [clearImage, setClearImage] = useState(false);
  const tags = extractTags(parsedContent.plainContent);

  const copyTweetLink = async (event) => {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(tweetUrl);
      toast.success('Ссылка скопирована');
    } catch {
      toast.error('Не удалось скопировать ссылку');
    }
  };

  const shareTweet = async (event) => {
    event.stopPropagation();
    setShowShareSheet(true);
  };

  const shareIntoChat = async (chatId) => {
    try {
      await api.post(`/chats/${chatId}/messages`, { content: `${parsedContent.plainContent || 'Поделиться звитом'}\n${tweetUrl}` });
      toast.success('Звит отправлен в чат');
      setShowShareSheet(false);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Не удалось отправить в чат');
    }
  };

  const resetEditor = () => {
    setEditText(parsedContent.plainContent);
    setEditLinkUrl(parsedContent.linkUrl);
    setEditPollQuestion(parsedContent.pollQuestion);
    setEditPollOptions(parsedContent.pollOptions.length > 0 ? parsedContent.pollOptions : ['', '']);
    setEditAttachment(null);
    setClearImage(false);
    setEditing(false);
  };

  const currentFile = parsedContent.file;
  const canSaveEdit = Boolean(
    buildTweetContent({
      text: editText,
      linkUrl: editLinkUrl,
      pollQuestion: editPollQuestion,
      pollOptions: editPollOptions,
    }) || (tweet.imageUrl && !clearImage) || currentFile || editAttachment
  );

  return (
    <article
      className={`mx-3 mb-3 flex gap-3 rounded-3xl border border-x-border/75 bg-x-panel/55 px-4 py-4 shadow-panel backdrop-blur-xl transition hover:border-cyan-300/35 hover:bg-x-panel/70 sm:mx-4 ${detail ? '' : 'cursor-pointer'}`}
      onClick={openTweetPage}
      onKeyDown={(event) => {
        if (!detail && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          openTweetPage();
        }
      }}
      role={detail ? undefined : 'button'}
      tabIndex={detail ? undefined : 0}
    >
      <button
        type="button"
        className="flex-shrink-0 self-start"
        onClick={(e) => { e.stopPropagation(); navigate(displayAuthor.isCommunity ? `/community/${displayAuthor.username}` : `/${displayAuthor.username}`); }}
        aria-label={`Профиль ${displayAuthor.displayName}`}
      >
        <div className={`h-10 w-10 cosmic-avatar ${displayAuthor.isCommunity ? 'rounded-2xl' : 'rounded-full'}`}>
          {displayAuthor.avatarUrl ? (
            <img src={displayAuthor.avatarUrl} alt={displayAuthor.displayName} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm font-bold">
              {displayAuthor.displayName?.[0]?.toUpperCase()}
            </div>
          )}
        </div>
      </button>

      <div className="min-w-0 flex-1">
        {tweet.isRetweet && (
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-x-muted">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current">
              <path d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z" />
            </svg>
            <span>{tweet.retweetedBy?.displayName} сделал репост</span>
          </div>
        )}

        <div className="mb-0.5 flex flex-wrap items-center gap-1">
          <Link
            to={displayAuthor.isCommunity ? `/community/${displayAuthor.username}` : `/${displayAuthor.username}`}
            className="font-bold hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {displayAuthor.displayName}
          </Link>
          {displayAuthor.isVerified && (
            <svg viewBox="0 0 24 24" className="h-4 w-4 flex-shrink-0 fill-x-accent">
              <path d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z" />
            </svg>
          )}
          {displayAuthor.isCommunity && (
            <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-normal text-x-accent">
              Сообщество
            </span>
          )}
          <span className="text-sm text-x-muted">@{displayAuthor.username} · {timeAgo}</span>
          {tweet.community && (
            <span className="text-xs text-x-muted">через @{tweet.author.username}</span>
          )}
          {user?.id === tweet.author.id && (
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing(true);
                }}
                className="rounded-full p-1 text-x-muted transition-colors hover:bg-cyan-400/10 hover:text-x-accent"
                aria-label="Редактировать звит"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
                  <path d="M3 17.25V21h3.75l11-11.03-3.75-3.75L3 17.25zm17.71-10.04a1.003 1.003 0 0 0 0-1.42l-2.5-2.5a1.003 1.003 0 0 0-1.42 0l-1.96 1.96 3.75 3.75 2.13-2.29z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(); }}
                className="rounded-full p-1 text-x-muted transition-colors hover:bg-x-danger/10 hover:text-x-danger"
                aria-label="Удалить звит"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
                  <path d="M16 6V4.5C16 3.12 14.88 2 13.5 2h-3C9.11 2 8 3.12 8 4.5V6H3v2h1.06l.81 11.21C4.98 20.78 6.28 22 7.86 22h8.27c1.58 0 2.88-1.22 3-2.79L19.93 8H21V6h-5zm-6-1.5c0-.28.22-.5.5-.5h3c.27 0 .5.22.5.5V6h-4V4.5zm7.13 15.03c-.04.52-.47.97-1 .97H7.86c-.53 0-.96-.45-1-.97L6.07 8h11.85l-.79 11.53z" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {replyTarget && (
          <div className="mb-2 text-sm text-x-muted">
            Ответ на{' '}
            <Link
              to={`/tweet/${tweet.parent.id}`}
              className="font-semibold text-x-accent hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              звит
            </Link>
            {' '} 
            <Link
              to={replyTarget.path}
              className="font-semibold text-x-accent hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              @{replyTarget.username}
            </Link>
          </div>
        )}

        <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-x-text/95">{parsedContent.plainContent}</p>

        {parsedContent.linkUrl && (
          <a
            href={parsedContent.linkUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mt-3 block rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-3 text-sm text-x-accent transition hover:border-cyan-200/50"
          >
            {parsedContent.linkUrl}
          </a>
        )}

        {parsedContent.file && (
          <a
            href={parsedContent.file.url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-x-border/70 bg-x-bg/45 px-4 py-3 text-sm"
          >
            <span className="truncate font-bold text-x-text">{parsedContent.file.name}</span>
            <span className="text-x-accent">Скачать</span>
          </a>
        )}

        {parsedContent.pollQuestion && parsedContent.pollOptions.length > 0 && (
          <div className="mt-3 rounded-2xl border border-x-border/70 bg-x-bg/45 p-3">
            <p className="mb-2 text-sm font-black text-x-text">{parsedContent.pollQuestion}</p>
            <div className="grid gap-2">
              {parsedContent.pollOptions.map((option) => {
                const count = pollVotes[option] || 0;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPollVotes((current) => ({ ...current, [option]: (current[option] || 0) + 1 }));
                    }}
                    className="flex items-center justify-between rounded-xl border border-x-border bg-x-panel/55 px-3 py-2 text-left text-sm transition hover:border-cyan-300/35"
                  >
                    <span>{option}</span>
                    <span className="text-x-muted">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <Link
                key={tag}
                to={`/search?q=${encodeURIComponent(tag)}`}
                onClick={(e) => e.stopPropagation()}
                className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 text-xs font-bold text-x-accent transition hover:border-cyan-200/60"
              >
                {tag}
              </Link>
            ))}
          </div>
        )}

        {tweet.imageUrl && (
          <button
            type="button"
            className="group relative mt-3 block aspect-[16/9] max-h-[520px] w-full overflow-hidden rounded-3xl border border-x-border bg-slate-950/50 shadow-[0_0_28px_rgba(34,211,238,0.1)]"
            onClick={(e) => { e.stopPropagation(); setViewingImage(tweet.imageUrl); }}
          >
            <img src={tweet.imageUrl} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-45 blur-2xl transition duration-300 group-hover:scale-[1.13]" />
            <span className="absolute inset-0 bg-slate-950/20" />
            <img src={tweet.imageUrl} alt="Изображение звита" className="relative z-10 h-full w-full object-contain" />
          </button>
        )}

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-x-border/70 pt-2">
          <button className="tweet-action hover:text-x-accent group" title="Ответить" onClick={(e) => { e.stopPropagation(); requireAuth(() => setReplyOpen((open) => !open)); }}>
            <span className="tweet-action-icon group-hover:bg-x-accent/10">
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-current">
                <path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z" />
              </svg>
            </span>
            <span className="text-sm">{tweet._count?.replies || 0}</span>
          </button>

          <button className={`tweet-action ${retweeted ? 'text-x-success' : ''} hover:text-x-success group`} onClick={(e) => { e.stopPropagation(); requireAuth(() => retweetMutation.mutate()); }}>
            <span className="tweet-action-icon group-hover:bg-x-success/10">
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-current">
                <path d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z" />
              </svg>
            </span>
            <span className="text-sm">{retweetCount}</span>
          </button>

          <button className={`tweet-action ${liked ? 'text-x-danger' : ''} hover:text-x-danger group`} onClick={(e) => { e.stopPropagation(); requireAuth(() => likeMutation.mutate()); }}>
            <span className="tweet-action-icon group-hover:bg-x-danger/10">
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-current">
                {liked ? (
                  <path d="M20.884 13.19c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z" />
                ) : (
                  <path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z" />
                )}
              </svg>
            </span>
            <span className="text-sm">{likeCount}</span>
          </button>

          <div className="flex items-center gap-1.5 text-sm text-x-muted">
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-current">
              <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
            </svg>
            <span>{tweet.viewsCount || 0}</span>
          </div>

          <button className={`tweet-action ${bookmarked ? 'text-x-accent' : ''} hover:text-x-accent group`} onClick={(e) => { e.stopPropagation(); requireAuth(() => bookmarkMutation.mutate()); }} title="Закладка">
            <span className="tweet-action-icon group-hover:bg-x-accent/10">
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-current">
                {bookmarked ? (
                  <path d="M5 3.75C5 2.78 5.78 2 6.75 2h10.5c.97 0 1.75.78 1.75 1.75V22l-7-4.2L5 22V3.75z" />
                ) : (
                  <path d="M5 3.75C5 2.78 5.78 2 6.75 2h10.5c.97 0 1.75.78 1.75 1.75V22l-7-4.2L5 22V3.75zM7 4v14.47l5-3 5 3V4H7z" />
                )}
              </svg>
            </span>
          </button>

          <button className="tweet-action hover:text-fuchsia-200 group" onClick={shareTweet} title="Поделиться">
            <span className="tweet-action-icon group-hover:bg-fuchsia-300/10">
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-current">
                <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.22.09-.45.09-.7s-.04-.48-.09-.7l7.05-4.11A2.99 2.99 0 1 0 15 5c0 .25.04.48.09.7L8.04 9.81A2.99 2.99 0 1 0 8.04 14.2l7.12 4.18c-.05.2-.08.41-.08.63a2.92 2.92 0 1 0 2.92-2.92z" />
              </svg>
            </span>
          </button>

          <button className="tweet-action hover:text-cyan-100 group" onClick={copyTweetLink} title="Скопировать ссылку">
            <span className="tweet-action-icon group-hover:bg-cyan-300/10">
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-current">
                <path d="M3.9 12c0-1.71.69-3.35 1.9-4.56l2.83-2.83a6.45 6.45 0 0 1 9.12 0 6.4 6.4 0 0 1 1.78 5.66h-2.08a4.42 4.42 0 0 0-1.11-4.25 4.45 4.45 0 0 0-6.29 0L7.22 8.85a4.45 4.45 0 0 0 0 6.29 4.42 4.42 0 0 0 4.25 1.11v2.08a6.4 6.4 0 0 1-5.66-1.78A6.42 6.42 0 0 1 3.9 12zm7.17 1.41 2.34-2.34 1.41 1.41-2.34 2.34-1.41-1.41zm1.46-7.74a6.4 6.4 0 0 1 5.66 1.78 6.45 6.45 0 0 1 0 9.12l-2.83 2.83a6.45 6.45 0 0 1-9.12 0 6.4 6.4 0 0 1-1.78-5.66h2.08a4.42 4.42 0 0 0 1.11 4.25 4.45 4.45 0 0 0 6.29 0l2.83-2.83a4.45 4.45 0 0 0 0-6.29 4.42 4.42 0 0 0-4.25-1.11V5.67z" />
              </svg>
            </span>
          </button>
        </div>

        {replyOpen && (
          <div className="mt-3 rounded-2xl border border-x-border/70 bg-x-bg/45 p-3" onClick={(e) => e.stopPropagation()}>
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder={`Ответить @${tweet.author.username}`}
              rows={2}
              maxLength={280}
              className="w-full resize-none bg-transparent text-sm outline-none placeholder-x-muted"
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-xs text-x-muted">{replyText.length}/280</span>
              <div className="flex gap-2">
                <button type="button" className="btn-outline px-4 py-1.5 text-sm" onClick={(e) => { e.stopPropagation(); setReplyOpen(false); setReplyText(''); }}>
                  Отмена
                </button>
                <button type="button" className="btn-accent px-4 py-1.5 text-sm" disabled={!replyText.trim() || replyMutation.isPending} onClick={(e) => { e.stopPropagation(); replyMutation.mutate(); }}>
                  {replyMutation.isPending ? 'Отправляю...' : 'Ответить'}
                </button>
              </div>
            </div>
          </div>
        )}

        {editing && (
          <div className="mt-3 rounded-2xl border border-cyan-300/20 bg-x-bg/55 p-3" onClick={(e) => e.stopPropagation()}>
            <p className="mb-3 text-sm font-black text-x-text">Редактировать пост</p>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={4}
              maxLength={500}
              placeholder="Текст поста"
              className="input-field min-h-28 resize-none"
            />
            <input
              value={editLinkUrl}
              onChange={(e) => setEditLinkUrl(e.target.value)}
              placeholder="Ссылка"
              className="input-field mt-3"
            />
            <input
              value={editPollQuestion}
              onChange={(e) => setEditPollQuestion(e.target.value)}
              placeholder="Вопрос опроса"
              className="input-field mt-3"
            />
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {editPollOptions.map((option, index) => (
                <input
                  key={`${tweet.id}-poll-edit-${index}`}
                  value={option}
                  onChange={(e) => setEditPollOptions((current) => current.map((item, itemIndex) => (itemIndex === index ? e.target.value : item)))}
                  placeholder={`Вариант ${index + 1}`}
                  className="input-field"
                />
              ))}
            </div>
            <label className="mt-3 flex cursor-pointer items-center justify-between rounded-2xl border border-dashed border-x-border px-3 py-3 text-sm text-x-muted">
              <span>{editAttachment ? editAttachment.name : 'Заменить фото или вложение'}</span>
              <input
                type="file"
                accept="image/*,.pdf,.doc,.docx,.txt,.zip,.rar"
                className="hidden"
                onChange={(e) => setEditAttachment(e.target.files?.[0] || null)}
              />
            </label>
            {(tweet.imageUrl || currentFile) && (
              <div className="mt-3 rounded-2xl border border-x-border bg-x-panel/45 px-3 py-2 text-sm text-x-muted">
                {tweet.imageUrl && !clearImage && <p>Текущее фото сохранится, пока ты его не снимешь или не заменишь.</p>}
                {currentFile && !editAttachment && <p className="mt-1">Текущее вложение: {currentFile.name}</p>}
                {tweet.imageUrl && (
                  <label className="mt-2 flex items-center gap-2">
                    <input type="checkbox" checked={clearImage} onChange={(e) => setClearImage(e.target.checked)} />
                    Убрать текущее фото
                  </label>
                )}
              </div>
            )}
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xs text-x-muted">{editText.length}/500</span>
              <div className="flex gap-2">
                <button type="button" className="btn-outline px-4 py-1.5 text-sm" onClick={resetEditor}>
                  Отмена
                </button>
                <button
                  type="button"
                  className="btn-accent px-4 py-1.5 text-sm"
                  disabled={!canSaveEdit || updateMutation.isPending}
                  onClick={() => updateMutation.mutate()}
                >
                  {updateMutation.isPending ? 'Сохраняю...' : 'Сохранить'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {viewingImage && (
        <PhotoViewer src={viewingImage} alt="Изображение звита" onClose={() => setViewingImage(null)} />
      )}

      {showShareSheet && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/70 p-4 backdrop-blur-sm" onClick={() => setShowShareSheet(false)}>
          <div className="w-full max-w-md rounded-3xl border border-x-border bg-x-panel/95 p-4 shadow-panel" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-black text-x-text">Поделиться</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={copyTweetLink} className="rounded-2xl border border-x-border px-4 py-3 text-sm font-bold">Копировать ссылку</button>
              <button
                type="button"
                onClick={async (e) => {
                  if (navigator.share) {
                    try {
                      await navigator.share({ title: 'Звит', text: parsedContent.plainContent, url: tweetUrl });
                    } catch {}
                  } else {
                    copyTweetLink(e);
                  }
                }}
                className="rounded-2xl border border-x-border px-4 py-3 text-sm font-bold"
              >
                Поделиться
              </button>
            </div>
            {!!user && (
              <div className="mt-4">
                <p className="mb-2 text-sm font-bold text-x-muted">Отправить в свои чаты</p>
                <div className="grid gap-2">
                  {(chatsData || []).slice(0, 6).map((chat) => (
                    <button
                      key={chat.id}
                      type="button"
                      onClick={() => shareIntoChat(chat.id)}
                      className="flex items-center justify-between rounded-2xl border border-x-border bg-x-bg/55 px-3 py-2 text-left text-sm"
                    >
                      <span className="truncate font-bold text-x-text">{chat.isGroup ? chat.name : chat.otherUser?.displayName || chat.name}</span>
                      <span className="text-x-accent">Отправить</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
