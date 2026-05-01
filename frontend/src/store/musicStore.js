import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import ladyGagaTracks from '../data/ladyGagaTracks';

const useMusicStore = create(
  persist(
    (set) => ({
      currentTrack: ladyGagaTracks[0],
      error: '',
      isPlaying: false,
      isPanelOpen: false,
      playTrack: (track) => set({ currentTrack: track, error: '', isPlaying: true, isPanelOpen: false }),
      setError: (error) => set({ error }),
      stop: () => set({ isPlaying: false, isPanelOpen: false, error: '' }),
      showPanel: () => set({ isPanelOpen: true }),
      hidePanel: () => set({ isPanelOpen: false }),
    }),
    {
      name: 'music-storage',
      version: 2,
      migrate: (persistedState) => {
        const savedTrack = ladyGagaTracks.find((track) => track.id === persistedState?.currentTrack?.id);
        return {
          currentTrack: savedTrack || ladyGagaTracks[0],
          isPlaying: Boolean(persistedState?.isPlaying),
          isPanelOpen: Boolean(persistedState?.isPanelOpen),
          error: '',
        };
      },
      partialize: (state) => ({
        currentTrack: state.currentTrack,
        isPlaying: state.isPlaying,
        isPanelOpen: state.isPanelOpen,
      }),
    }
  )
);

export default useMusicStore;
