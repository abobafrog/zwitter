const baseKey = (userId) => `zwitter-drafts-v1-${userId || 'guest'}`;

export const normalizeHashtags = (value = '') => {
  const seen = new Set();
  return value.replace(/#[\p{L}\p{N}_-]+/gu, (tag) => {
    const key = tag.toLowerCase();
    if (seen.has(key)) return '';
    seen.add(key);
    return tag;
  }).replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+\n/g, '\n').trimStart();
};

export const extractHashtags = (value = '') => [...new Set(value.match(/#[\p{L}\p{N}_-]+/gu) || [])];

export const loadDrafts = (userId) => {
  try {
    const parsed = JSON.parse(localStorage.getItem(baseKey(userId)) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveDrafts = (userId, drafts) => {
  localStorage.setItem(baseKey(userId), JSON.stringify(drafts));
  window.dispatchEvent(new CustomEvent('zwitter:drafts-changed'));
};

export const upsertDraft = (userId, draft) => {
  const drafts = loadDrafts(userId);
  const now = new Date().toISOString();
  const content = normalizeHashtags(draft.content || '');
  const nextDraft = {
    id: draft.id || `draft-${Date.now()}`,
    type: draft.type || 'tweet',
    title: draft.title || 'Черновик',
    content,
    tags: extractHashtags(content),
    sourcePath: draft.sourcePath || '/home',
    createdAt: draft.createdAt || now,
    updatedAt: now,
  };
  const next = [nextDraft, ...drafts.filter((item) => item.id !== nextDraft.id)]
    .filter((item) => item.content?.trim())
    .slice(0, 80);
  saveDrafts(userId, next);
  return nextDraft;
};

export const deleteDraft = (userId, draftId) => {
  saveDrafts(userId, loadDrafts(userId).filter((item) => item.id !== draftId));
};
