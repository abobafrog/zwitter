import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const languages = [
  ['ru', 'Русский'],
  ['en', 'English'],
  ['zh', '中文'],
  ['fr', 'Français'],
  ['de', 'Deutsch'],
  ['es', 'Español'],
  ['it', 'Italiano'],
  ['ja', '日本語'],
  ['ko', '한국어'],
];

const useLanguageStore = create(
  persist(
    (set) => ({
      language: 'ru',
      setLanguage: (language) => set({ language }),
    }),
    { name: 'language-storage' }
  )
);

export default useLanguageStore;
