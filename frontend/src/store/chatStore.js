// src/store/chatStore.js
import { create } from 'zustand';

const useChatStore = create((set, get) => ({
  chats: [],
  activeChat: null,
  messages: {}, // chatId -> messages[]
  typingUsers: {}, // chatId -> userId[]
  onlineUsers: new Set(),
  activeCall: null,
  incomingCall: null,

  setChats: (chats) => set({ chats }),

  updateChat: (chat) =>
    set((state) => ({
      chats: state.chats.map((item) => (item.id === chat.id ? { ...item, ...chat } : item)),
      activeChat: state.activeChat?.id === chat.id ? { ...state.activeChat, ...chat } : state.activeChat,
    })),

  removeChat: (chatId) =>
    set((state) => ({
      chats: state.chats.filter((item) => item.id !== chatId),
      activeChat: state.activeChat?.id === chatId ? null : state.activeChat,
    })),

  addOrUpdateChat: (chat) =>
    set((state) => {
      const idx = state.chats.findIndex((c) => c.id === chat.id);
      if (idx >= 0) {
        const updated = [...state.chats];
        updated[idx] = { ...updated[idx], ...chat };
        return { chats: updated.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)) };
      }
      return { chats: [chat, ...state.chats] };
    }),

  setActiveChat: (chat) => set({ activeChat: chat }),

  setMessages: (chatId, messages) =>
    set((state) => ({ messages: { ...state.messages, [chatId]: messages } })),

  prependMessages: (chatId, older) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [chatId]: [...older, ...(state.messages[chatId] || [])],
      },
    })),

  addMessage: (chatId, message) =>
    set((state) => {
      const existing = state.messages[chatId] || [];
      if (existing.some((m) => m.id === message.id)) return state;
      const updated = [...existing, message];
      const updatedChats = state.chats.map((c) =>
        c.id === chatId ? { ...c, lastMessage: message, updatedAt: message.createdAt } : c
      );
      return {
        messages: { ...state.messages, [chatId]: updated },
        chats: updatedChats.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)),
      };
    }),

  updateMessage: (chatId, message) =>
    set((state) => {
      const existing = state.messages[chatId] || [];
      const updatedMessages = existing.map((m) => (m.id === message.id ? message : m));
      const updatedChats = state.chats.map((c) =>
        c.id === chatId && c.lastMessage?.id === message.id ? { ...c, lastMessage: message } : c
      );
      return {
        messages: { ...state.messages, [chatId]: updatedMessages },
        chats: updatedChats,
      };
    }),

  removeMessage: (chatId, messageId) =>
    set((state) => {
      const updatedMessages = (state.messages[chatId] || []).filter((m) => m.id !== messageId);
      const updatedChats = state.chats.map((c) => {
        if (c.id !== chatId || c.lastMessage?.id !== messageId) return c;
        return { ...c, lastMessage: updatedMessages[updatedMessages.length - 1] || null };
      });
      return {
        messages: { ...state.messages, [chatId]: updatedMessages },
        chats: updatedChats,
      };
    }),

  setTyping: (chatId, userId, isTyping) =>
    set((state) => {
      const current = state.typingUsers[chatId] || [];
      const updated = isTyping
        ? [...new Set([...current, userId])]
        : current.filter((id) => id !== userId);
      return { typingUsers: { ...state.typingUsers, [chatId]: updated } };
    }),

  setUserOnline: (userId) =>
    set((state) => ({ onlineUsers: new Set([...state.onlineUsers, userId]) })),

  setUserOffline: (userId) =>
    set((state) => {
      const s = new Set(state.onlineUsers);
      s.delete(userId);
      return { onlineUsers: s };
    }),

  incrementUnread: (chatId) =>
    set((state) => ({
      chats: state.chats.map((c) =>
        c.id === chatId ? { ...c, unreadCount: (c.unreadCount || 0) + 1 } : c
      ),
    })),

  clearUnread: (chatId) =>
    set((state) => ({
      chats: state.chats.map((c) => (c.id === chatId ? { ...c, unreadCount: 0 } : c)),
    })),

  setIncomingCall: (payload) => set({ incomingCall: payload }),
  clearIncomingCall: () => set({ incomingCall: null }),
  setActiveCall: (payload) => set({ activeCall: payload, incomingCall: null }),
  clearActiveCall: () => set({ activeCall: null }),
}));

export default useChatStore;
