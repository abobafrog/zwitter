import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import ladyGagaTracks from '../data/ladyGagaTracks';

const normalizeTrack = (track) => {
  if (!track) return null;
  const audioUrl = track.audioUrl || track.streamUrl || '';
  if (!audioUrl) return null;
  return {
    ...track,
    id: track.id || track.title,
    audioUrl,
    source: track.source || 'opensubsonic',
  };
};

const nextPlaylistTrack = (state, playlistId = state.activePlaylistId, offset = 1) => {
  const playlist = state.playlists.find((item) => item.id === playlistId);
  if (!playlist?.tracks?.length) return null;
  const currentIndex = playlist.tracks.findIndex((track) => track.id === state.currentTrack?.id);
  const baseIndex = currentIndex >= 0 ? currentIndex : state.activePlaylistIndex || 0;
  const nextIndex = (baseIndex + offset + playlist.tracks.length) % playlist.tracks.length;
  return { track: playlist.tracks[nextIndex], index: nextIndex };
};

const useMusicStore = create(
  persist(
    (set, get) => ({
      currentTrack: ladyGagaTracks[0],
      error: '',
      isPlaying: false,
      isPanelOpen: false,
      playlists: [],
      activePlaylistId: null,
      activePlaylistIndex: 0,
      playTrack: (track) => {
        const nextTrack = normalizeTrack(track);
        if (!nextTrack) {
          set({ error: 'У трека нет аудиопотока.', isPlaying: false, isPanelOpen: false });
          return;
        }
        set({
          currentTrack: nextTrack,
          activePlaylistId: null,
          activePlaylistIndex: 0,
          error: '',
          isPlaying: true,
          isPanelOpen: Boolean(nextTrack?.audioUrl),
        });
      },
      createPlaylist: (name) => {
        const title = name?.trim() || 'Новый плейлист';
        const id = `playlist-${Date.now()}`;
        set((state) => ({
          playlists: [...state.playlists, { id, name: title, tracks: [], createdAt: new Date().toISOString() }],
        }));
        return id;
      },
      deletePlaylist: (playlistId) => set((state) => ({
        playlists: state.playlists.filter((playlist) => playlist.id !== playlistId),
        activePlaylistId: state.activePlaylistId === playlistId ? null : state.activePlaylistId,
      })),
      addToPlaylist: (playlistId, track) => {
        const nextTrack = normalizeTrack(track);
        if (!playlistId || !nextTrack) return;
        set((state) => ({
          playlists: state.playlists.map((playlist) => (
            playlist.id === playlistId && !playlist.tracks.some((item) => item.id === nextTrack.id)
              ? { ...playlist, tracks: [...playlist.tracks, nextTrack] }
              : playlist
          )),
        }));
      },
      removeFromPlaylist: (playlistId, trackId) => set((state) => ({
        playlists: state.playlists.map((playlist) => (
          playlist.id === playlistId
            ? { ...playlist, tracks: playlist.tracks.filter((track) => track.id !== trackId) }
            : playlist
        )),
      })),
      playPlaylist: (playlistId, startIndex = 0) => {
        const playlist = get().playlists.find((item) => item.id === playlistId);
        const track = playlist?.tracks?.[startIndex] || playlist?.tracks?.[0];
        if (!track) return;
        set({
          currentTrack: track,
          activePlaylistId: playlistId,
          activePlaylistIndex: playlist.tracks.findIndex((item) => item.id === track.id),
          error: '',
          isPlaying: true,
          isPanelOpen: Boolean(track?.audioUrl),
        });
      },
      playNextInPlaylist: () => {
        const next = nextPlaylistTrack(get());
        if (!next) return;
        set({
          currentTrack: next.track,
          activePlaylistIndex: next.index,
          error: '',
          isPlaying: true,
          isPanelOpen: Boolean(next.track?.audioUrl),
        });
      },
      playPreviousInPlaylist: () => {
        const next = nextPlaylistTrack(get(), get().activePlaylistId, -1);
        if (!next) return;
        set({
          currentTrack: next.track,
          activePlaylistIndex: next.index,
          error: '',
          isPlaying: true,
          isPanelOpen: Boolean(next.track?.audioUrl),
        });
      },
      pausePlayback: () => set((state) => ({ ...state, isPlaying: false })),
      resumePlayback: () => set((state) => ({
        ...state,
        isPlaying: Boolean(state.currentTrack?.audioUrl),
        isPanelOpen: Boolean(state.currentTrack?.audioUrl),
      })),
      setError: (error) => set({ error }),
      stop: () => set({ isPlaying: false, isPanelOpen: false, activePlaylistId: null, error: '' }),
      showPanel: () => set({ isPanelOpen: true }),
      hidePanel: () => set({ isPanelOpen: false }),
    }),
    {
      name: 'music-storage',
      version: 5,
      migrate: (persistedState) => {
        const savedTrack = ladyGagaTracks.find((track) => track.id === persistedState?.currentTrack?.id);
        const playlists = Array.isArray(persistedState?.playlists)
          ? persistedState.playlists.map((playlist) => ({
            ...playlist,
            tracks: (playlist.tracks || []).map(normalizeTrack).filter(Boolean),
          }))
          : [];
        return {
          currentTrack: normalizeTrack(persistedState?.currentTrack) || savedTrack || ladyGagaTracks[0],
          isPlaying: Boolean(persistedState?.isPlaying),
          isPanelOpen: Boolean(persistedState?.isPanelOpen),
          playlists,
          activePlaylistId: persistedState?.activePlaylistId || null,
          activePlaylistIndex: Number(persistedState?.activePlaylistIndex) || 0,
          error: '',
        };
      },
      partialize: (state) => ({
        currentTrack: state.currentTrack,
        isPlaying: state.isPlaying,
        isPanelOpen: state.isPanelOpen,
        playlists: state.playlists,
        activePlaylistId: state.activePlaylistId,
        activePlaylistIndex: state.activePlaylistIndex,
      }),
    }
  )
);

export default useMusicStore;
