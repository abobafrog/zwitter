const CALENDAR_KEY = 'zwitter-calendar-events';
const CALENDAR_READ_KEY = 'zwitter-calendar-reminder-read';

const calendarStorageKey = (userId) => `${CALENDAR_KEY}-${userId || 'guest'}`;
const calendarReadKey = (userId) => `${CALENDAR_READ_KEY}-${userId || 'guest'}`;

const readJson = (key, fallback) => {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event('zwitter:calendar-updated'));
};

const parseEventDate = (event) => {
  const raw = `${event.date || ''}T${event.time || '09:00'}`;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const getCalendarNotifications = (userId) => {
  const events = readJson(calendarStorageKey(userId), []);
  const readState = readJson(calendarReadKey(userId), {});
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const notifications = events
    .map((event) => {
      const eventDate = parseEventDate(event);
      if (!eventDate) return null;
      const diff = eventDate.getTime() - now;
      if (diff < -dayMs || diff > dayMs) return null;

      const stage = diff <= 0 ? 'started' : diff <= 60 * 60 * 1000 ? 'soon' : 'today';
      const id = `calendar-${event.id}-${stage}`;
      return {
        id,
        type: 'calendar',
        isRead: Boolean(readState[id]),
        createdAt: event.createdAt || eventDate.toISOString(),
        eventId: event.id,
        title: event.title,
        note: event.note || '',
        stage,
        eventDate: eventDate.toISOString(),
        from: {
          id: 'calendar-service',
          username: 'calendar',
          displayName: 'Календарь',
          avatarUrl: null,
          isVerified: false,
        },
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate));

  return {
    notifications,
    unreadCount: notifications.filter((item) => !item.isRead).length,
  };
};

export const markCalendarNotificationRead = (userId, notificationId) => {
  const next = {
    ...readJson(calendarReadKey(userId), {}),
    [notificationId]: true,
  };
  writeJson(calendarReadKey(userId), next);
};

export const markAllCalendarNotificationsRead = (userId) => {
  const { notifications } = getCalendarNotifications(userId);
  const next = readJson(calendarReadKey(userId), {});
  notifications.forEach((item) => {
    next[item.id] = true;
  });
  writeJson(calendarReadKey(userId), next);
};
