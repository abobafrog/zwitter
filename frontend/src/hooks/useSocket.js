// src/hooks/useSocket.js
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { connectSocket, disconnectSocket, getSocket } from '../services/socket';
import useAuthStore from '../store/authStore';
import useChatStore from '../store/chatStore';

export const useSocket = () => {
  const { accessToken, isAuthenticated } = useAuthStore();
  const {
    addMessage,
    addOrUpdateChat,
    updateMessage,
    removeMessage,
    setTyping,
    setUserOnline,
    setUserOffline,
    incrementUnread,
    updateChat,
    removeChat,
    setIncomingCall,
    clearIncomingCall,
    setActiveCall,
    clearActiveCall,
  } = useChatStore();
  const initialized = useRef(false);
  const qc = useQueryClient();

  useEffect(() => {
    if (!isAuthenticated() || !accessToken) {
      disconnectSocket();
      initialized.current = false;
      return;
    }

    if (initialized.current) return;
    initialized.current = true;

    const socket = connectSocket(accessToken);

    socket.on('message:new', ({ message, chatId }) => {
      addMessage(chatId, message);
      qc.invalidateQueries({ queryKey: ['chats'] });
    });

    socket.on('message:updated', ({ message, chatId }) => {
      updateMessage(chatId, message);
    });

    socket.on('message:deleted', ({ messageId, chatId }) => {
      removeMessage(chatId, messageId);
    });

    socket.on('notification:new', () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    });

    socket.on('chat:notification', ({ chatId, message }) => {
      const { activeChat, chats } = useChatStore.getState();
      if (chats.some((chat) => chat.id === chatId)) {
        addOrUpdateChat({
          id: chatId,
          lastMessage: message,
          updatedAt: message?.createdAt || new Date().toISOString(),
        });
      }
      if (chatId !== activeChat?.id) {
        incrementUnread(chatId);
      }
      qc.invalidateQueries({ queryKey: ['chats'] });
    });

    socket.on('chat:updated', ({ chat }) => {
      updateChat(chat);
      qc.invalidateQueries({ queryKey: ['chats'] });
    });

    socket.on('chat:deleted', ({ chatId }) => {
      removeChat(chatId);
      qc.invalidateQueries({ queryKey: ['chats'] });
    });

    socket.on('typing:start', ({ chatId, userId, user }) => {
      setTyping(chatId, userId, true);
    });

    socket.on('typing:stop', ({ chatId, userId }) => {
      setTyping(chatId, userId, false);
    });

    socket.on('user:online', ({ userId }) => setUserOnline(userId));
    socket.on('user:offline', ({ userId }) => setUserOffline(userId));

    socket.on('call:ring', (payload) => {
      setIncomingCall(payload);
    });

    socket.on('call:started', ({ call }) => {
      setActiveCall({ call, status: 'calling', peers: [] });
    });

    socket.on('call:peer-joined', ({ user }) => {
      setActiveCall({ call: useChatStore.getState().activeCall?.call, status: 'connected', peers: [user].filter(Boolean) });
    });

    socket.on('call:rejected', () => {
      clearIncomingCall();
    });

    socket.on('call:ended', () => {
      clearIncomingCall();
      clearActiveCall();
    });

    return () => {
      disconnectSocket();
      initialized.current = false;
    };
  }, [accessToken, isAuthenticated(), qc]);

  return getSocket();
};
