// src/pages/ChatsPage.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, isSameDay, isToday, isYesterday } from 'date-fns';
import { ru } from 'date-fns/locale';
import toast from 'react-hot-toast';
import api from '../services/api';
import { getSocket } from '../services/socket';
import useAuthStore from '../store/authStore';
import useChatStore from '../store/chatStore';
import PhotoViewer from '../components/ui/PhotoViewer';
import * as faceapi from 'face-api.js';
import { hasPlusAccess } from '../utils/plus';

const QUICK_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '👏', '💯'];
const FAVORITE_CHAT_ID = 'favorites';

const CALL_STICKERS = [
  { id: 'none', label: 'Без эффекта', icon: '∅' },
  { id: 'star', label: 'Звезда', icon: '⭐' },
  { id: 'heart', label: 'Сердце', icon: '💙' },
  { id: 'spark', label: 'Искра', icon: '✨' },
  { id: 'alien', label: 'Космос', icon: '👽' },
  { id: 'mouse', label: 'Мышь', icon: '🐭' }
];

const EMOJI_CATEGORIES = [
  {
    id: 'smiles',
    icon: '😀',
    title: 'Смайлы и люди',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣',
      '🥲', '🥹', '😊', '🙂', '😇', '🙃', '😉', '😍',
      '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝',
      '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🥳', '🙂‍↕️',
      '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️',
      '😣', '😖', '😫', '😩', '🥺', '😭', '😤', '😠',
      '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨',
      '😰', '😥', '😓', '🫣', '🤗', '🫡', '🤔', '🫢',
      '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄',
      '😮‍💨', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢',
      '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈',
      '👿', '👻', '💀', '☠️', '👽', '🤖', '🎃', '😺',
    ],
  },
  {
    id: 'gestures',
    icon: '👍',
    title: 'Жесты',
    emojis: [
      '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏',
      '✌️', '🤞', '🫰', '🤟', '🤘', '🤙', '👈', '👉',
      '👆', '🖕', '👇', '☝️', '🫵', '👍', '👎', '✊',
      '👊', '🤛', '🤜', '👏', '🙌', '🫶', '👐', '🤲',
      '🤝', '🙏', '✍️', '💅', '💪', '🦾', '🦵', '🦶',
      '👂', '👃', '🧠', '🫀', '🫁', '🦷', '👀', '👁️',
    ],
  },
  {
    id: 'hearts',
    icon: '❤️',
    title: 'Сердца и символы',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
      '🤎', '🩷', '🩵', '🩶', '💔', '❤️‍🔥', '❤️‍🩹', '💕',
      '💞', '💓', '💗', '💖', '💘', '💝', '💟', '❣️',
      '💯', '💢', '💥', '💫', '💦', '💨', '🕳️', '💤',
      '✨', '⭐', '🌟', '⚡', '🔥', '🎉', '🎊', '✅',
      '☑️', '✔️', '❌', '⭕', '❗', '❓', '‼️', '⁉️',
    ],
  },
  {
    id: 'nature',
    icon: '🌿',
    title: 'Природа',
    emojis: [
      '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼',
      '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔',
      '🐧', '🐦', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗',
      '🐴', '🦄', '🐝', '🪲', '🦋', '🐌', '🐞', '🐜',
      '🌵', '🎄', '🌲', '🌳', '🌴', '🌱', '🌿', '☘️',
      '🍀', '🎍', '🪴', '🍃', '🍂', '🍁', '🌾', '🌺',
      '🌸', '🌼', '🌻', '🌹', '🥀', '🌷', '🌙', '☀️',
    ],
  },
  {
    id: 'food',
    icon: '🍔',
    title: 'Еда',
    emojis: [
      '🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇',
      '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥',
      '🥝', '🍅', '🥑', '🥦', '🥬', '🥒', '🌶️', '🫑',
      '🌽', '🥕', '🧄', '🧅', '🥔', '🍠', '🥐', '🥯',
      '🍞', '🥖', '🥨', '🧀', '🥚', '🍳', '🥞', '🧇',
      '🥓', '🍗', '🍖', '🌭', '🍔', '🍟', '🍕', '🥪',
      '🌮', '🌯', '🫔', '🥗', '🍿', '🍩', '🍪', '🎂',
    ],
  },
  {
    id: 'activity',
    icon: '⚽',
    title: 'Активности',
    emojis: [
      '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉',
      '🥏', '🎱', '🪀', '🏓', '🏸', '🥅', '🏒', '🏑',
      '🥍', '🏏', '🪃', '🥊', '🥋', '🎽', '🛹', '🛼',
      '🛷', '⛸️', '🥌', '🎿', '⛷️', '🏂', '🪂', '🏋️',
      '🤼', '🤸', '⛹️', '🤺', '🤾', '🏌️', '🏇', '🧘',
      '🎮', '🕹️', '🎲', '♟️', '🎯', '🎳', '🎭', '🎨',
    ],
  },
];

function getReactionGroups(reactions = [], currentUserId) {
  return reactions.reduce((acc, reaction) => {
    if (!acc[reaction.emoji]) {
      acc[reaction.emoji] = { emoji: reaction.emoji, count: 0, reacted: false };
    }
    acc[reaction.emoji].count += 1;
    if (reaction.userId === currentUserId) acc[reaction.emoji].reacted = true;
    return acc;
  }, {});
}

const getMessageDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatMessageTime = (value) => {
  const date = getMessageDate(value);
  return date ? format(date, 'HH:mm') : '';
};

const formatMessageDateLabel = (value) => {
  const date = getMessageDate(value);
  if (!date) return '';
  if (isToday(date)) return 'Сегодня';
  if (isYesterday(date)) return 'Вчера';
  return format(date, 'd MMMM yyyy', { locale: ru });
};

function ChatDateSeparator({ date }) {
  const label = formatMessageDateLabel(date);
  if (!label) return null;

  return (
    <div className="my-4 flex items-center justify-center">
      <span className="rounded-full border border-x-border/70 bg-x-panel/80 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-x-muted shadow-panel">
        {label}
      </span>
    </div>
  );
}

// ─── Chat List Item ──────────────────────────────────────────────────────────
function ChatItem({ chat, isActive, onClick }) {
  const { user } = useAuthStore();
  const { onlineUsers } = useChatStore();
  const other = chat.otherUser;
  const isOnline = other && onlineUsers.has(other.id);
  const title = chat.isFavorite ? 'Избранное' : chat.isGroup ? chat.name : other?.displayName || 'Чат';
  const subtitle = chat.isGroup
    ? `${chat.participants?.length || 0} участников`
    : chat.isFavorite ? 'Личные заметки и сообщения себе' : '@' + other?.username;
  const timeAgo = chat.lastMessage
    ? formatMessageTime(chat.lastMessage.createdAt)
    : '';

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${isActive ? 'bg-cyan-300/[0.12] text-x-text shadow-[inset_3px_0_0_rgba(34,211,238,0.8)]' : 'hover:bg-cyan-300/10'}`}
    >
      <div className="relative flex-shrink-0">
        <div className={`w-12 h-12 cosmic-avatar ${chat.isGroup || chat.isFavorite ? 'rounded-2xl' : 'rounded-full'}`}>
          {chat.isFavorite ? (
            <div className="flex h-full w-full items-center justify-center bg-fuchsia-300/10 font-black text-fuchsia-100">
              ★
            </div>
          ) : chat.isGroup && chat.avatarUrl ? (
            <img src={chat.avatarUrl} alt={title} className="h-full w-full object-cover" />
          ) : chat.isGroup ? (
            <div className="flex h-full w-full items-center justify-center bg-cyan-300/10 font-black text-lg text-x-accent">
              {chat.name?.[0]?.toUpperCase() || 'G'}
            </div>
          ) : other?.avatarUrl
            ? <img src={other.avatarUrl} alt={other.displayName} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center font-bold text-lg">
                {other?.displayName?.[0]?.toUpperCase() || '?'}
              </div>
          }
        </div>
        {isOnline && (
          <span className="absolute bottom-0.5 right-0.5 w-3 h-3 bg-x-success rounded-full border-2 border-x-bg shadow-[0_0_14px_rgba(45,212,191,0.7)]" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold truncate">{title}</span>
          {timeAgo && <span className="text-x-muted text-xs flex-shrink-0">{timeAgo}</span>}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-x-muted text-sm truncate">
            {chat.lastMessage
              ? `${chat.lastMessage.sender?.id === user?.id ? 'Вы' : chat.lastMessage.sender?.displayName || ''}: ${chat.lastMessage.content}`
              : subtitle}
          </span>
          {chat.unreadCount > 0 && (
            <span className="bg-x-accent text-slate-950 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 shadow-neon">
              {chat.unreadCount > 9 ? '9+' : chat.unreadCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

const favoriteStorageKey = (userId) => `zwitter-favorite-chat-${userId || 'guest'}`;

const loadFavoriteMessages = (userId) => {
  try {
    const parsed = JSON.parse(localStorage.getItem(favoriteStorageKey(userId)) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveFavoriteMessages = (userId, nextMessages) => {
  localStorage.setItem(favoriteStorageKey(userId), JSON.stringify(nextMessages));
};

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

const parseFileMarker = (content = '') => {
  const match = content.match(/\[\[file:(.+?)\|(.+?)\]\]/);
  if (!match) return { text: content, file: null };
  return {
    text: content.replace(match[0], '').replace(/\n{3,}/g, '\n\n').trim(),
    file: { name: match[1], url: match[2] },
  };
};

// ─── Message Bubble ──────────────────────────────────────────────────────────
function MessageBubble({ message, isOwn, showSender, currentUserId, onReact, onEdit, onDelete }) {
  const [showEmojiMenu, setShowEmojiMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [viewingImage, setViewingImage] = useState(null);
  const [draft, setDraft] = useState(message.content || '');
  const timeStr = formatMessageTime(message.createdAt);
  const isCallMessage = message.content?.startsWith('Звонок ');
  const reactionGroups = Object.values(getReactionGroups(message.reactions, currentUserId));
  const parsedMessage = parseFileMarker(message.content || '');

  const saveEdit = () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === message.content) {
      setIsEditing(false);
      setDraft(message.content || '');
      return;
    }
    onEdit(message.id, trimmed);
    setIsEditing(false);
  };

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-1 group`}>
      <div className={`max-w-[75%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col gap-0.5 relative`}>
        {showSender && !isOwn && (
          <span className="px-2 text-xs font-bold text-x-accent">{message.sender.displayName}</span>
        )}
        <div className={`flex items-center gap-1 ${isOwn ? 'flex-row-reverse' : ''}`}>
          <div className={`px-4 py-2.5 rounded-2xl text-[15px] leading-relaxed ${
            isOwn
              ? 'bg-gradient-to-r from-x-accent to-blue-500 text-slate-950 rounded-br-sm shadow-neon'
              : 'bg-x-surface/90 border border-x-border/70 text-x-text rounded-bl-sm'
          }`}>
            {message.imageUrl && (
              <button type="button" onClick={() => setViewingImage(message.imageUrl)} className="group relative mb-2 block aspect-[4/3] w-72 max-w-full overflow-hidden rounded-xl bg-slate-950/35">
                <img src={message.imageUrl} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-45 blur-xl transition duration-300 group-hover:scale-[1.13]" />
                <span className="absolute inset-0 bg-slate-950/15" />
                <img src={message.imageUrl} alt="Фото в сообщении" className="relative z-10 h-full w-full object-contain" />
              </button>
            )}
            {isEditing ? (
              <div className="min-w-[220px]">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      saveEdit();
                    }
                    if (e.key === 'Escape') {
                      setIsEditing(false);
                      setDraft(message.content || '');
                    }
                  }}
                  rows={2}
                  autoFocus
                  maxLength={1000}
                  className={`w-full resize-none rounded-xl border px-3 py-2 text-sm outline-none ${
                    isOwn
                      ? 'border-slate-900/20 bg-slate-950/10 text-slate-950 placeholder:text-slate-800/60'
                      : 'border-x-border bg-x-bg/70 text-x-text'
                  }`}
                />
                <div className="mt-2 flex justify-end gap-2 text-xs font-bold">
                  <button type="button" onClick={() => { setIsEditing(false); setDraft(message.content || ''); }} className="rounded-full px-3 py-1 hover:bg-black/10">
                    Отмена
                  </button>
                  <button type="button" onClick={saveEdit} className="rounded-full bg-x-accent px-3 py-1 text-slate-950">
                    Сохранить
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <p className="break-words">{parsedMessage.text}</p>
                {parsedMessage.file && (
                  <a
                    href={parsedMessage.file.url}
                    target="_blank"
                    rel="noreferrer"
                    className={`mt-2 flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm ${isOwn ? 'border-slate-900/20 bg-slate-950/10 text-slate-950' : 'border-x-border bg-x-bg/70 text-x-text'}`}
                  >
                    <span className="truncate font-bold">{parsedMessage.file.name}</span>
                    <span>Скачать</span>
                  </a>
                )}
              </div>
            )}
          </div>
          {!isEditing && !isCallMessage && (
            <div className={`relative flex items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 ${isOwn ? 'mr-1' : 'ml-1'}`}>
              <button type="button" onClick={() => setShowEmojiMenu((v) => !v)} className="rounded-full border border-x-border bg-x-panel/95 px-2 py-1 text-sm text-x-muted hover:text-x-accent" aria-label="Реакция">
                ☺
              </button>
              {isOwn && (
                <>
                  <button type="button" onClick={() => setIsEditing(true)} className="rounded-full border border-x-border bg-x-panel/95 p-1.5 text-x-muted hover:text-x-accent" aria-label="Редактировать">
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current">
                      <path d="M4 17.25V20h2.75L17.81 8.94l-2.75-2.75L4 17.25zm15.71-10.04a.996.996 0 000-1.41L18.2 4.29a.996.996 0 00-1.41 0l-1.18 1.18 2.75 2.75 1.35-1.01z" />
                    </svg>
                  </button>
                  <button type="button" onClick={() => onDelete(message.id)} className="rounded-full border border-red-400/30 bg-x-panel/95 p-1.5 text-red-300 hover:bg-red-500/10" aria-label="Удалить">
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current">
                      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM8 9h8v10H8V9zm7.5-5l-1-1h-5l-1 1H5v2h14V4h-3.5z" />
                    </svg>
                  </button>
                </>
              )}
              {showEmojiMenu && (
                <div className={`absolute bottom-full z-20 mb-2 flex w-[232px] flex-wrap gap-1 rounded-2xl border border-x-border bg-x-panel/95 p-2 shadow-neon ${isOwn ? 'right-0' : 'left-0'}`}>
                  {QUICK_REACTION_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => { onReact(message.id, emoji); setShowEmojiMenu(false); }}
                      className="flex h-10 w-10 flex-none items-center justify-center rounded-full text-xl leading-none hover:bg-cyan-300/10"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        {!isCallMessage && reactionGroups.length > 0 && (
          <div className={`flex flex-wrap gap-1 px-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
            {reactionGroups.map((reaction) => (
              <button
                key={reaction.emoji}
                type="button"
                onClick={() => onReact(message.id, reaction.emoji)}
                className={`rounded-full border px-2 py-0.5 text-xs transition ${
                  reaction.reacted
                    ? 'border-x-accent bg-x-accent/20 text-x-text shadow-neon'
                    : 'border-x-border bg-x-surface/80 text-x-muted hover:text-x-text'
                }`}
              >
                {reaction.emoji} {reaction.count}
              </button>
            ))}
          </div>
        )}
        <span className="text-[11px] text-x-muted px-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {timeStr}
          {message.editedAt && ' · изменено'}
          {isOwn && message.isRead && ' · Прочитано'}
        </span>
      </div>
      {viewingImage && (
        <PhotoViewer src={viewingImage} alt="Фото в сообщении" onClose={() => setViewingImage(null)} />
      )}
    </div>
  );
}

// ─── New Chat Modal ──────────────────────────────────────────────────────────
function NewChatModal({ onClose, onSelect, onCreateGroup }) {
  const [q, setQ] = useState('');
  const [mode, setMode] = useState('direct');
  const [groupName, setGroupName] = useState('');
  const [selected, setSelected] = useState([]);
  const { data, isLoading } = useQuery({
    queryKey: ['search-users-modal', q],
    queryFn: () => api.get(`/users/search?q=${q}`).then((r) => r.data.users),
    enabled: q.trim().length > 0,
  });
  const toggleSelected = (u) => {
    if (u.blockGroupInvites) return;
    setSelected((current) =>
      current.some((item) => item.id === u.id)
        ? current.filter((item) => item.id !== u.id)
        : [...current, u]
    );
  };

  return (
    <div className="fixed inset-0 bg-x-bg/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="cosmic-panel rounded-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b border-x-border">
          <button onClick={onClose} className="p-1 rounded-full hover:bg-cyan-300/10">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M10.59 12L4.54 5.96l1.42-1.42L12 10.59l6.04-6.05 1.42 1.42L13.41 12l6.05 6.04-1.42 1.42L12 13.41l-6.04 6.05-1.42-1.42L10.59 12z"/></svg>
          </button>
          <h2 className="font-bold text-lg">{mode === 'direct' ? 'Новое сообщение' : 'Новая группа'}</h2>
          <div className="w-7" />
        </div>
        <div className="grid grid-cols-2 gap-2 border-b border-x-border px-4 py-3">
          <button type="button" onClick={() => setMode('direct')} className={`nebula-pill ${mode === 'direct' ? 'border-x-accent/70 text-x-text' : ''}`}>
            Личный
          </button>
          <button type="button" onClick={() => setMode('group')} className={`nebula-pill ${mode === 'group' ? 'border-x-accent/70 text-x-text' : ''}`}>
            Группа
          </button>
        </div>
        <div className="px-4 py-3">
          {mode === 'group' && (
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Название группы"
              className="input-field mb-3"
              maxLength={100}
            />
          )}
          <input
            autoFocus
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={mode === 'direct' ? 'Поиск пользователей...' : 'Добавить участников...'}
            className="input-field"
          />
          {mode === 'group' && selected.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {selected.map((u) => (
                <button key={u.id} type="button" onClick={() => toggleSelected(u)} className="rounded-full border border-x-border bg-x-surface/80 px-3 py-1 text-xs font-bold text-x-text">
                  {u.displayName} ×
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="max-h-64 overflow-y-auto">
          {isLoading && <div className="px-4 py-3 text-x-muted text-sm">Поиск...</div>}
          {data?.map((u) => {
            const groupInviteBlocked = mode === 'group' && u.blockGroupInvites;
            const selectedInGroup = mode === 'group' && selected.some((item) => item.id === u.id);

            return (
            <button
              key={u.id}
              type="button"
              disabled={groupInviteBlocked}
              onClick={() => mode === 'direct' ? onSelect(u) : toggleSelected(u)}
              className={`flex items-center gap-3 w-full px-4 py-3 text-left ${groupInviteBlocked ? 'cursor-not-allowed opacity-55' : 'cosmic-hover'}`}
            >
              <div className="w-10 h-10 rounded-full cosmic-avatar flex-shrink-0">
                {u.avatarUrl ? <img src={u.avatarUrl} alt={u.displayName} className="w-full h-full object-cover" /> : (
                  <div className="w-full h-full flex items-center justify-center font-bold">{u.displayName?.[0]?.toUpperCase()}</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm">{u.displayName}</p>
                <p className="text-x-muted text-sm">@{u.username}</p>
              </div>
              {groupInviteBlocked && (
                <span className="ml-auto rounded-full border border-x-border bg-x-bg/70 px-2 py-0.5 text-xs font-black text-x-muted">Запрещено</span>
              )}
              {selectedInGroup && (
                <span className="ml-auto rounded-full bg-x-accent px-2 py-0.5 text-xs font-black text-slate-950">Выбран</span>
              )}
            </button>
            );
          })}
          {q && !isLoading && data?.length === 0 && (
            <p className="px-4 py-3 text-x-muted text-sm">Пользователи не найдены</p>
          )}
        </div>
        {mode === 'group' && (
          <div className="border-t border-x-border px-4 py-3">
            <button
              type="button"
              disabled={groupName.trim().length < 2 || selected.length < 1}
              onClick={() => onCreateGroup({ name: groupName.trim(), participantIds: selected.map((u) => u.id) })}
              className="btn-accent w-full py-2 text-sm disabled:opacity-50"
            >
              Создать группу
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function GroupSettingsModal({ chat, currentUserId, plusActive, onClose, onSave, onAddParticipants, onToggleAdmin, onRemoveParticipant, onDeleteGroup, isSaving }) {
  const [name, setName] = useState(chat.name || '');
  const [description, setDescription] = useState(chat.description || '');
  const [avatar, setAvatar] = useState(null);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState([]);
  const [advanced, setAdvanced] = useState(() => {
    try {
      return {
        inviteMode: 'owner',
        topic: '',
        forumTags: '',
        slowMode: 'off',
        rules: '',
        ...JSON.parse(localStorage.getItem(`zwitter-group-settings-${chat.id}`) || '{}'),
      };
    } catch {
      return { inviteMode: 'owner', topic: '', slowMode: 'off', rules: '' };
    }
  });
  const ownerId = chat.ownerId || chat.participants?.[0]?.id;
  const currentParticipant = (chat.participants || []).find((participant) => participant.id === currentUserId);
  const currentRole = currentUserId === ownerId ? 'owner' : currentParticipant?.role || 'member';
  const canManage = ['owner', 'admin'].includes(currentRole);
  const canAssignAdmins = currentRole === 'owner';
  const participantIds = new Set((chat.participants || []).map((participant) => participant.id));
  const { data, isLoading } = useQuery({
    queryKey: ['group-add-users', chat.id, q],
    queryFn: () => api.get(`/users/search?q=${q}`).then((r) => r.data.users),
    enabled: canManage && q.trim().length > 0,
  });
  const avatarPreview = avatar ? URL.createObjectURL(avatar) : chat.avatarUrl;

  const toggleSelected = (userItem) => {
    if (userItem.blockGroupInvites || participantIds.has(userItem.id)) return;
    setSelected((current) =>
      current.some((item) => item.id === userItem.id)
        ? current.filter((item) => item.id !== userItem.id)
        : [...current, userItem]
    );
  };

  const handleSave = () => {
    const fd = new FormData();
    fd.append('name', name.trim());
    fd.append('description', description.trim());
    if (avatar) fd.append('avatar', avatar);
    localStorage.setItem(`zwitter-group-settings-${chat.id}`, JSON.stringify(advanced));
    onSave(fd);
  };

  useEffect(() => {
    localStorage.setItem(`zwitter-group-settings-${chat.id}`, JSON.stringify(advanced));
  }, [advanced, chat.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-x-bg/75 p-4 backdrop-blur-md">
      <div className="cosmic-panel max-h-[90vh] w-full max-w-lg overflow-hidden rounded-3xl">
        <div className="flex items-center justify-between border-b border-x-border px-4 py-3">
          <div>
            <p className="nebula-section-heading">группа</p>
            <h2 className="text-lg font-black">Настройки группы</h2>
          </div>
          <button type="button" onClick={onClose} className="panel-icon-button" aria-label="Закрыть">
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M10.59 12L4.54 5.96l1.42-1.42L12 10.59l6.04-6.05 1.42 1.42L13.41 12l6.05 6.04-1.42 1.42L12 13.41l-6.04 6.05-1.42-1.42L10.59 12z"/></svg>
          </button>
        </div>

        <div className="settings-emoji-scroll max-h-[calc(90vh-68px)] overflow-y-auto p-4">
          <div className="flex items-center gap-4">
            <label className={`relative flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-cyan-300/35 bg-cyan-300/10 text-2xl font-black text-x-accent ${canManage ? 'cursor-pointer' : ''}`}>
              {avatarPreview ? <img src={avatarPreview} alt="" className="h-full w-full object-cover" /> : name?.[0]?.toUpperCase() || 'G'}
              {canManage && <input type="file" accept="image/*" className="hidden" onChange={(event) => setAvatar(event.target.files?.[0] || null)} />}
            </label>
            <div className="min-w-0 flex-1">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={!canManage}
                className="input-field"
                placeholder="Название группы"
                maxLength={100}
              />
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={!canManage}
                className="input-field mt-3 min-h-20 resize-none"
                placeholder="Описание группы"
                maxLength={180}
              />
            </div>
          </div>

          {canManage && (
            <button type="button" onClick={handleSave} disabled={isSaving || name.trim().length < 2} className="btn-accent mt-4 w-full py-2 text-sm disabled:opacity-50">
              Сохранить группу
            </button>
          )}

          <div className="mt-5 rounded-3xl border border-x-border bg-x-bg/45 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="nebula-section-heading">расширенные настройки</p>
              <span className="rounded-full border border-fuchsia-300/30 bg-fuchsia-300/10 px-2 py-0.5 text-[10px] font-black uppercase text-fuchsia-100">
                часть функций Plus
              </span>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="settings-label">Кто добавляет людей</span>
                <select disabled={!canManage} value={advanced.inviteMode} onChange={(event) => setAdvanced((current) => ({ ...current, inviteMode: event.target.value }))} className="input-field">
                  <option value="owner">Только создатель</option>
                  <option value="members">Все участники</option>
                  <option value="request" disabled={!plusActive}>Через запрос Plus</option>
                </select>
              </label>
              <label className="block">
                <span className="settings-label">Пауза сообщений</span>
                <select disabled={!canManage} value={advanced.slowMode} onChange={(event) => setAdvanced((current) => ({ ...current, slowMode: event.target.value }))} className="input-field">
                  <option value="off">Выключена</option>
                  <option value="15s" disabled={!plusActive}>15 секунд Plus</option>
                  <option value="60s" disabled={!plusActive}>1 минута Plus</option>
                </select>
              </label>
            </div>
            <input
              disabled={!canManage}
              value={advanced.topic}
              onChange={(event) => setAdvanced((current) => ({ ...current, topic: event.target.value }))}
              className="input-field mt-3"
              placeholder="Закреплённая тема группы"
              maxLength={120}
            />
            <input
              disabled={!canManage || !plusActive}
              value={advanced.forumTags}
              onChange={(event) => setAdvanced((current) => ({ ...current, forumTags: event.target.value }))}
              className="input-field mt-3"
              placeholder="Форумные теги Plus: помощь, новости, медиа"
              maxLength={120}
            />
            <textarea
              disabled={!canManage}
              value={advanced.rules}
              onChange={(event) => setAdvanced((current) => ({ ...current, rules: event.target.value }))}
              className="input-field mt-3 min-h-24 resize-none"
              placeholder="Правила группы, формат общения, что лучше писать сюда"
              maxLength={500}
            />
          </div>

          <div className="mt-5">
            <p className="nebula-section-heading">участники</p>
            <div className="mt-3 grid gap-2">
              {(chat.participants || []).map((participant) => (
                <div key={participant.id} className="flex items-center gap-3 rounded-2xl border border-x-border bg-x-bg/45 px-3 py-2">
                  <div className="h-10 w-10 overflow-hidden rounded-full cosmic-avatar">
                    {participant.avatarUrl ? (
                      <img src={participant.avatarUrl} alt={participant.displayName} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center font-black">{participant.displayName?.[0]?.toUpperCase()}</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black">{participant.displayName}</p>
                    <p className="truncate text-xs text-x-muted">@{participant.username}</p>
                  </div>
                  {participant.id === ownerId && <span className="rounded-full border border-cyan-300/35 px-2 py-0.5 text-xs font-black text-x-accent">Создатель</span>}
                  {participant.id !== ownerId && participant.role === 'admin' && (
                    <span className="rounded-full border border-amber-300/35 px-2 py-0.5 text-xs font-black text-amber-200">Админ</span>
                  )}
                  {canManage && participant.id !== ownerId && (
                    <div className="flex gap-2">
                      {canAssignAdmins && (
                        <button
                          type="button"
                          onClick={() => onToggleAdmin(participant.id, participant.role === 'admin' ? 'member' : 'admin')}
                          className="rounded-full border border-amber-300/30 px-3 py-1 text-xs font-black text-amber-200 hover:bg-amber-400/10"
                        >
                          {participant.role === 'admin' ? 'Снять админа' : 'Сделать админом'}
                        </button>
                      )}
                      <button type="button" onClick={() => onRemoveParticipant(participant.id)} className="rounded-full border border-red-400/30 px-3 py-1 text-xs font-black text-red-300 hover:bg-red-500/10">
                        Удалить
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {canManage && (
            <div className="mt-5">
              <p className="nebula-section-heading">добавить</p>
              <input value={q} onChange={(event) => setQ(event.target.value)} className="input-field mt-3" placeholder="Найти пользователей..." />
              {selected.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {selected.map((item) => (
                    <button key={item.id} type="button" onClick={() => toggleSelected(item)} className="rounded-full border border-x-border px-3 py-1 text-xs font-black">
                      {item.displayName} ×
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-3 max-h-52 overflow-y-auto">
                {isLoading && <p className="px-2 py-3 text-sm text-x-muted">Поиск...</p>}
                {data?.map((item) => {
                  const blocked = item.blockGroupInvites;
                  const alreadyInGroup = participantIds.has(item.id);
                  const selectedUser = selected.some((selectedItem) => selectedItem.id === item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={blocked || alreadyInGroup}
                      onClick={() => toggleSelected(item)}
                      className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left ${blocked || alreadyInGroup ? 'cursor-not-allowed opacity-55' : 'cosmic-hover'}`}
                    >
                      <div className="h-9 w-9 overflow-hidden rounded-full cosmic-avatar">
                        {item.avatarUrl ? <img src={item.avatarUrl} alt={item.displayName} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center font-black">{item.displayName?.[0]?.toUpperCase()}</div>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black">{item.displayName}</p>
                        <p className="truncate text-xs text-x-muted">@{item.username}</p>
                      </div>
                      <span className="text-xs font-black text-x-muted">{alreadyInGroup ? 'Уже в группе' : blocked ? 'Запрещено' : selectedUser ? 'Выбран' : ''}</span>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                disabled={selected.length === 0 || isSaving}
                onClick={() => onAddParticipants(selected.map((item) => item.id)).then(() => setSelected([]))}
                className="btn-outline mt-3 w-full py-2 text-sm disabled:opacity-50"
              >
                Добавить участников
              </button>
            </div>
          )}

          {canManage && (
            <button type="button" onClick={onDeleteGroup} className="mt-5 w-full rounded-2xl border border-red-400/35 bg-red-500/10 px-4 py-3 text-sm font-black text-red-300 hover:bg-red-500/15">
              Удалить группу
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function MediaPreview({ stream, muted, label, volume = 1 }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.srcObject = stream || null;
    videoRef.current.volume = volume;
    videoRef.current.muted = muted || volume === 0;
  }, [stream, muted, volume]);

  if (!stream) return null;
  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-x-border bg-x-bg/70">
      <video ref={videoRef} autoPlay playsInline muted={muted} className="aspect-video w-full bg-slate-950 object-cover" />
      <p className="px-3 py-2 text-xs font-bold text-x-muted">{label}</p>
    </div>
  );
}

function VoiceLevelPill({ meterRef }) {
  const bars = [0.3, 0.55, 0.8, 0.45, 0.65];
  const fillRef = useRef(null);
  const valueRef = useRef(null);
  const barRefs = useRef([]);

  useEffect(() => {
    meterRef.current = {
      update(level) {
        const normalized = Math.max(0, Math.min(1, level));
        if (fillRef.current) fillRef.current.style.width = `${Math.max(12, normalized * 48)}px`;
        if (valueRef.current) valueRef.current.textContent = `${Math.round(normalized * 100)}%`;
        barRefs.current.forEach((bar, index) => {
          if (!bar) return;
          bar.style.height = `${8 + normalized * bars[index] * 22}px`;
          bar.style.opacity = `${0.35 + normalized * 0.65}`;
        });
      },
      reset() {
        this.update(0);
      },
    };
    meterRef.current.update(0);
    return () => {
      meterRef.current = null;
    };
  }, [meterRef]);

  return (
    <div className="flex h-11 min-w-[148px] items-center gap-3 rounded-full border border-cyan-300/35 bg-cyan-300/10 px-4 shadow-[0_0_24px_rgba(34,211,238,0.18)]">
      <div className="relative h-6 w-14 overflow-hidden rounded-full border border-cyan-200/30 bg-slate-950/70">
        <span
          ref={fillRef}
          className="absolute inset-y-1 left-1 rounded-full bg-gradient-to-r from-cyan-300 to-blue-400 transition-all duration-100"
          style={{ width: '12px' }}
        />
      </div>
      <div className="flex h-7 items-center gap-1">
        {bars.map((bar, index) => (
          <span
            key={bar + index}
            ref={(node) => {
              barRefs.current[index] = node;
            }}
            className="w-1.5 rounded-full bg-cyan-200 transition-all duration-100"
            style={{ height: '8px', opacity: 0.35 }}
          />
        ))}
      </div>
      <span ref={valueRef} className="text-[11px] font-black uppercase text-cyan-100">0%</span>
    </div>
  );
}

function CallIcon({ name, off = false, className = 'h-4 w-4' }) {
  const paths = {
    mic: 'M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 006 6.92V21h2v-3.08A7 7 0 0019 11h-2z',
    camera: 'M17 10.5V6a1 1 0 00-1-1H4a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1v-4.5l4 4v-11l-4 4z',
    headphones: 'M12 3a8 8 0 00-8 8v6a3 3 0 003 3h2v-8H6v-1a6 6 0 0112 0v1h-3v8h2a3 3 0 003-3v-6a8 8 0 00-8-8z',
    record: 'M12 7a5 5 0 100 10 5 5 0 000-10zm0-5a10 10 0 100 20 10 10 0 000-20z',
  };
  return (
    <svg viewBox="0 0 24 24" className={`${className} fill-current`} aria-hidden="true">
      <path d={paths[name]} />
      {off && <path d="M4.7 3.3L20.7 19.3l-1.4 1.4L3.3 4.7z" />}
    </svg>
  );
}

function CallTray({
  incomingCall,
  activeCall,
  localStream,
  remoteStreams,
  callExpanded,
  isMicOn,
  isCameraOn,
  micVolume,
  voiceMeterRef,
  remoteVolumes,
  isRecording,
  selectedSticker,
  faceEffectAvailable,
  onAccept,
  onReject,
  onEnd,
  onToggleRecording,
  onToggleExpanded,
  onToggleMic,
  onToggleCamera,
  onStickerChange,
  onMicVolume,
  onRemoteVolume,
}) {
  const call = activeCall?.call || incomingCall?.call;
  if (!call) return null;

  const isIncoming = Boolean(incomingCall) && !activeCall;
  return (
    <div className={`${callExpanded ? 'fixed inset-0 z-50 rounded-none border-0 p-5 md:p-8' : 'fixed bottom-24 left-1/2 z-50 w-[min(92vw,520px)] -translate-x-1/2 rounded-3xl border border-cyan-300/35 p-4 md:bottom-6'} overflow-hidden bg-slate-950/95 shadow-[0_0_44px_rgba(34,211,238,0.28)] backdrop-blur-xl`}>
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border border-cyan-300/35 bg-cyan-300/10 text-x-accent">
          <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current">
            <path d="M6.62 10.79a15.1 15.1 0 006.59 6.59l2.2-2.2a1 1 0 011.02-.24 11.36 11.36 0 003.57.57 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11.36 11.36 0 00.57 3.57 1 1 0 01-.24 1.02l-2.21 2.2z" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-x-text">
            {isIncoming ? `${call.caller.displayName} звонит` : activeCall?.status === 'connected' ? 'Звонок активен' : 'Идёт вызов'}
          </p>
          <p className="truncate text-xs font-bold text-x-muted">
            {call.isGroup ? 'Групповой чат' : 'Личный чат'} · {call.mode === 'video' ? 'видео' : 'аудио'}
          </p>
        </div>
        {activeCall && <VoiceLevelPill meterRef={voiceMeterRef} />}
        <div className="flex flex-shrink-0 flex-wrap justify-end gap-2">
          {activeCall && (
            <button type="button" onClick={onToggleExpanded} className="rounded-full border border-x-border px-4 py-2 text-xs font-black text-x-muted">
              {callExpanded ? 'Свернуть' : 'На весь экран'}
            </button>
          )}
          {isIncoming && (
            <button type="button" onClick={onAccept} className="rounded-full bg-x-success px-4 py-2 text-xs font-black text-slate-950">
              Принять
            </button>
          )}
          <button type="button" onClick={isIncoming ? onReject : onEnd} className="rounded-full border border-red-400/35 bg-red-500/10 px-4 py-2 text-xs font-black text-red-300">
            {isIncoming ? 'Сбросить' : 'Завершить'}
          </button>
        </div>
      </div>
      {activeCall && (
        <div className={`mt-3 grid gap-3 ${callExpanded ? 'h-[calc(100vh-176px)] content-start overflow-y-auto lg:grid-cols-2' : 'sm:grid-cols-2'}`}>
          <MediaPreview stream={localStream} muted label="Вы" />
          {remoteStreams.map((item) => (
            <div key={item.userId}>
              <MediaPreview stream={item.stream} volume={remoteVolumes[item.userId] ?? 1} label={item.displayName || 'Участник'} />
              <label className="mt-2 block rounded-2xl border border-x-border bg-x-bg/55 px-3 py-2 text-xs font-bold text-x-muted">
                Громкость участника {Math.round((remoteVolumes[item.userId] ?? 1) * 100)}%
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={remoteVolumes[item.userId] ?? 1}
                  onChange={(event) => onRemoteVolume(item.userId, Number(event.target.value))}
                  className="mt-2 w-full accent-cyan-300"
                />
                <span className="mt-2 inline-flex items-center gap-2">
                  <CallIcon name="headphones" off={(remoteVolumes[item.userId] ?? 1) === 0} />
                  {(remoteVolumes[item.userId] ?? 1) === 0 ? 'Не слышно' : 'Слышно'}
                </span>
              </label>
            </div>
          ))}
          <div className="rounded-2xl border border-x-border bg-x-bg/55 p-3 sm:col-span-2">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={onToggleMic} className={`rounded-full border px-4 py-2 text-xs font-black ${isMicOn ? 'border-cyan-300/45 text-x-accent' : 'border-red-400/40 text-red-300'}`}>
                <span className="inline-flex items-center gap-2">
                  <CallIcon name="mic" off={!isMicOn || micVolume === 0} />
                  {isMicOn ? 'Микрофон включён' : 'Микрофон выключен'}
                </span>
              </button>
              <button type="button" onClick={onToggleCamera} className={`rounded-full border px-4 py-2 text-xs font-black ${isCameraOn ? 'border-cyan-300/45 text-x-accent' : 'border-red-400/40 text-red-300'}`}>
                <span className="inline-flex items-center gap-2">
                  <CallIcon name="camera" off={!isCameraOn} />
                  {isCameraOn ? 'Камера включена' : 'Камера выключена'}
                </span>
              </button>
              <button type="button" onClick={onToggleRecording} className={`rounded-full border px-4 py-2 text-xs font-black ${isRecording ? 'border-red-400/45 bg-red-500/10 text-red-300' : 'border-cyan-300/45 text-x-accent'}`}>
                <span className="inline-flex items-center gap-2">
                  <CallIcon name="record" />
                  {isRecording ? 'Остановить запись' : 'Записать звонок'}
                </span>
              </button>
            </div>
            <div className="mt-3 rounded-2xl border border-x-border/70 bg-slate-950/45 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-1 text-xs font-black uppercase tracking-[0.14em] text-x-muted">Эффект лица</span>
                {CALL_STICKERS.map((sticker) => (
                  <button
                    key={sticker.id}
                    type="button"
                    disabled={!isCameraOn}
                    onClick={() => onStickerChange(sticker.id)}
                    className={`flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-45 ${
                      selectedSticker === sticker.id
                        ? 'border-cyan-300/70 bg-cyan-300/15 text-x-accent shadow-neon'
                        : 'border-x-border bg-x-surface/70 text-x-muted hover:border-x-accent/70 hover:text-x-text'
                    }`}
                  >
                    <span className="text-base leading-none">{sticker.icon}</span>
                    <span>{sticker.label}</span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] font-bold text-x-muted">
                {faceEffectAvailable ? 'Стикер цепляется к найденному лицу.' : 'FaceDetector недоступен в этом браузере, поэтому стикер держится в центре кадра.'}
              </p>
            </div>
            <label className="mt-3 block text-xs font-bold text-x-muted">
              Громкость вашего голоса {Math.round(micVolume * 100)}%
              <input
                type="range"
                min="0"
                max="1.5"
                step="0.05"
                value={micVolume}
                onChange={(event) => onMicVolume(Number(event.target.value))}
                className="mt-2 w-full accent-cyan-300"
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main ChatsPage ──────────────────────────────────────────────────────────
export default function ChatsPage() {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    chats,
    setChats,
    activeChat,
    setActiveChat,
    messages,
    setMessages,
    addMessage,
    updateMessage,
    removeMessage,
    updateChat,
    removeChat,
    clearUnread,
    setTyping,
    typingUsers,
    activeCall,
    incomingCall,
    setActiveCall,
    clearActiveCall,
    clearIncomingCall,
  } = useChatStore();
  const qc = useQueryClient();

  const [msgInput, setMsgInput] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [showInputEmoji, setShowInputEmoji] = useState(false);
  const [image, setImage] = useState(null);
  const [attachment, setAttachment] = useState(null);
  const messagesEndRef = useRef(null);
  const typingTimerRef = useRef(null);
  const fileRef = useRef();
  const localStreamRef = useRef(null);
  const rawLocalStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const micGainRef = useRef(null);
  const micOnRef = useRef(true);
  const analyserRef = useRef(null);
  const voiceAnimationRef = useRef(null);
  const voiceMeterRef = useRef(null);
  const processedVideoTrackRef = useRef(null);
  const videoEffectAnimationRef = useRef(null);
  const videoEffectTimerRef = useRef(null);
  const selectedStickerRef = useRef('none');
  const mediaRecorderRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const recordingUrlRef = useRef(null);
  const peerConnectionsRef = useRef({});
  const activeCallRef = useRef(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [callExpanded, setCallExpanded] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [micVolume, setMicVolume] = useState(1);
  const [isRecording, setIsRecording] = useState(false);
  const [selectedSticker, setSelectedSticker] = useState('none');
  const [faceEffectAvailable, setFaceEffectAvailable] = useState(false);
  const [remoteVolumes, setRemoteVolumes] = useState({});
  const [favoriteMessages, setFavoriteMessages] = useState(() => loadFavoriteMessages(user?.id));
  const faceApiLoadedRef = useRef(false);
  const faceDetectionRunningRef = useRef(false);
  const lastFaceDetectionTimeRef = useRef(0);
  const lastFaceSeenAtRef = useRef(0);

  // Load chats
  const { isLoading: chatsLoading } = useQuery({
    queryKey: ['chats'],
    queryFn: () => api.get('/chats').then((r) => { setChats(r.data.chats); return r.data.chats; }),
  });

  // Load messages for active chat
  const { isLoading: msgsLoading } = useQuery({
    queryKey: ['messages', chatId],
    queryFn: async () => {
      const { data } = await api.get(`/chats/${chatId}/messages?limit=50`);
      setMessages(chatId, data.messages);
      clearUnread(chatId);
      return data;
    },
    enabled: !!chatId && chatId !== FAVORITE_CHAT_ID,
  });

  useEffect(() => {
    setFavoriteMessages(loadFavoriteMessages(user?.id));
  }, [user?.id]);

  // Set active chat when chatId changes
  useEffect(() => {
    if (chatId === FAVORITE_CHAT_ID) {
      setActiveChat({
        id: FAVORITE_CHAT_ID,
        isFavorite: true,
        isGroup: false,
        otherUser: {
          id: user?.id,
          username: user?.username,
          displayName: 'Избранное',
          avatarUrl: user?.avatarUrl,
        },
        participants: user ? [user] : [],
      });
    } else if (chatId) {
      const chat = chats.find((c) => c.id === chatId);
      if (chat) setActiveChat(chat);
    } else {
      setActiveChat(null);
    }
  }, [chatId, chats]);

  // Socket: join/leave chat room & listen for messages
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !chatId || chatId === FAVORITE_CHAT_ID) return;

    socket.emit('chat:join', chatId);
    socket.emit('messages:read', { chatId });
    clearUnread(chatId);

    return () => socket.emit('chat:leave', chatId);
  }, [chatId]);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages[chatId]?.length, favoriteMessages.length]);

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: async () => {
      if (chatId === FAVORITE_CHAT_ID) {
        const attachmentUrl = image || attachment ? await fileToDataUrl(image || attachment) : null;
        const now = new Date().toISOString();
        const message = {
          id: `favorite-${Date.now()}`,
          chatId: FAVORITE_CHAT_ID,
          senderId: user?.id,
          content: attachment && !image
            ? [msgInput.trim(), `[[file:${attachment.name}|${attachmentUrl || ''}]]`].filter(Boolean).join('\n\n')
            : msgInput.trim() || (attachmentUrl ? 'Фото в избранном' : ''),
          imageUrl: image ? attachmentUrl : null,
          createdAt: now,
          editedAt: null,
          isRead: true,
          sender: {
            id: user?.id,
            username: user?.username,
            displayName: user?.displayName || 'Вы',
            avatarUrl: user?.avatarUrl,
          },
          reactions: [],
        };
        const next = [...favoriteMessages, message];
        saveFavoriteMessages(user?.id, next);
        setFavoriteMessages(next);
        return { favorite: true };
      }
      const socket = getSocket();
      if (socket?.connected && !image && !attachment) {
        socket.emit('message:send', { chatId, content: msgInput.trim() });
        return { viaSocket: true };
      }
      const fd = new FormData();
      fd.append('content', msgInput.trim());
      if (image || attachment) fd.append('attachment', image || attachment);
      return api.post(`/chats/${chatId}/messages`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: (res) => {
      if (res?.data?.message) addMessage(chatId, res.data.message);
      setMsgInput('');
      setImage(null);
      setAttachment(null);
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Ошибка отправки'),
  });

  const reactMutation = useMutation({
    mutationFn: ({ messageId, emoji }) => api.post(`/chats/${chatId}/messages/${messageId}/reactions`, { emoji }),
    onSuccess: ({ data }) => updateMessage(chatId, data.message),
    onError: (err) => toast.error(err.response?.data?.error || 'Не удалось поставить реакцию'),
  });

  const editMutation = useMutation({
    mutationFn: ({ messageId, content }) => api.patch(`/chats/${chatId}/messages/${messageId}`, { content }),
    onSuccess: ({ data }) => updateMessage(chatId, data.message),
    onError: (err) => toast.error(err.response?.data?.error || 'Не удалось изменить сообщение'),
  });

  const deleteMutation = useMutation({
    mutationFn: (messageId) => api.delete(`/chats/${chatId}/messages/${messageId}`),
    onSuccess: ({ data }) => removeMessage(chatId, data.messageId),
    onError: (err) => toast.error(err.response?.data?.error || 'Не удалось удалить сообщение'),
  });

  const updateGroupMutation = useMutation({
    mutationFn: (formData) => api.patch(`/chats/${chatId}/group`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
    onSuccess: ({ data }) => {
      updateChat(data.chat);
      qc.invalidateQueries({ queryKey: ['chats'] });
      toast.success('Группа обновлена');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Не удалось обновить группу'),
  });

  const addParticipantsMutation = useMutation({
    mutationFn: (participantIds) => api.post(`/chats/${chatId}/group/participants`, { participantIds }),
    onSuccess: ({ data }) => {
      updateChat(data.chat);
      qc.invalidateQueries({ queryKey: ['chats'] });
      toast.success('Участники добавлены');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Не удалось добавить участников'),
  });

  const removeParticipantMutation = useMutation({
    mutationFn: (targetUserId) => api.delete(`/chats/${chatId}/group/participants/${targetUserId}`),
    onSuccess: ({ data }) => {
      updateChat(data.chat);
      qc.invalidateQueries({ queryKey: ['chats'] });
      toast.success('Участник удалён');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Не удалось удалить участника'),
  });

  const updateParticipantRoleMutation = useMutation({
    mutationFn: ({ targetUserId, role }) => api.patch(`/chats/${chatId}/group/participants/${targetUserId}/role`, { role }),
    onSuccess: ({ data }) => {
      updateChat(data.chat);
      qc.invalidateQueries({ queryKey: ['chats'] });
      toast.success('Права участника обновлены');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Не удалось обновить права участника'),
  });

  const deleteGroupMutation = useMutation({
    mutationFn: () => api.delete(`/chats/${chatId}/group`),
    onSuccess: ({ data }) => {
      removeChat(data.chatId);
      qc.invalidateQueries({ queryKey: ['chats'] });
      setShowGroupSettings(false);
      navigate('/messages');
      toast.success('Группа удалена');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Не удалось удалить группу'),
  });

  const handleSend = () => {
    if (!msgInput.trim() && !image && !attachment) return;
    if (chatId === FAVORITE_CHAT_ID && (image || attachment) && (image || attachment).size > 2.5 * 1024 * 1024) {
      toast.error('Для локального Избранного вложение должно быть до 2.5MB');
      return;
    }
    sendMutation.mutate();
  };

  const appendEmoji = (emoji) => {
    setMsgInput((current) => current + emoji);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  useEffect(() => () => {
    if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
    stopVideoEffect();
    stopVoiceMeter();
  }, []);

  useEffect(() => {
    micOnRef.current = isMicOn;
  }, [isMicOn]);

  useEffect(() => {
    selectedStickerRef.current = selectedSticker;
  }, [selectedSticker]);

  const stopVoiceMeter = () => {
    if (voiceAnimationRef.current) cancelAnimationFrame(voiceAnimationRef.current);
    voiceAnimationRef.current = null;
    analyserRef.current = null;
    voiceMeterRef.current?.reset();
  };

  const startVoiceMeter = (analyser) => {
    stopVoiceMeter();
    analyser.fftSize = 512;
    const samples = new Uint8Array(analyser.fftSize);
    analyserRef.current = analyser;

    const tick = () => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (let index = 0; index < samples.length; index += 1) {
        const centered = (samples[index] - 128) / 128;
        sum += centered * centered;
      }
      const rms = Math.sqrt(sum / samples.length);
      voiceMeterRef.current?.update(micOnRef.current ? Math.min(1, rms * 4.8) : 0);
      voiceAnimationRef.current = requestAnimationFrame(tick);
    };

    tick();
  };

  const stopVideoEffect = () => {
    if (videoEffectAnimationRef.current) cancelAnimationFrame(videoEffectAnimationRef.current);
    if (videoEffectTimerRef.current) clearTimeout(videoEffectTimerRef.current);
    videoEffectAnimationRef.current = null;
    videoEffectTimerRef.current = null;
    if (processedVideoTrackRef.current) {
      processedVideoTrackRef.current.stop();
      processedVideoTrackRef.current = null;
    }
  };

  const createStickerVideoTrack = async (rawTrack, stickerId) => {
    stopVideoEffect();
    const sticker = CALL_STICKERS.find((item) => item.id === stickerId);
    if (!rawTrack || !sticker || sticker.id === 'none') return rawTrack;

    const sourceVideo = document.createElement('video');
    sourceVideo.muted = true;
    sourceVideo.playsInline = true;
    sourceVideo.srcObject = new MediaStream([rawTrack]);
    await sourceVideo.play().catch(() => {});

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const detectCanvas = document.createElement('canvas');
    const detectCtx = detectCanvas.getContext('2d', { willReadFrequently: true });

    detectCanvas.width = 320;
    detectCanvas.height = 180;
    if (!ctx || !canvas.captureStream) return rawTrack;
    const ensureFaceApiLoaded = async () => {
      if (faceApiLoadedRef.current) return true;

      try {
        await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
        faceApiLoadedRef.current = true;
        setFaceEffectAvailable(true);
        return true;
      } catch (error) {
        console.error('Face API load error:', error);
        setFaceEffectAvailable(false);
        return false;
      }
    };

    const faceApiReady = await ensureFaceApiLoaded();
    console.log('faceApiReady:', faceApiReady);
    let lastFace = null;

    const drawSticker = (box) => {
      if (!ctx || !box) return;
      const size = Math.max(72, Math.min(canvas.width, canvas.height) * 0.22, box.width * 0.92);
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      ctx.save();
      ctx.font = `${size}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(34, 211, 238, 0.75)';
      ctx.shadowBlur = 26;
      ctx.fillText(sticker.icon, x, y);
      ctx.restore();
    };

    const drawFrame = () => {
  if (rawTrack.readyState !== 'live') return;

  if (!sourceVideo.videoWidth || !sourceVideo.videoHeight) {
    videoEffectAnimationRef.current = requestAnimationFrame(drawFrame);
    return;
  }

  const width = sourceVideo.videoWidth || 640;
  const height = sourceVideo.videoHeight || 360;

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  ctx.drawImage(sourceVideo, 0, 0, width, height);

  const now = performance.now();

  if (
    faceApiReady &&
    detectCtx &&
    now - lastFaceDetectionTimeRef.current > 300 &&
    !faceDetectionRunningRef.current
  ) {
    lastFaceDetectionTimeRef.current = now;
    faceDetectionRunningRef.current = true;

    const scale = Math.min(320 / width, 240 / height);
    const detectWidth = Math.round(width * scale);
    const detectHeight = Math.round(height * scale);

    if (detectCanvas.width !== detectWidth) detectCanvas.width = detectWidth;
    if (detectCanvas.height !== detectHeight) detectCanvas.height = detectHeight;

    detectCtx.drawImage(canvas, 0, 0, detectWidth, detectHeight);

    faceapi
      .detectSingleFace(
        detectCanvas,
        new faceapi.TinyFaceDetectorOptions({
          inputSize: 320,
          scoreThreshold: 0.25,
        })
      )
      .then((detection) => {
        if (!detection?.box) return;

        lastFaceSeenAtRef.current = performance.now();

        const scaleBackX = width / detectWidth;
        const scaleBackY = height / detectHeight;

        const nextFace = {
          x: detection.box.x * scaleBackX,
          y: detection.box.y * scaleBackY,
          width: detection.box.width * scaleBackX,
          height: detection.box.height * scaleBackY,
        };

        if (lastFace) {
          const dx = Math.abs(nextFace.x - lastFace.x);
          const dy = Math.abs(nextFace.y - lastFace.y);
          const distance = Math.sqrt(dx * dx + dy * dy);

          const smooth = distance > 80 ? 0.35 : 0.18;

          lastFace = {
            x: lastFace.x + (nextFace.x - lastFace.x) * smooth,
            y: lastFace.y + (nextFace.y - lastFace.y) * smooth,
            width: lastFace.width + (nextFace.width - lastFace.width) * smooth,
            height: lastFace.height + (nextFace.height - lastFace.height) * smooth,
          };
        } else {
          lastFace = nextFace;
        }
      })
      .catch((error) => {
        console.error('Face detection error:', error);
      })
      .finally(() => {
        faceDetectionRunningRef.current = false;
      });
  }

  const fallbackFace = {
    x: width * 0.34,
    y: height * 0.22,
    width: width * 0.32,
    height: height * 0.46,
  };

  const faceIsStale = performance.now() - lastFaceSeenAtRef.current > 900;

  if (!lastFace) {
    lastFace = fallbackFace;
  } else if (faceIsStale) {
    const smooth = 0.08;

    lastFace = {
      x: lastFace.x + (fallbackFace.x - lastFace.x) * smooth,
      y: lastFace.y + (fallbackFace.y - lastFace.y) * smooth,
      width: lastFace.width + (fallbackFace.width - lastFace.width) * smooth,
      height: lastFace.height + (fallbackFace.height - lastFace.height) * smooth,
    };
  }

  drawSticker(lastFace);

  videoEffectAnimationRef.current = requestAnimationFrame(drawFrame);
};

    drawFrame();
    const processedStream = canvas.captureStream(24);
    const [processedTrack] = processedStream.getVideoTracks();
    processedTrack.enabled = rawTrack.enabled;
    processedTrackRefCleanup(processedTrack, rawTrack);
    processedVideoTrackRef.current = processedTrack;
    return processedTrack;
  };

  const processedTrackRefCleanup = (processedTrack, rawTrack) => {
    rawTrack.addEventListener('ended', () => processedTrack.stop(), { once: true });
  };

  const replaceOutgoingVideoTrack = async (videoTrack) => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getVideoTracks().forEach((track) => {
      localStreamRef.current.removeTrack(track);
      if (track !== videoTrack && track !== rawLocalStreamRef.current?.getVideoTracks()[0]) track.stop();
    });
    if (videoTrack) localStreamRef.current.addTrack(videoTrack);
    Object.values(peerConnectionsRef.current).forEach((pc) => {
      const sender = pc.getSenders().find((item) => item.track?.kind === 'video');
      if (sender) sender.replaceTrack(videoTrack);
      else if (videoTrack) pc.addTrack(videoTrack, localStreamRef.current);
    });
    setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
    setIsCameraOn(Boolean(videoTrack?.enabled));
  };

  const applyCameraEffect = async (stickerId = selectedStickerRef.current) => {
    const rawTrack = rawLocalStreamRef.current?.getVideoTracks()[0];
    if (!rawTrack || !localStreamRef.current) return;
    const previousProcessed = processedVideoTrackRef.current;
    const nextTrack = await createStickerVideoTrack(rawTrack, stickerId);

    if (!nextTrack) return;

    nextTrack.enabled = rawTrack.enabled;
    await replaceOutgoingVideoTrack(nextTrack);
    if (previousProcessed && previousProcessed !== nextTrack) previousProcessed.stop();
  };

  useEffect(() => {
    if (!localStreamRef.current || !rawLocalStreamRef.current?.getVideoTracks().length) return;

    applyCameraEffect(selectedSticker).catch(() => {
      toast.error('Не удалось применить эффект камеры');
    });
  }, [selectedSticker]);

  const getLocalStream = async (mode = 'audio', cameraEnabled = mode === 'video') => {
    if (localStreamRef.current) return localStreamRef.current;
    const rawStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: cameraEnabled,
    });
    rawLocalStreamRef.current = rawStream;

    const outgoingStream = new MediaStream();
    for (const track of rawStream.getVideoTracks()) {
      track.enabled = cameraEnabled;
      const outgoingTrack = await createStickerVideoTrack(track, selectedStickerRef.current);
      outgoingTrack.enabled = cameraEnabled;
      outgoingStream.addTrack(outgoingTrack);
    }

    const audioTrack = rawStream.getAudioTracks()[0];
    if (audioTrack) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        const context = new AudioContextClass();
        const source = context.createMediaStreamSource(new MediaStream([audioTrack]));
        const gain = context.createGain();
        const analyser = context.createAnalyser();
        gain.gain.value = isMicOn ? micVolume : 0;
        const destination = context.createMediaStreamDestination();
        source.connect(analyser);
        source.connect(gain).connect(destination);
        destination.stream.getAudioTracks().forEach((track) => {
          track.enabled = isMicOn;
          outgoingStream.addTrack(track);
        });
        audioContextRef.current = context;
        micGainRef.current = gain;
        startVoiceMeter(analyser);
      } else {
        audioTrack.enabled = isMicOn;
        outgoingStream.addTrack(audioTrack);
      }
    }

    localStreamRef.current = outgoingStream;
    setLocalStream(outgoingStream);
    setIsCameraOn(outgoingStream.getVideoTracks().some((track) => track.enabled));
    return outgoingStream;
  };

  const closePeerConnections = () => {
    Object.values(peerConnectionsRef.current).forEach((pc) => pc.close());
    peerConnectionsRef.current = {};
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    rawLocalStreamRef.current?.getTracks().forEach((track) => track.stop());
    stopVideoEffect();
    stopVoiceMeter();
    audioContextRef.current?.close?.();
    localStreamRef.current = null;
    rawLocalStreamRef.current = null;
    audioContextRef.current = null;
    micGainRef.current = null;
    setLocalStream(null);
    setRemoteStreams([]);
    setRemoteVolumes({});
    setCallExpanded(false);
    setIsRecording(false);
  };

  const createPeerConnection = async (peerUser, call) => {
    const socket = getSocket();
    if (!socket || !peerUser?.id || !call) return null;
    if (peerConnectionsRef.current[peerUser.id]) return peerConnectionsRef.current[peerUser.id];

    const stream = await getLocalStream(call.mode);
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('call:signal', {
          callId: call.id,
          chatId: call.chatId,
          targetUserId: peerUser.id,
          signal: { type: 'candidate', candidate: event.candidate },
        });
      }
    };
    pc.onnegotiationneeded = async () => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('call:signal', {
          callId: call.id,
          chatId: call.chatId,
          targetUserId: peerUser.id,
          signal: offer,
        });
      } catch (error) {
        toast.error('Не удалось обновить звонок');
      }
    };
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      setRemoteStreams((current) => {
        const next = current.filter((item) => item.userId !== peerUser.id);
        return [...next, { userId: peerUser.id, displayName: peerUser.displayName, stream: remoteStream }];
      });
    };
    peerConnectionsRef.current[peerUser.id] = pc;
    return pc;
  };

  const startCall = (mode = 'audio') => {
    const socket = getSocket();
    if (!socket || !activeChat?.id) {
      toast.error('Сокет ещё не подключился');
      return;
    }
    const cameraEnabled = mode === 'video';
    setIsCameraOn(cameraEnabled);
    getLocalStream(mode, cameraEnabled)
      .then(() => {
        socket.emit('chat:join', activeChat.id);
        socket.emit('call:start', { chatId: activeChat.id, mode });
      })
      .catch(() => toast.error('Не удалось получить доступ к микрофону или камере'));
  };

  const acceptCall = () => {
    const socket = getSocket();
    const call = incomingCall?.call;
    if (!socket || !call) return;
    const cameraEnabled = call.mode === 'video';
    setIsCameraOn(cameraEnabled);
    getLocalStream(call.mode, cameraEnabled)
      .then(() => {
        socket.emit('chat:join', call.chatId);
        socket.emit('call:join', { callId: call.id, chatId: call.chatId });
        setActiveCall({ call, status: 'connected', peers: [call.caller] });
      })
      .catch(() => toast.error('Не удалось получить доступ к микрофону или камере'));
  };

  const rejectCall = () => {
    const socket = getSocket();
    const call = incomingCall?.call;
    if (socket && call) socket.emit('call:reject', { callId: call.id, chatId: call.chatId });
    clearIncomingCall();
  };

  const endCall = () => {
    const socket = getSocket();
    const call = activeCall?.call;
    if (socket && call) socket.emit('call:end', { callId: call.id, chatId: call.chatId });
    closePeerConnections();
    clearActiveCall();
  };

  const stopCallRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const startCallRecording = () => {
    if (typeof MediaRecorder === 'undefined') {
      toast.error('Запись звонков не поддерживается этим браузером');
      return;
    }

    const tracks = [
      ...(localStreamRef.current?.getTracks() || []),
      ...remoteStreams.flatMap((item) => item.stream?.getTracks?.() || []),
    ].filter((track) => track.readyState === 'live');

    if (tracks.length === 0) {
      toast.error('Нет активных дорожек для записи');
      return;
    }

    const mimeType = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'audio/webm',
    ].find((type) => MediaRecorder.isTypeSupported(type));

    recordingChunksRef.current = [];
    const recorder = new MediaRecorder(new MediaStream(tracks), mimeType ? { mimeType } : undefined);
    mediaRecorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data?.size) recordingChunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || 'video/webm' });
      recordingChunksRef.current = [];
      setIsRecording(false);
      if (!blob.size) return;
      if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
      const url = URL.createObjectURL(blob);
      recordingUrlRef.current = url;
      const link = document.createElement('a');
      link.href = url;
      link.download = `zwitter-call-${format(new Date(), 'yyyy-MM-dd-HH-mm-ss')}.webm`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Запись звонка сохранена');
    };
    recorder.start(1000);
    setIsRecording(true);
    toast.success('Запись звонка началась');
  };

  const toggleCallRecording = () => {
    if (isRecording) stopCallRecording();
    else startCallRecording();
  };

  const toggleMic = () => {
    setIsMicOn((current) => {
      const next = !current;
      localStreamRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = next;
      });
      rawLocalStreamRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = next;
      });
      if (micGainRef.current) micGainRef.current.gain.value = next ? micVolume : 0;
      return next;
    });
  };

  const toggleCamera = async () => {
    const existingTracks = localStreamRef.current?.getVideoTracks() || [];
    if (existingTracks.length > 0 || rawLocalStreamRef.current?.getVideoTracks().length) {
      await replaceOutgoingVideoTrack(null);
      rawLocalStreamRef.current?.getVideoTracks().forEach((track) => {
        rawLocalStreamRef.current.removeTrack(track);
        track.stop();
      });
      if (processedVideoTrackRef.current) {
        processedVideoTrackRef.current.stop();
        processedVideoTrackRef.current = null;
      }
      stopVideoEffect();
      setIsCameraOn(false);
      setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      const socket = getSocket();
      const call = activeCallRef.current?.call;
      if (socket && call) socket.emit('call:media-state', { callId: call.id, chatId: call.chatId, cameraOn: false, micOn: isMicOn });
      return;
    }

    try {
      const videoStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      const [track] = videoStream.getVideoTracks();
      if (!track) return;
      track.enabled = true;
      if (!rawLocalStreamRef.current) rawLocalStreamRef.current = new MediaStream();
      if (!localStreamRef.current) localStreamRef.current = new MediaStream();
      rawLocalStreamRef.current.addTrack(track);
      const outgoingTrack = await createStickerVideoTrack(track, selectedStickerRef.current);
      await replaceOutgoingVideoTrack(outgoingTrack);
      setIsCameraOn(true);
      setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      const socket = getSocket();
      const call = activeCallRef.current?.call;
      if (socket && call) socket.emit('call:media-state', { callId: call.id, chatId: call.chatId, cameraOn: true, micOn: isMicOn });
    } catch (error) {
      toast.error('Не удалось включить камеру');
    }
  };

  const updateMicVolume = (value) => {
    setMicVolume(value);
    if (micGainRef.current) micGainRef.current.gain.value = isMicOn ? value : 0;
  };

  const updateRemoteVolume = (userId, value) => {
    setRemoteVolumes((current) => ({ ...current, [userId]: value }));
  };

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;

    const handlePeerJoined = async ({ user: peerUser }) => {
      const call = activeCallRef.current?.call;
      if (!call || !peerUser?.id || peerUser.id === user?.id) return;
      const pc = await createPeerConnection(peerUser, call);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('call:signal', {
        callId: call.id,
        chatId: call.chatId,
        targetUserId: peerUser.id,
        signal: offer,
      });
    };

    const handleSignal = async ({ from, signal }) => {
      const call = activeCallRef.current?.call;
      if (!call || !from?.id || from.id === user?.id) return;
      const pc = await createPeerConnection(from, call);
      if (signal.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('call:signal', {
          callId: call.id,
          chatId: call.chatId,
          targetUserId: from.id,
          signal: answer,
        });
      } else if (signal.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
      } else if (signal.type === 'candidate' && signal.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(() => {});
      }
    };

    const handleEnded = () => closePeerConnections();

    socket.on('call:peer-joined', handlePeerJoined);
    socket.on('call:signal', handleSignal);
    socket.on('call:ended', handleEnded);
    return () => {
      socket.off('call:peer-joined', handlePeerJoined);
      socket.off('call:signal', handleSignal);
      socket.off('call:ended', handleEnded);
    };
  }, [user?.id]);

  // Typing indicator
  const handleTyping = useCallback(() => {
    const socket = getSocket();
    if (!socket || !chatId || chatId === FAVORITE_CHAT_ID) return;
    socket.emit('typing:start', { chatId });
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => socket.emit('typing:stop', { chatId }), 2000);
  }, [chatId]);

  // Create new chat
  const createChatMutation = useMutation({
    mutationFn: (targetUserId) => api.post('/chats', { targetUserId }),
    onSuccess: ({ data }) => {
      setShowNewChat(false);
      qc.invalidateQueries({ queryKey: ['chats'] });
      navigate(`/messages/${data.chat.id}`);
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Ошибка'),
  });
  const createGroupMutation = useMutation({
    mutationFn: (payload) => api.post('/chats/groups', payload),
    onSuccess: ({ data }) => {
      setShowNewChat(false);
      qc.invalidateQueries({ queryKey: ['chats'] });
      navigate(`/messages/${data.chat.id}`);
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Не удалось создать группу'),
  });

  const updateFavoriteMessage = (messageId, content) => {
    const next = favoriteMessages.map((message) =>
      message.id === messageId ? { ...message, content, editedAt: new Date().toISOString() } : message
    );
    saveFavoriteMessages(user?.id, next);
    setFavoriteMessages(next);
  };

  const deleteFavoriteMessage = (messageId) => {
    const next = favoriteMessages.filter((message) => message.id !== messageId);
    saveFavoriteMessages(user?.id, next);
    setFavoriteMessages(next);
  };

  const toggleFavoriteReaction = (messageId, emoji) => {
    const next = favoriteMessages.map((message) => {
      if (message.id !== messageId) return message;
      const exists = message.reactions?.some((reaction) => reaction.userId === user?.id && reaction.emoji === emoji);
      return {
        ...message,
        reactions: exists
          ? message.reactions.filter((reaction) => !(reaction.userId === user?.id && reaction.emoji === emoji))
          : [...(message.reactions || []), { id: `${messageId}-${emoji}`, messageId, userId: user?.id, emoji, createdAt: new Date().toISOString() }],
      };
    });
    saveFavoriteMessages(user?.id, next);
    setFavoriteMessages(next);
  };

  const isFavoriteChat = chatId === FAVORITE_CHAT_ID;
  const currentMessages = isFavoriteChat ? favoriteMessages : messages[chatId] || [];
  const chatTyping = isFavoriteChat ? [] : (typingUsers[chatId] || []).filter((id) => id !== user?.id);
  const favoriteChat = {
    id: FAVORITE_CHAT_ID,
    isFavorite: true,
    isGroup: false,
    unreadCount: 0,
    updatedAt: favoriteMessages.at(-1)?.createdAt || new Date().toISOString(),
    lastMessage: favoriteMessages.at(-1) || null,
    otherUser: { id: user?.id, username: user?.username, displayName: 'Избранное', avatarUrl: user?.avatarUrl },
    participants: user ? [user] : [],
  };

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* Chat List */}
      <div className={`${chatId ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-[340px] border-r border-x-border/80 bg-x-bg/30 flex-shrink-0`}>
        <div className="cosmic-header px-4 py-3 flex items-center justify-between">
          <div>
            <p className="nebula-section-heading">Messenger</p>
            <h1 className="text-xl font-black">Сообщения</h1>
          </div>
          <button
            onClick={() => setShowNewChat(true)}
            className="p-2 rounded-full hover:bg-cyan-300/10 hover:shadow-neon transition text-x-accent"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
              <path d="M2.505 21.502c-.174 0-.349-.065-.478-.196a.682.682 0 01-.191-.607l1.069-5.972c-.459-.912-.7-1.923-.7-2.943a9.087 9.087 0 019.094-9.093c2.43 0 4.71.945 6.425 2.66a9.024 9.024 0 012.661 6.426 9.09 9.09 0 01-9.094 9.093c-.97 0-1.936-.153-2.859-.455l-5.744 1.075a.68.68 0 01-.183.012zM11.3 4.691a7.728 7.728 0 00-7.722 7.093c0 .924.19 1.829.565 2.691l.115.262-1.003 5.604 5.484-1.026.269.096c.893.319 1.83.48 2.791.48a7.726 7.726 0 007.72-7.723 7.683 7.683 0 00-2.265-5.458A7.687 7.687 0 0011.3 4.69z"/>
              <path d="M7.3 11.832h8a.75.75 0 000-1.5h-8a.75.75 0 000 1.5zm0 3h5a.75.75 0 000-1.5h-5a.75.75 0 000 1.5z"/>
            </svg>
          </button>
        </div>

        {chatsLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-7 h-7 border-2 border-x-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-y-auto flex-1">
            <ChatItem
              chat={favoriteChat}
              isActive={chatId === FAVORITE_CHAT_ID}
              onClick={() => navigate('/messages/favorites')}
            />
            {chats.length === 0 && (
              <div className="px-6 py-8 text-center">
                <p className="text-lg font-bold mb-2">Личные чаты пока пустые</p>
                <p className="text-x-muted mb-4 text-sm">Избранное уже доступно, а личный разговор можно начать отдельно.</p>
                <button onClick={() => setShowNewChat(true)} className="btn-accent px-5 py-2">
                  Новое сообщение
                </button>
              </div>
            )}
            {chats.map((chat) => (
              <ChatItem
                key={chat.id}
                chat={chat}
                isActive={chat.id === chatId}
                onClick={() => navigate(`/messages/${chat.id}`)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Chat Window */}
      {chatId ? (
        <div className="flex flex-col flex-1 h-full min-w-0">
          {/* Header */}
          <div className="cosmic-header px-4 py-3 flex items-center gap-3">
            <button onClick={() => navigate('/messages')} className="md:hidden p-1 rounded-full hover:bg-cyan-300/10">
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M20 11H7.414l4.293-4.293-1.414-1.414L3.586 12l6.707 6.707 1.414-1.414L7.414 13H20v-2z"/></svg>
            </button>
            <div className={`w-10 h-10 cosmic-avatar flex-shrink-0 ${activeChat?.isGroup || activeChat?.isFavorite ? 'rounded-2xl' : 'rounded-full'}`}>
              {activeChat?.isFavorite ? (
                <div className="flex h-full w-full items-center justify-center bg-fuchsia-300/10 font-black text-fuchsia-100">★</div>
              ) : activeChat?.isGroup && activeChat?.avatarUrl ? (
                <img src={activeChat.avatarUrl} alt={activeChat.name} className="h-full w-full object-cover" />
              ) : activeChat?.isGroup ? (
                <div className="flex h-full w-full items-center justify-center bg-cyan-300/10 font-black text-x-accent">
                  {activeChat.name?.[0]?.toUpperCase() || 'G'}
                </div>
              ) : activeChat?.otherUser?.avatarUrl ? (
                <img src={activeChat.otherUser.avatarUrl} alt={activeChat.otherUser.displayName} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center font-bold">{activeChat?.otherUser?.displayName?.[0]?.toUpperCase() || '?'}</div>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate font-bold leading-tight">{activeChat?.isFavorite ? 'Избранное' : activeChat?.isGroup ? activeChat.name : activeChat?.otherUser?.displayName}</p>
              <p className="truncate text-x-muted text-sm">
                {activeChat?.isFavorite ? 'Личный чат с собой' : activeChat?.isGroup ? activeChat.description || `${activeChat.participants?.length || 0} участников` : `@${activeChat?.otherUser?.username || ''}`}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {!activeChat?.isFavorite && (
                <>
                  <button type="button" onClick={() => startCall('audio')} className="panel-icon-button" aria-label="Аудиозвонок">
                    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M6.62 10.79a15.1 15.1 0 006.59 6.59l2.2-2.2a1 1 0 011.02-.24 11.36 11.36 0 003.57.57 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11.36 11.36 0 00.57 3.57 1 1 0 01-.24 1.02l-2.21 2.2z" /></svg>
                  </button>
                  <button type="button" onClick={() => startCall('video')} className="panel-icon-button" aria-label="Видеозвонок">
                    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M17 10.5V6c0-.55-.45-1-1-1H4C3.45 5 3 5.45 3 6v12c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-4.5l4 4v-11l-4 4z" /></svg>
                  </button>
                </>
              )}
              {activeChat?.isGroup && (
                <button type="button" onClick={() => setShowGroupSettings(true)} className="panel-icon-button" aria-label="Настройки группы">
                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M19.43 12.98c.04-.32.07-.65.07-.98s-.02-.66-.07-.98l2.11-1.65a.5.5 0 00.12-.64l-2-3.46a.5.5 0 00-.6-.22l-2.49 1a7.28 7.28 0 00-1.69-.98L14.5 2.42A.5.5 0 0014 2h-4a.5.5 0 00-.5.42L9.12 5.07c-.6.23-1.16.56-1.69.98l-2.49-1a.5.5 0 00-.6.22l-2 3.46a.5.5 0 00.12.64l2.11 1.65c-.04.32-.08.65-.08.98s.03.66.08.98l-2.11 1.65a.5.5 0 00-.12.64l2 3.46c.13.22.39.31.6.22l2.49-1c.53.41 1.09.74 1.69.98l.38 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.38-2.65c.6-.24 1.16-.57 1.69-.98l2.49 1c.22.08.47 0 .6-.22l2-3.46a.5.5 0 00-.12-.64l-2.11-1.65zM12 15.5A3.5 3.5 0 1112 8a3.5 3.5 0 010 7.5z"/></svg>
                </button>
              )}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto bg-x-bg/20 px-4 py-4">
            {msgsLoading && !isFavoriteChat ? (
              <div className="flex justify-center py-12">
                <div className="w-7 h-7 border-2 border-x-accent border-t-transparent rounded-full animate-spin" />
              </div>
            ) : currentMessages.length === 0 ? (
              <div className="flex min-h-full flex-col items-center justify-center text-center">
                <p className="text-x-muted">{isFavoriteChat ? 'Здесь можно писать себе заметки, ссылки и мысли.' : 'Нет сообщений. Начните разговор!'}</p>
              </div>
            ) : (
              <div className="flex min-h-full flex-col justify-end gap-1">
                {currentMessages.map((msg, index) => {
                  const previousMessage = currentMessages[index - 1];
                  const currentDate = getMessageDate(msg.createdAt);
                  const previousDate = previousMessage ? getMessageDate(previousMessage.createdAt) : null;
                  const showDateSeparator = currentDate && (!previousDate || !isSameDay(currentDate, previousDate));

                  return (
                    <div key={msg.id} className="contents">
                      {showDateSeparator && <ChatDateSeparator date={msg.createdAt} />}
                      <MessageBubble
                        message={msg}
                        isOwn={msg.senderId === user?.id}
                        showSender={activeChat?.isGroup}
                        currentUserId={user?.id}
                        onReact={(messageId, emoji) => isFavoriteChat ? toggleFavoriteReaction(messageId, emoji) : reactMutation.mutate({ messageId, emoji })}
                        onEdit={(messageId, content) => isFavoriteChat ? updateFavoriteMessage(messageId, content) : editMutation.mutate({ messageId, content })}
                        onDelete={(messageId) => isFavoriteChat ? deleteFavoriteMessage(messageId) : deleteMutation.mutate(messageId)}
                      />
                    </div>
                  );
                })}
                {chatTyping.length > 0 && (
                  <div className="flex items-center gap-1 text-x-muted text-sm mt-2">
                    <div className="flex gap-0.5 items-center">
                      <span className="w-1.5 h-1.5 bg-x-muted rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-x-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 bg-x-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span>печатает...</span>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-x-border/80 bg-x-panel/40 px-4 pb-20 pt-3 md:pb-3">
            {(image || attachment) && (
              <div className="mb-2 relative inline-block">
                {image ? (
                  <img src={URL.createObjectURL(image)} alt="preview" className="h-20 rounded-lg" />
                ) : (
                  <div className="flex min-w-56 items-center gap-3 rounded-lg border border-x-border bg-x-bg/60 px-4 py-3">
                    <div className="rounded-full border border-x-border px-2 py-1 text-xs font-black text-x-accent">FILE</div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-x-text">{attachment?.name}</p>
                      <p className="text-xs text-x-muted">{attachment ? Math.round(attachment.size / 1024) : 0} KB</p>
                    </div>
                  </div>
                )}
                <button onClick={() => { setImage(null); setAttachment(null); }} className="absolute -top-1 -right-1 bg-x-bg border border-x-border rounded-full p-0.5">
                  <svg viewBox="0 0 24 24" className="w-3 h-3 fill-current"><path d="M10.59 12L4.54 5.96l1.42-1.42L12 10.59l6.04-6.05 1.42 1.42L13.41 12l6.05 6.04-1.42 1.42L12 13.41l-6.04 6.05-1.42-1.42L10.59 12z"/></svg>
                </button>
              </div>
            )}
            <div className="flex items-end gap-3 bg-x-surface/90 border border-x-border rounded-2xl px-4 py-2 shadow-inner">
              <input
                ref={fileRef}
                type="file"
                accept="image/*,.pdf,.doc,.docx,.txt,.zip,.rar"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  if (!file) return;
                  if (file.type.startsWith('image/')) {
                    setImage(file);
                    setAttachment(null);
                  } else {
                    setAttachment(file);
                    setImage(null);
                  }
                }}
              />
              <button onClick={() => fileRef.current?.click()} className="text-x-accent p-1 rounded-full hover:bg-x-accent/10 hover:shadow-neon flex-shrink-0 mb-0.5" title="Добавить вложение">
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M3 5.5C3 4.119 4.119 3 5.5 3h13C19.881 3 21 4.119 21 5.5v13c0 1.381-1.119 2.5-2.5 2.5h-13C4.119 21 3 19.881 3 18.5v-13zM5.5 5c-.276 0-.5.224-.5.5v9.086l3-3 3 3 5-5 3 3V5.5c0-.276-.224-.5-.5-.5h-13zM19 15.414l-3-3-5 5-3-3-3 3V18.5c0 .276.224.5.5.5h13c.276 0 .5-.224.5-.5v-3.086zM9.75 7C8.784 7 8 7.784 8 8.75s.784 1.75 1.75 1.75 1.75-.784 1.75-1.75S10.716 7 9.75 7z"/></svg>
              </button>
              <div className="relative flex-shrink-0 mb-0.5">
                <button type="button" onClick={() => setShowInputEmoji((v) => !v)} className="text-x-accent p-1 rounded-full hover:bg-x-accent/10 hover:shadow-neon">
                  ☺
                </button>
                {showInputEmoji && (
                  <div className="absolute bottom-full left-0 z-30 mb-3 flex max-h-[500px] w-[470px] max-w-[calc(100vw-48px)] flex-col overflow-hidden rounded-3xl border border-cyan-300/25 bg-slate-950/95 shadow-[0_0_44px_rgba(34,211,238,0.26)] backdrop-blur-xl">
                    <div className="flex items-center gap-2 border-b border-x-border/80 bg-x-panel/70 px-3 py-2">
                      {EMOJI_CATEGORIES.map((category) => (
                        <a
                          key={category.id}
                          href={`#emoji-${category.id}`}
                          className="flex h-9 w-9 items-center justify-center rounded-2xl text-xl transition hover:bg-cyan-300/10 focus:outline-none focus-visible:ring-0"
                          onClick={(event) => event.stopPropagation()}
                          aria-label={category.title}
                        >
                          {category.icon}
                        </a>
                      ))}
                    </div>
                    <div className="settings-emoji-scroll flex-1 overflow-y-auto px-4 py-3">
                      {EMOJI_CATEGORIES.map((category) => (
                        <section key={category.id} id={`emoji-${category.id}`} className="mb-5 scroll-mt-3 last:mb-0">
                          <h3 className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-x-muted">
                            {category.title}
                          </h3>
                          <div className="grid grid-cols-8 gap-1.5">
                            {category.emojis.map((emoji) => (
                              <button
                                key={`${category.id}-${emoji}`}
                                type="button"
                                onClick={() => appendEmoji(emoji)}
                                className="flex aspect-square min-h-11 items-center justify-center rounded-2xl text-[1.7rem] leading-none transition hover:bg-cyan-300/10 hover:shadow-neon"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </section>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <textarea
                value={msgInput}
                onChange={(e) => { setMsgInput(e.target.value); if (!isFavoriteChat) handleTyping(); }}
                onKeyDown={handleKeyDown}
                placeholder={isFavoriteChat ? 'Написать себе...' : 'Написать сообщение...'}
                rows={1}
                className="flex-1 bg-transparent resize-none focus:outline-none text-[15px] max-h-32 overflow-y-auto py-1.5"
              />
              <button
                onClick={handleSend}
                disabled={(!msgInput.trim() && !image) || sendMutation.isPending}
                className="text-x-accent p-1 rounded-full hover:bg-x-accent/10 hover:shadow-neon flex-shrink-0 mb-0.5 disabled:opacity-30 transition"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M2.504 21.866l.526-2.108C3.04 19.756 4 15.515 4 12S3.04 4.245 3.03 4.242L2.504 2.134 22 12 2.504 21.866zM4.981 6.242C4.818 7.658 4 11.211 4 12c0 .789.818 4.342.981 5.758L18.24 12 4.981 6.242z"/></svg>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-start justify-center px-8 pt-14">
          <div className="nebula-card max-w-sm rounded-3xl p-6 text-center">
          <div className="mx-auto flex w-16 h-16 rounded-full bg-x-surface border border-x-border shadow-neon items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-8 h-8 fill-current text-x-muted">
              <path d="M1.998 5.5c0-1.381 1.119-2.5 2.5-2.5h15c1.381 0 2.5 1.119 2.5 2.5v13c0 1.381-1.119 2.5-2.5 2.5h-15c-1.381 0-2.5-1.119-2.5-2.5v-13zm2.5-.5c-.276 0-.5.224-.5.5v2.764l8 3.638 8-3.638V5.5c0-.276-.224-.5-.5-.5h-15zm15.5 5.463l-7.5 3.41-7.5-3.41V18.5c0 .276.224.5.5.5h14c.276 0 .5-.224.5-.5v-8.037z"/>
            </svg>
          </div>
          <p className="mt-4 text-2xl font-black">Выберите чат</p>
          <p className="mt-2 text-x-muted">Выберите существующий разговор или создайте новый</p>
          <button onClick={() => setShowNewChat(true)} className="btn-accent mt-5 px-5 py-2">
            Новое сообщение
          </button>
          </div>
        </div>
      )}

      {/* New Chat Modal */}
      {showNewChat && (
        <NewChatModal
          onClose={() => setShowNewChat(false)}
          onSelect={(u) => createChatMutation.mutate(u.id)}
          onCreateGroup={(payload) => createGroupMutation.mutate(payload)}
        />
      )}
      {showGroupSettings && activeChat?.isGroup && (
        <GroupSettingsModal
          chat={activeChat}
          currentUserId={user?.id}
          plusActive={hasPlusAccess(user)}
          onClose={() => setShowGroupSettings(false)}
          onSave={(formData) => updateGroupMutation.mutate(formData)}
          onAddParticipants={(participantIds) => addParticipantsMutation.mutateAsync(participantIds)}
          onToggleAdmin={(targetUserId, role) => updateParticipantRoleMutation.mutate({ targetUserId, role })}
          onRemoveParticipant={(targetUserId) => removeParticipantMutation.mutate(targetUserId)}
          onDeleteGroup={() => {
            if (window.confirm('Удалить группу вместе со всеми сообщениями?')) {
              deleteGroupMutation.mutate();
            }
          }}
          isSaving={
            updateGroupMutation.isPending ||
            addParticipantsMutation.isPending ||
            updateParticipantRoleMutation.isPending ||
            removeParticipantMutation.isPending ||
            deleteGroupMutation.isPending
          }
        />
      )}
      <CallTray
        incomingCall={incomingCall}
        activeCall={activeCall}
        localStream={localStream}
        remoteStreams={remoteStreams}
        callExpanded={callExpanded}
        isMicOn={isMicOn}
        isCameraOn={isCameraOn}
        micVolume={micVolume}
        voiceMeterRef={voiceMeterRef}
        remoteVolumes={remoteVolumes}
        isRecording={isRecording}
        selectedSticker={selectedSticker}
        faceEffectAvailable={faceEffectAvailable}
        onAccept={acceptCall}
        onReject={rejectCall}
        onEnd={endCall}
        onToggleRecording={toggleCallRecording}
        onToggleExpanded={() => setCallExpanded((value) => !value)}
        onToggleMic={toggleMic}
        onToggleCamera={toggleCamera}
        onStickerChange={setSelectedSticker}
        onMicVolume={updateMicVolume}
        onRemoteVolume={updateRemoteVolume}
      />
    </div>
  );
}
