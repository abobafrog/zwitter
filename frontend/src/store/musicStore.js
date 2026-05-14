import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const normalizeTrack = (track) => {
  if (!track) return null;
  if (track.source === 'custom') {
    const sourceId = track.sourceId || track.id?.replace?.(/^custom-/, '') || `${Date.now()}`;
    return {
      ...track,
      id: track.id || `custom-${sourceId}`,
      sourceId,
      audioUrl: track.audioUrl || track.streamUrl || '',
      source: 'custom',
      provider: 'custom',
      providerLabel: track.providerLabel || 'Личная библиотека',
      previewOnly: false,
      sourceLink: track.sourceLink || '',
      lyrics: track.lyrics || '',
      fullArtworkUrl: track.fullArtworkUrl || track.thumbnailUrl || '',
    };
  }

  if (track.source === 'catalog') {
    const sourceId = track.sourceId || track.id?.replace?.(/^catalog-/, '') || `${Date.now()}`;
    return {
      ...track,
      id: track.id || `catalog-${sourceId}`,
      sourceId,
      audioUrl: track.audioUrl || track.streamUrl || '',
      source: 'catalog',
      provider: track.provider || 'catalog',
      providerLabel: track.providerLabel || 'Каталог',
      previewOnly: Boolean(track.previewOnly),
      sourceLink: track.sourceLink || '',
      lyrics: track.lyrics || '',
      fullArtworkUrl: track.fullArtworkUrl || track.thumbnailUrl || '',
    };
  }

  const sourceId = track.sourceId || track.id?.replace?.(/^muffon-[^-]+-/, '');
  const audioUrl = track.audioUrl || track.streamUrl || '';
  if (track.source !== 'muffon' || !sourceId || !audioUrl) return null;
  return {
    ...track,
    id: track.id || `muffon-${track.provider || 'source'}-${sourceId}`,
    sourceId,
    audioUrl,
    source: 'muffon',
    fullArtworkUrl: track.fullArtworkUrl || track.thumbnailUrl || '',
  };
};

const normalizePlaylistName = (name) => name?.trim() || 'Новый плейлист';

const nextPlaylistTrack = (state, playlistId = state.activePlaylistId, offset = 1) => {
  const playlist = state.playlists.find((item) => item.id === playlistId);
  if (!playlist?.tracks?.length) return null;
  const currentIndex = playlist.tracks.findIndex((track) => track.id === state.currentTrack?.id);
  const baseIndex = currentIndex >= 0 ? currentIndex : state.activePlaylistIndex || 0;
  const nextIndex = (baseIndex + offset + playlist.tracks.length) % playlist.tracks.length;
  return { track: playlist.tracks[nextIndex], index: nextIndex };
};

const pushHistory = (history, track) => {
  const nextTrack = normalizeTrack(track);
  if (!nextTrack) return history;
  return [
    nextTrack,
    ...history.filter((item) => item.id !== nextTrack.id),
  ].slice(0, 24);
};

const useMusicStore = create(
  persist(
    (set, get) => ({
      currentTrack: null,
      error: '',
      isPlaying: false,
      isPanelOpen: false,
      libraryTracks: [],
      history: [],
      hideExplicit: false,
      radioSeed: '',
      panelFrame: { width: 460, height: 430, left: null, top: null },
      playbackRate: 1,
      playlists: [],
      activePlaylistId: null,
      activePlaylistIndex: 0,
      playTrack: (track) => {
        const nextTrack = normalizeTrack(track);
        if (!nextTrack) {
          set({ error: 'У трека нет аудиопотока.', isPlaying: false, isPanelOpen: false });
          return;
        }
        if (!nextTrack.audioUrl) {
          set({
            currentTrack: nextTrack,
            activePlaylistId: null,
            activePlaylistIndex: 0,
            error: 'У этого трека пока нет аудиопотока. Добавь ссылку на поток или выбери другой вариант.',
            isPlaying: false,
            isPanelOpen: true,
          });
          return;
        }
        set({
          currentTrack: nextTrack,
          history: pushHistory(get().history, nextTrack),
          activePlaylistId: null,
          activePlaylistIndex: 0,
          error: '',
          isPlaying: true,
          isPanelOpen: Boolean(nextTrack?.audioUrl),
        });
      },
      addLibraryTrack: (track) => {
        const nextTrack = normalizeTrack({ ...track, source: 'custom' });
        if (!nextTrack?.title) return null;
        set((state) => ({
          libraryTracks: [
            nextTrack,
            ...state.libraryTracks.filter((item) => item.id !== nextTrack.id),
          ],
        }));
        return nextTrack.id;
      },
      updateLibraryTrack: (trackId, patch) => set((state) => ({
        libraryTracks: state.libraryTracks.map((track) => (
          track.id === trackId ? normalizeTrack({ ...track, ...patch, source: 'custom' }) : track
        )).filter(Boolean),
      })),
      removeLibraryTrack: (trackId) => set((state) => ({
        libraryTracks: state.libraryTracks.filter((track) => track.id !== trackId),
        currentTrack: state.currentTrack?.id === trackId ? null : state.currentTrack,
        isPlaying: state.currentTrack?.id === trackId ? false : state.isPlaying,
        isPanelOpen: state.currentTrack?.id === trackId ? false : state.isPanelOpen,
        error: state.currentTrack?.id === trackId ? '' : state.error,
      })),
      createPlaylist: (name) => {
        const title = normalizePlaylistName(name);
        const id = `playlist-${Date.now()}`;
        set((state) => ({
          playlists: [...state.playlists, { id, name: title, tracks: [], createdAt: new Date().toISOString() }],
        }));
        return id;
      },
      renamePlaylist: (playlistId, name) => set((state) => ({
        playlists: state.playlists.map((playlist) => (
          playlist.id === playlistId ? { ...playlist, name: normalizePlaylistName(name) } : playlist
        )),
      })),
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
          history: pushHistory(get().history, track),
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
          history: pushHistory(get().history, next.track),
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
          history: pushHistory(get().history, next.track),
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
        isPanelOpen: Boolean(state.currentTrack),
      })),
      setPlaybackRate: (playbackRate) => set({ playbackRate: Math.min(2.5, Math.max(0.1, Number(playbackRate) || 1)) }),
      setHideExplicit: (hideExplicit) => set({ hideExplicit: Boolean(hideExplicit) }),
      setRadioSeed: (radioSeed) => set({ radioSeed: radioSeed?.trim?.() || '' }),
      setPanelFrame: (panelFrame) => set((state) => ({
        panelFrame: {
          ...state.panelFrame,
          ...panelFrame,
        },
      })),
      importSharedPlaylist: (payload) => {
        const tracks = (payload?.tracks || []).map(normalizeTrack).filter(Boolean);
        if (!tracks.length) return null;
        const id = `playlist-${Date.now()}`;
        set((state) => ({
          playlists: [...state.playlists, {
            id,
            name: normalizePlaylistName(payload?.name),
            tracks,
            createdAt: new Date().toISOString(),
          }],
        }));
        return id;
      },
      setError: (error) => set({ error }),
      stop: () => set({ isPlaying: false, isPanelOpen: false, activePlaylistId: null, error: '' }),
      showPanel: () => set({ isPanelOpen: true }),
      hidePanel: () => set({ isPanelOpen: false }),
    }),
    {
      name: 'music-storage',
      version: 11,
      migrate: (persistedState) => {
        const playlists = Array.isArray(persistedState?.playlists)
          ? persistedState.playlists.map((playlist) => ({
            ...playlist,
            tracks: (playlist.tracks || []).map(normalizeTrack).filter(Boolean),
          })).filter((playlist) => playlist.tracks.length > 0)
          : [];
        return {
          currentTrack: null,
          isPlaying: false,
          isPanelOpen: false,
          libraryTracks: Array.isArray(persistedState?.libraryTracks)
            ? persistedState.libraryTracks.map(normalizeTrack).filter(Boolean)
            : [],
          history: Array.isArray(persistedState?.history)
            ? persistedState.history.map(normalizeTrack).filter((track) => track?.source !== 'muffon')
            : [],
          hideExplicit: Boolean(persistedState?.hideExplicit),
          radioSeed: persistedState?.radioSeed || '',
          panelFrame: {
            width: Math.max(360, Number(persistedState?.panelFrame?.width) || 460),
            height: Math.max(360, Number(persistedState?.panelFrame?.height) || 430),
            left: Number.isFinite(Number(persistedState?.panelFrame?.left)) ? Number(persistedState.panelFrame.left) : null,
            top: Number.isFinite(Number(persistedState?.panelFrame?.top)) ? Number(persistedState.panelFrame.top) : null,
          },
          playbackRate: Math.min(2.5, Math.max(0.1, Number(persistedState?.playbackRate) || 1)),
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
        libraryTracks: state.libraryTracks,
        history: state.history,
        hideExplicit: state.hideExplicit,
        radioSeed: state.radioSeed,
        panelFrame: state.panelFrame,
        playbackRate: state.playbackRate,
        playlists: state.playlists,
        activePlaylistId: state.activePlaylistId,
        activePlaylistIndex: state.activePlaylistIndex,
      }),
    }
  )
);

export default useMusicStore;
