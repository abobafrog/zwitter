const isAdmin = (user) => user?.role === 'admin';

const isBanned = (user) => Boolean(user?.isBanned);

module.exports = {
  isAdmin,
  isBanned,
};
