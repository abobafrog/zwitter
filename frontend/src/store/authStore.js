// src/store/authStore.js
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../services/api';

const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isLoading: false,

      setAuth: (user, accessToken, refreshToken) =>
        set({ user, accessToken, refreshToken }),

      updateUser: (updates) =>
        set((state) => ({ user: state.user ? { ...state.user, ...updates } : null })),

      setTokens: (accessToken, refreshToken) =>
        set({ accessToken, refreshToken }),

      login: async (loginInput, password) => {
        set({ isLoading: true });
        try {
          const { data } = await api.post('/auth/login', { login: loginInput, password });
          set({ user: data.user, accessToken: data.accessToken, refreshToken: data.refreshToken });
          return { success: true };
        } catch (error) {
          return { success: false, error: error.response?.data?.error || 'Ошибка входа' };
        } finally {
          set({ isLoading: false });
        }
      },

      register: async (userData) => {
        set({ isLoading: true });
        try {
          const { data } = await api.post('/auth/register', userData);
          set({ user: data.user, accessToken: data.accessToken, refreshToken: data.refreshToken });
          return { success: true };
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
          const { refreshToken } = get();
          if (refreshToken) await api.post('/auth/logout', { refreshToken });
        } catch {}
        set({ user: null, accessToken: null, refreshToken: null });
      },

      isAuthenticated: () => !!get().user && !!get().accessToken,
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
    }
  )
);

export default useAuthStore;
