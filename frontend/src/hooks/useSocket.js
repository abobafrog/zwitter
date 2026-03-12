// src/hooks/useSocket.js
import { useEffect, useRef } from 'react';
import { connectSocket, disconnectSocket, getSocket } from '../services/socket';
import useAuthStore from '../store/authStore';
import useChatStore from '../store/chatStore';

export const useSocket = () => {
  const { accessToken, isAuthenticated } = useAuthStore();
  const { addMessage, setTyping, setUserOnline, setUserOffline, incrementUnread, activeChat } = useChatStore();
  const initialized = useRef(false);

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
    });

    socket.on('chat:notification', ({ chatId, message }) => {
      if (chatId !== activeChat?.id) {
        incrementUnread(chatId);
      }
    });

    socket.on('typing:start', ({ chatId, userId, user }) => {
      setTyping(chatId, userId, true);
    });

    socket.on('typing:stop', ({ chatId, userId }) => {
      setTyping(chatId, userId, false);
    });

    socket.on('user:online', ({ userId }) => setUserOnline(userId));
    socket.on('user:offline', ({ userId }) => setUserOffline(userId));

    return () => {
      disconnectSocket();
      initialized.current = false;
    };
  }, [accessToken, isAuthenticated()]);

  return getSocket();
};
