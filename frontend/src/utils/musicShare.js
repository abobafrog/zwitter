const utf8ToBase64 = (value) => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary);
};

const base64ToUtf8 = (value) => {
  const binary = window.atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

export const buildTrackSharePath = (track) => {
  const params = new URLSearchParams();
  params.set('musicQuery', [track.artist, track.title].filter(Boolean).join(' ').trim());
  params.set('musicTrack', track.id);
  return `/music?${params.toString()}`;
};

export const buildTrackShareUrl = (track) => {
  const origin = window.location.origin;
  return `${origin}${buildTrackSharePath(track)}`;
};

export const buildPlaylistShareUrl = (playlist) => {
  const origin = window.location.origin;
  const payload = utf8ToBase64(JSON.stringify({
    name: playlist.name,
    tracks: playlist.tracks,
  }));
  return `${origin}/music?musicPlaylist=${encodeURIComponent(payload)}`;
};

export const decodeSharedPlaylist = (encodedValue) => {
  if (!encodedValue) return null;
  try {
    const raw = base64ToUtf8(decodeURIComponent(encodedValue));
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.tracks)) return null;
    return {
      name: parsed.name || 'Поделились плейлистом',
      tracks: parsed.tracks,
    };
  } catch {
    return null;
  }
};
