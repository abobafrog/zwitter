const PLUS_STORAGE_KEY = 'zwitter-plus-users';
const PLUS_THEME_KEY = 'zwitter-plus-theme';

const readPlusUsers = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(PLUS_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writePlusUsers = (users) => {
  localStorage.setItem(PLUS_STORAGE_KEY, JSON.stringify(users));
};

export const isPlusUser = (user) => {
  if (!user) return false;
  if (user.isPlus) return true;
  const users = readPlusUsers();
  return users.some((item) => item.id === user.id || item.username === user.username);
};

export const hasPlusAccess = (user) => isPlusUser(user);

export const getStoredPlusTheme = () => localStorage.getItem(PLUS_THEME_KEY) || 'neon';

export const applyPlusTheme = (theme = getStoredPlusTheme()) => {
  document.documentElement.dataset.plusTheme = theme;
  return theme;
};

export const savePlusTheme = (theme) => {
  localStorage.setItem(PLUS_THEME_KEY, theme);
  applyPlusTheme(theme);
};

export const activatePlusForUser = (user) => {
  if (!user) return false;
  const users = readPlusUsers();
  const next = [
    { id: user.id, username: user.username, activatedAt: new Date().toISOString() },
    ...users.filter((item) => item.id !== user.id && item.username !== user.username),
  ].slice(0, 20);
  writePlusUsers(next);
  return true;
};

export const clearPlusForUser = (user) => {
  if (!user) return;
  const users = readPlusUsers().filter((item) => item.id !== user.id && item.username !== user.username);
  writePlusUsers(users);
};
