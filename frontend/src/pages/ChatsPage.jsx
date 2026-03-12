// src/pages/ChatsPage.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import toast from 'react-hot-toast';
import api from '../services/api';
import { getSocket } from '../services/socket';
import useAuthStore from '../store/authStore';
import useChatStore from '../store/chatStore';

// ─── Chat List Item ──────────────────────────────────────────────────────────
function ChatItem({ chat, isActive, onClick }) {
  const { user } = useAuthStore();
  const { onlineUsers } = useChatStore();
  const other = chat.otherUser;
  const isOnline = other && onlineUsers.has(other.id);
  const timeAgo = chat.lastMessage
    ? formatDistanceToNow(new Date(chat.lastMessage.createdAt), { locale: ru, addSuffix: false })
    : '';

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${isActive ? 'bg-white/10' : 'hover:bg-white/5'}`}
    >
      <div className="relative flex-shrink-0">
        <div className="w-12 h-12 rounded-full bg-x-surface overflow-hidden border border-x-border">
          {other?.avatarUrl
            ? <img src={other.avatarUrl} alt={other.displayName} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center font-bold text-lg">
                {other?.displayName?.[0]?.toUpperCase() || '?'}
              </div>
          }
        </div>
        {isOnline && (
          <span className="absolute bottom-0.5 right-0.5 w-3 h-3 bg-x-success rounded-full border-2 border-black" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold truncate">{other?.displayName || 'Чат'}</span>
          {timeAgo && <span className="text-x-muted text-xs flex-shrink-0">{timeAgo}</span>}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-x-muted text-sm truncate">
            {chat.lastMessage
              ? (chat.lastMessage.sender?.id === useAuthStore.getState().user?.id ? 'Вы: ' : '') + chat.lastMessage.content
              : '@' + other?.username}
          </span>
          {chat.unreadCount > 0 && (
            <span className="bg-x-accent text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0">
              {chat.unreadCount > 9 ? '9+' : chat.unreadCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Message Bubble ──────────────────────────────────────────────────────────
function MessageBubble({ message, isOwn }) {
  const timeStr = formatDistanceToNow(new Date(message.createdAt), { locale: ru, addSuffix: true });
  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-1 group`}>
      <div className={`max-w-[75%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
        <div className={`px-4 py-2.5 rounded-2xl text-[15px] leading-relaxed ${
          isOwn
            ? 'bg-x-accent text-white rounded-br-sm'
            : 'bg-x-surface text-x-text rounded-bl-sm'
        }`}>
          {message.imageUrl && (
            <img src={message.imageUrl} alt="media" className="rounded-lg mb-2 max-w-full" />
          )}
          <p className="break-words">{message.content}</p>
        </div>
        <span className="text-[11px] text-x-muted px-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {timeStr}
          {isOwn && message.isRead && ' · Прочитано'}
        </span>
      </div>
    </div>
  );
}

// ─── New Chat Modal ──────────────────────────────────────────────────────────
function NewChatModal({ onClose, onSelect }) {
  const [q, setQ] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['search-users-modal', q],
    queryFn: () => api.get(`/users/search?q=${q}`).then((r) => r.data.users),
    enabled: q.trim().length > 0,
  });

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-x-surface border border-x-border rounded-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b border-x-border">
          <button onClick={onClose} className="p-1 rounded-full hover:bg-white/10">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M10.59 12L4.54 5.96l1.42-1.42L12 10.59l6.04-6.05 1.42 1.42L13.41 12l6.05 6.04-1.42 1.42L12 13.41l-6.04 6.05-1.42-1.42L10.59 12z"/></svg>
          </button>
          <h2 className="font-bold text-lg">Новое сообщение</h2>
          <div className="w-7" />
        </div>
        <div className="px-4 py-3">
          <input
            autoFocus
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск пользователей..."
            className="input-field"
          />
        </div>
        <div className="max-h-64 overflow-y-auto">
          {isLoading && <div className="px-4 py-3 text-x-muted text-sm">Поиск...</div>}
          {data?.map((u) => (
            <button key={u.id} onClick={() => onSelect(u)} className="flex items-center gap-3 w-full px-4 py-3 hover:bg-white/5 transition-colors">
              <div className="w-10 h-10 rounded-full bg-x-border overflow-hidden flex-shrink-0">
                {u.avatarUrl ? <img src={u.avatarUrl} alt={u.displayName} className="w-full h-full object-cover" /> : (
                  <div className="w-full h-full flex items-center justify-center font-bold">{u.displayName?.[0]?.toUpperCase()}</div>
                )}
              </div>
              <div className="text-left">
                <p className="font-bold text-sm">{u.displayName}</p>
                <p className="text-x-muted text-sm">@{u.username}</p>
              </div>
            </button>
          ))}
          {q && !isLoading && data?.length === 0 && (
            <p className="px-4 py-3 text-x-muted text-sm">Пользователи не найдены</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main ChatsPage ──────────────────────────────────────────────────────────
export default function ChatsPage() {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { chats, setChats, activeChat, setActiveChat, messages, setMessages, addMessage, clearUnread, setTyping, typingUsers } = useChatStore();
  const qc = useQueryClient();

  const [msgInput, setMsgInput] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [image, setImage] = useState(null);
  const messagesEndRef = useRef(null);
  const typingTimerRef = useRef(null);
  const fileRef = useRef();

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
    enabled: !!chatId,
  });

  // Set active chat when chatId changes
  useEffect(() => {
    if (chatId) {
      const chat = chats.find((c) => c.id === chatId);
      if (chat) setActiveChat(chat);
    } else {
      setActiveChat(null);
    }
  }, [chatId, chats]);

  // Socket: join/leave chat room & listen for messages
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !chatId) return;

    socket.emit('chat:join', chatId);
    socket.emit('messages:read', { chatId });
    clearUnread(chatId);

    return () => socket.emit('chat:leave', chatId);
  }, [chatId]);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages[chatId]?.length]);

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: async () => {
      const socket = getSocket();
      if (socket?.connected && !image) {
        socket.emit('message:send', { chatId, content: msgInput.trim() });
        return { viaSocket: true };
      }
      const fd = new FormData();
      fd.append('content', msgInput.trim());
      if (image) fd.append('image', image);
      return api.post(`/chats/${chatId}/messages`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: (res) => {
      if (res?.data?.message) addMessage(chatId, res.data.message);
      setMsgInput('');
      setImage(null);
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Ошибка отправки'),
  });

  const handleSend = () => {
    if (!msgInput.trim() && !image) return;
    sendMutation.mutate();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // Typing indicator
  const handleTyping = useCallback(() => {
    const socket = getSocket();
    if (!socket || !chatId) return;
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

  const currentMessages = messages[chatId] || [];
  const chatTyping = (typingUsers[chatId] || []).filter((id) => id !== user?.id);

  return (
    <div className="flex h-screen">
      {/* Chat List */}
      <div className={`${chatId ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-[380px] border-r border-x-border flex-shrink-0`}>
        <div className="sticky top-0 z-10 bg-black/80 backdrop-blur-md border-b border-x-border px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold">Сообщения</h1>
          <button
            onClick={() => setShowNewChat(true)}
            className="p-2 rounded-full hover:bg-white/10 transition-colors text-x-accent"
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
        ) : chats.length === 0 ? (
          <div className="flex flex-col items-center py-16 px-8 text-center">
            <p className="text-2xl font-bold mb-2">Добро пожаловать в сообщения!</p>
            <p className="text-x-muted mb-4">Отправьте личное сообщение любому пользователю</p>
            <button onClick={() => setShowNewChat(true)} className="btn-accent px-5 py-2">
              Новое сообщение
            </button>
          </div>
        ) : (
          <div className="overflow-y-auto flex-1">
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
          <div className="sticky top-0 z-10 bg-black/80 backdrop-blur-md border-b border-x-border px-4 py-3 flex items-center gap-3">
            <button onClick={() => navigate('/messages')} className="md:hidden p-1 rounded-full hover:bg-white/10">
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M20 11H7.414l4.293-4.293-1.414-1.414L3.586 12l6.707 6.707 1.414-1.414L7.414 13H20v-2z"/></svg>
            </button>
            {activeChat?.otherUser && (
              <>
                <div className="w-10 h-10 rounded-full bg-x-surface overflow-hidden border border-x-border flex-shrink-0">
                  {activeChat.otherUser.avatarUrl
                    ? <img src={activeChat.otherUser.avatarUrl} alt={activeChat.otherUser.displayName} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center font-bold">{activeChat.otherUser.displayName?.[0]?.toUpperCase()}</div>
                  }
                </div>
                <div>
                  <p className="font-bold leading-tight">{activeChat.otherUser.displayName}</p>
                  <p className="text-x-muted text-sm">@{activeChat.otherUser.username}</p>
                </div>
              </>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {msgsLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-7 h-7 border-2 border-x-accent border-t-transparent rounded-full animate-spin" />
              </div>
            ) : currentMessages.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-center">
                <p className="text-x-muted">Нет сообщений. Начните разговор!</p>
              </div>
            ) : (
              <>
                {currentMessages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} isOwn={msg.senderId === user?.id} />
                ))}
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
              </>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-x-border px-4 py-3">
            {image && (
              <div className="mb-2 relative inline-block">
                <img src={URL.createObjectURL(image)} alt="preview" className="h-20 rounded-lg" />
                <button onClick={() => setImage(null)} className="absolute -top-1 -right-1 bg-black border border-x-border rounded-full p-0.5">
                  <svg viewBox="0 0 24 24" className="w-3 h-3 fill-current"><path d="M10.59 12L4.54 5.96l1.42-1.42L12 10.59l6.04-6.05 1.42 1.42L13.41 12l6.05 6.04-1.42 1.42L12 13.41l-6.04 6.05-1.42-1.42L10.59 12z"/></svg>
                </button>
              </div>
            )}
            <div className="flex items-end gap-3 bg-x-surface rounded-2xl px-4 py-2">
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => setImage(e.target.files?.[0] || null)} />
              <button onClick={() => fileRef.current?.click()} className="text-x-accent p-1 rounded-full hover:bg-x-accent/10 flex-shrink-0 mb-0.5">
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M3 5.5C3 4.119 4.119 3 5.5 3h13C19.881 3 21 4.119 21 5.5v13c0 1.381-1.119 2.5-2.5 2.5h-13C4.119 21 3 19.881 3 18.5v-13zM5.5 5c-.276 0-.5.224-.5.5v9.086l3-3 3 3 5-5 3 3V5.5c0-.276-.224-.5-.5-.5h-13zM19 15.414l-3-3-5 5-3-3-3 3V18.5c0 .276.224.5.5.5h13c.276 0 .5-.224.5-.5v-3.086zM9.75 7C8.784 7 8 7.784 8 8.75s.784 1.75 1.75 1.75 1.75-.784 1.75-1.75S10.716 7 9.75 7z"/></svg>
              </button>
              <textarea
                value={msgInput}
                onChange={(e) => { setMsgInput(e.target.value); handleTyping(); }}
                onKeyDown={handleKeyDown}
                placeholder="Написать сообщение..."
                rows={1}
                className="flex-1 bg-transparent resize-none focus:outline-none text-[15px] max-h-32 overflow-y-auto py-1.5"
              />
              <button
                onClick={handleSend}
                disabled={(!msgInput.trim() && !image) || sendMutation.isPending}
                className="text-x-accent p-1 rounded-full hover:bg-x-accent/10 flex-shrink-0 mb-0.5 disabled:opacity-30 transition-opacity"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M2.504 21.866l.526-2.108C3.04 19.756 4 15.515 4 12S3.04 4.245 3.03 4.242L2.504 2.134 22 12 2.504 21.866zM4.981 6.242C4.818 7.658 4 11.211 4 12c0 .789.818 4.342.981 5.758L18.24 12 4.981 6.242z"/></svg>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center flex-col gap-4">
          <div className="w-16 h-16 rounded-full bg-x-surface flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-8 h-8 fill-current text-x-muted">
              <path d="M1.998 5.5c0-1.381 1.119-2.5 2.5-2.5h15c1.381 0 2.5 1.119 2.5 2.5v13c0 1.381-1.119 2.5-2.5 2.5h-15c-1.381 0-2.5-1.119-2.5-2.5v-13zm2.5-.5c-.276 0-.5.224-.5.5v2.764l8 3.638 8-3.638V5.5c0-.276-.224-.5-.5-.5h-15zm15.5 5.463l-7.5 3.41-7.5-3.41V18.5c0 .276.224.5.5.5h14c.276 0 .5-.224.5-.5v-8.037z"/>
            </svg>
          </div>
          <p className="text-2xl font-bold">Выберите чат</p>
          <p className="text-x-muted text-center max-w-xs">Выберите существующий разговор или создайте новый</p>
          <button onClick={() => setShowNewChat(true)} className="btn-accent px-5 py-2">
            Новое сообщение
          </button>
        </div>
      )}

      {/* New Chat Modal */}
      {showNewChat && (
        <NewChatModal
          onClose={() => setShowNewChat(false)}
          onSelect={(u) => createChatMutation.mutate(u.id)}
        />
      )}
    </div>
  );
}
