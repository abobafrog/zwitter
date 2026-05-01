// src/store/authStore.js
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../services/api';
import { clearAccessToken, setAccessToken } from '../services/tokenStore';

const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      isLoading: false,
      hasCheckedAuth: false,

      setAuth: (user, accessToken) => {
        setAccessToken(accessToken);
        set({ user, accessToken });
      },

      updateUser: (updates) =>
        set((state) => ({ user: state.user ? { ...state.user, ...updates } : null })),

      setTokens: (accessToken) => {
        setAccessToken(accessToken);
        set({ accessToken });
      },

      initializeAuth: async () => {
        try {
          const { data } = await api.post('/auth/refresh');
          setAccessToken(data.accessToken);
          set({ user: data.user, accessToken: data.accessToken, hasCheckedAuth: true });
          return true;
        } catch {
          clearAccessToken();
          set({ user: null, accessToken: null, hasCheckedAuth: true });
          return false;
        }
      },

      login: async (loginInput, password) => {
        set({ isLoading: true });
        try {
          const { data } = await api.post('/auth/login', { login: loginInput, password });
          setAccessToken(data.accessToken);
          set({ user: data.user, accessToken: data.accessToken, hasCheckedAuth: true });
          return { success: true };
        } catch (error) {
          return {
            success: false,
            error: error.response?.data?.error || 'Ошибка входа',
            code: error.response?.data?.code,
            email: error.response?.data?.email,
          };
        } finally {
          set({ isLoading: false });
        }
      },

      register: async (userData) => {
        set({ isLoading: true });
        try {
          const { data } = await api.post('/auth/register', userData);
          return { success: true, message: data.message, emailSent: data.emailSent };
        } catch (error) {
          // Берём текст ошибки с сервера напрямую
          const serverError = error.response?.data?.error || '';
          const details = error.response?.data?.details;
          
          // Если есть детали валидации — собираем их
          const msg = details
            ? details.map((d) => d.message).join(', ')
            : serverError || 'Ошибка регистрации';
      
          return { success: false, error: msg };
        } finally {
          set({ isLoading: false });
        }
      },

      logout: async () => {
        try {
          await api.post('/auth/logout');
        } catch {}
        clearAccessToken();
        set({ user: null, accessToken: null });
      },

      isAuthenticated: () => !!get().user && !!get().accessToken,
    }),
    {
      name: 'auth-storage',
      version: 2,
      migrate: (persistedState) => ({
        user: persistedState?.user || null,
        accessToken: null,
        isLoading: false,
        hasCheckedAuth: false,
      }),
      partialize: (state) => ({
        user: state.user,
      }),
    }
  )
);

export default useAuthStore;
