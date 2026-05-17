// src/components/chat/TweetComposer.jsx
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import { hasPlusAccess } from '../../utils/plus';
import { deleteDraft, loadDrafts, normalizeHashtags, upsertDraft } from '../../utils/drafts';

const moodOptions = [
  { label: 'Спокойно', tag: '#мысли' },
  { label: 'Идея', tag: '#идея' },
  { label: 'Вопрос', tag: '#вопрос' },
  { label: 'Релиз', tag: '#релиз' },
];

const promptIdeas = [
  'Что сегодня получилось лучше, чем ожидалось?',
  'Какая маленькая находка заслуживает внимания?',
  'Задай вопрос, на который хочется получить честные ответы.',
  'Поделись прогрессом: что изменилось с прошлого раза?',
];

export default function TweetComposer({ onSuccess, parentId = null, placeholder = 'Что нового в космосе?', queryKey = ['feed'], defaultCommunityId = '' }) {
  const { user } = useAuthStore();
  const [content, setContent] = useState('');
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [attachment, setAttachment] = useState(null);
  const [composerMode, setComposerMode] = useState('text');
  const [linkUrl, setLinkUrl] = useState('');
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['Да', 'Нет']);
  const [communityId, setCommunityId] = useState(defaultCommunityId);
  const [ideaIndex, setIdeaIndex] = useState(0);
  const [draftShelfOpen, setDraftShelfOpen] = useState(false);
  const [savedDrafts, setSavedDrafts] = useState([]);
  const fileRef = useRef();
  const qc = useQueryClient();
  const plusActive = hasPlusAccess(user);
  const draftKey = parentId ? `reply:${parentId}` : defaultCommunityId ? `community:${defaultCommunityId}` : 'tweet:home';

  const { data: myCommunities = [] } = useQuery({
    queryKey: ['my-communities'],
    queryFn: () => api.get('/communities/mine').then((r) => r.data.communities),
    enabled: !!user && !parentId,
    staleTime: 30000,
  });

  useEffect(() => {
    setCommunityId(defaultCommunityId);
  }, [defaultCommunityId]);

  useEffect(() => {
    const legacyKey = parentId ? `zwitter-reply-draft-${parentId}` : 'zwitter-home-draft';
    const draft = loadDrafts(user?.id).find((item) => item.id === draftKey)?.content || localStorage.getItem(legacyKey);
    if (draft) setContent(normalizeHashtags(draft));
  }, [draftKey, parentId, user?.id]);

  useEffect(() => {
    if (!content.trim()) return;
    upsertDraft(user?.id, {
      id: draftKey,
      type: parentId ? 'reply' : communityId ? 'community' : 'tweet',
      title: parentId ? 'Ответ' : communityId ? 'Пост сообщества' : 'Звит',
      content,
      sourcePath: parentId ? `/tweet/${parentId}` : '/home',
    });
  }, [communityId, content, draftKey, parentId, user?.id]);

  useEffect(() => {
    const refreshDrafts = () => {
      const items = loadDrafts(user?.id)
        .filter((item) => ['tweet', 'community', 'reply'].includes(item.type))
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      setSavedDrafts(items);
    };
    refreshDrafts();
    window.addEventListener('zwitter:drafts-changed', refreshDrafts);
    return () => window.removeEventListener('zwitter:drafts-changed', refreshDrafts);
  }, [user?.id]);

  const MAX = plusActive ? 500 : 280;
  const remaining = MAX - content.length;
  const canPost = (content.trim().length > 0 || image || attachment || linkUrl.trim() || pollQuestion.trim()) && remaining >= 0;
  const progress = Math.min(100, Math.max(0, (content.length / MAX) * 100));

  const mutation = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      const parts = [content.trim()];
      if (linkUrl.trim()) parts.push(`[[link:${linkUrl.trim()}]]`);
      if (pollQuestion.trim() && pollOptions.filter((item) => item.trim()).length >= 2) {
        parts.push(`[[poll:${[pollQuestion.trim(), ...pollOptions.map((item) => item.trim()).filter(Boolean)].join('|')}]]`);
      }
      fd.append('content', parts.filter(Boolean).join('\n\n'));
      if (parentId) fd.append('parentId', parentId);
      if (!parentId && communityId) fd.append('communityId', communityId);
      if (image || attachment) fd.append('attachment', image || attachment);
      return api.post('/tweets', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: () => {
      setContent('');
      setImage(null);
      setPreview(null);
      setAttachment(null);
      setComposerMode('text');
      setLinkUrl('');
      setPollQuestion('');
      setPollOptions(['Да', 'Нет']);
      deleteDraft(user?.id, draftKey);
      localStorage.removeItem(parentId ? `zwitter-reply-draft-${parentId}` : 'zwitter-home-draft');
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ['feed'] });
      qc.invalidateQueries({ queryKey: ['tweet'] });
      qc.invalidateQueries({ queryKey: ['user-tweets'] });
      qc.invalidateQueries({ queryKey: ['explore'] });
      qc.invalidateQueries({ queryKey: ['search'] });
      qc.invalidateQueries({ queryKey: ['bookmarks'] });
      qc.invalidateQueries({ queryKey: ['my-communities'] });
      if (communityId) qc.invalidateQueries({ queryKey: ['community-tweets'] });
      if (parentId) qc.invalidateQueries({ queryKey: ['tweet', parentId] });
      if (onSuccess) onSuccess();
      toast.success(parentId ? 'Ответ опубликован!' : 'Звит опубликован!');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Ошибка публикации'),
  });

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) { toast.error('Файл больше 15MB'); return; }
    if (file.type.startsWith('image/')) {
      setImage(file);
      setAttachment(null);
      setPreview(URL.createObjectURL(file));
      setComposerMode('photo');
      return;
    }
    setAttachment(file);
    setImage(null);
    setPreview(null);
    setComposerMode('file');
  };

  const selectedCommunity = myCommunities.find((community) => community.id === communityId);
  const identity = selectedCommunity
    ? {
        displayName: selectedCommunity.name,
        avatarUrl: selectedCommunity.avatarUrl,
        isCommunity: true,
      }
    : user;

  const addText = (text) => {
    setContent((current) => {
      const separator = current.trim() ? ' ' : '';
      return normalizeHashtags(`${current}${separator}${text}`).slice(0, MAX);
    });
  };

  const useNextIdea = () => {
    setContent(promptIdeas[ideaIndex]);
    setIdeaIndex((current) => (current + 1) % promptIdeas.length);
  };

  const saveCurrentDraft = () => {
    const nextContent = normalizeHashtags(content);
    if (!nextContent.trim()) {
      toast.error('Сначала добавь текст для черновика');
      return;
    }
    upsertDraft(user?.id, {
      id: `draft:${Date.now()}`,
      type: parentId ? 'reply' : communityId ? 'community' : 'tweet',
      title: nextContent.slice(0, 42) || 'Черновик',
      content: nextContent,
      sourcePath: parentId ? `/tweet/${parentId}` : '/home',
    });
    toast.success('Черновик сохранён');
    setDraftShelfOpen(true);
  };

  return (
    <div className="tweet-composer-shell mx-3 my-4 rounded-3xl border border-x-border/80 bg-x-panel/60 px-4 py-4 shadow-panel backdrop-blur-xl sm:mx-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        {/* Avatar */}
        <div className={`h-10 w-10 flex-shrink-0 cosmic-avatar ${identity?.isCommunity ? 'rounded-2xl' : 'rounded-full'}`}>
          {identity?.avatarUrl
            ? <img src={identity.avatarUrl} alt={identity.displayName} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center font-bold">
                {identity?.displayName?.[0]?.toUpperCase()}
              </div>
          }
        </div>

        <div className="flex-1">
          {!parentId && myCommunities.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-normal text-x-muted">Публиковать как</span>
              <select
                value={communityId}
                onChange={(event) => setCommunityId(event.target.value)}
                className="rounded-full border border-x-border bg-x-surface/80 px-3 py-1.5 text-sm font-bold text-x-text outline-none transition focus:border-x-accent"
              >
                <option value="">{user?.displayName || 'Личный аккаунт'}</option>
                {myCommunities.map((community) => (
                  <option key={community.id} value={community.id}>
                    {community.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <textarea
            value={content}
            onChange={(e) => setContent(normalizeHashtags(e.target.value))}
            placeholder={placeholder}
            rows={3}
            maxLength={MAX + 20}
            className="tweet-composer-textarea w-full resize-none bg-transparent text-lg placeholder-x-muted focus:outline-none sm:text-xl"
          />

          {!parentId && (
            <div className="tweet-composer-toolbar mt-2 flex flex-wrap items-center gap-2">
              {[
                ['text', 'Текст'],
                ['photo', 'Фото'],
                ['link', 'Ссылка'],
                ['poll', 'Опрос'],
                ['file', 'Файл'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setComposerMode(value)}
                  className={`rounded-full border px-3 py-1 text-xs font-bold transition ${composerMode === value ? 'border-cyan-300/55 bg-cyan-300/10 text-x-accent' : 'border-x-border bg-x-surface/55 text-x-muted transition hover:border-cyan-300/40 hover:text-x-text'}`}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={useNextIdea}
                className="rounded-full border border-fuchsia-300/25 bg-fuchsia-300/10 px-3 py-1 text-xs font-bold text-fuchsia-100 transition hover:border-fuchsia-200/60"
              >
                Идея для звита
              </button>
              <button
                type="button"
                onClick={saveCurrentDraft}
                className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-xs font-bold text-amber-100 transition hover:border-amber-200/60"
              >
                В черновики
              </button>
              <button
                type="button"
                onClick={() => setDraftShelfOpen((current) => !current)}
                className={`rounded-full border px-3 py-1 text-xs font-bold transition ${draftShelfOpen ? 'border-cyan-300/55 bg-cyan-300/10 text-x-accent' : 'border-x-border bg-x-surface/55 text-x-muted hover:border-cyan-300/40 hover:text-x-text'}`}
              >
                Черновики {savedDrafts.length > 0 ? `(${savedDrafts.length})` : ''}
              </button>
              {moodOptions.map((mood) => (
                <button
                  key={mood.tag}
                  type="button"
                  onClick={() => addText(mood.tag)}
                  className="rounded-full border border-x-border bg-x-surface/55 px-3 py-1 text-xs font-bold text-x-muted transition hover:border-cyan-300/40 hover:text-x-text"
                >
                  {mood.label}
                </button>
              ))}
            </div>
          )}

          {draftShelfOpen && (
            <div className="mt-3 rounded-2xl border border-x-border bg-x-surface/35 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-x-text">Черновики рядом с созданием</p>
                  <p className="text-xs text-x-muted">Можно быстро вернуть набросок и продолжить писать.</p>
                </div>
                <button type="button" onClick={() => setDraftShelfOpen(false)} className="rounded-full border border-x-border px-3 py-1 text-xs font-bold text-x-muted">
                  Скрыть
                </button>
              </div>
              <div className="mt-3 grid gap-2">
                {savedDrafts.filter((draft) => draft.id !== draftKey).slice(0, 6).map((draft) => (
                  <div key={draft.id} className="rounded-2xl border border-x-border/70 bg-x-bg/45 px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-x-text">{draft.title}</p>
                        <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-xs text-x-muted">{draft.content}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setContent(normalizeHashtags(draft.content));
                            setDraftShelfOpen(false);
                          }}
                          className="rounded-full border border-cyan-300/35 px-3 py-1 text-xs font-black text-x-accent"
                        >
                          Вставить
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteDraft(user?.id, draft.id)}
                          className="rounded-full border border-red-400/30 px-3 py-1 text-xs font-black text-red-300"
                        >
                          Удалить
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {savedDrafts.filter((draft) => draft.id !== draftKey).length === 0 && (
                  <p className="text-sm text-x-muted">Пока есть только текущий автосохранённый черновик.</p>
                )}
              </div>
            </div>
          )}

          {composerMode === 'link' && (
            <input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://example.com"
              className="mt-3 w-full rounded-2xl border border-x-border bg-x-surface/55 px-4 py-3 text-sm text-x-text outline-none transition focus:border-x-accent"
            />
          )}

          {composerMode === 'poll' && (
            <div className="mt-3 rounded-2xl border border-x-border bg-x-surface/40 p-3">
              <input
                value={pollQuestion}
                onChange={(e) => setPollQuestion(e.target.value)}
                placeholder="Вопрос опроса"
                className="w-full rounded-xl border border-x-border bg-x-bg/60 px-3 py-2 text-sm text-x-text outline-none"
              />
              <div className="mt-2 grid gap-2">
                {pollOptions.map((option, index) => (
                  <input
                    key={`${index + 1}`}
                    value={option}
                    onChange={(e) => setPollOptions((current) => current.map((item, itemIndex) => (itemIndex === index ? e.target.value : item)))}
                    placeholder={`Вариант ${index + 1}`}
                    className="rounded-xl border border-x-border bg-x-bg/60 px-3 py-2 text-sm text-x-text outline-none"
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => setPollOptions((current) => (current.length >= 4 ? current : [...current, '']))}
                className="mt-2 rounded-full border border-x-border px-3 py-1 text-xs font-bold text-x-muted transition hover:border-cyan-300/40 hover:text-x-text"
              >
                Добавить вариант
              </button>
            </div>
          )}

          {preview && (
            <div className="relative mt-2 rounded-2xl overflow-hidden border border-x-border shadow-neon">
              <img src={preview} alt="preview" className="w-full object-cover max-h-64" />
              <button
                onClick={() => { setImage(null); setPreview(null); fileRef.current.value = ''; }}
                className="absolute top-2 right-2 bg-x-bg/80 border border-x-border rounded-full p-1 hover:bg-x-elevated"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M10.59 12L4.54 5.96l1.42-1.42L12 10.59l6.04-6.05 1.42 1.42L13.41 12l6.05 6.04-1.42 1.42L12 13.41l-6.04 6.05-1.42-1.42L10.59 12z"/></svg>
              </button>
            </div>
          )}

          {attachment && !image && (
            <div className="mt-2 flex items-center justify-between rounded-2xl border border-x-border bg-x-surface/45 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-bold text-x-text">{attachment.name}</p>
                <p className="text-xs text-x-muted">{Math.round(attachment.size / 1024)} KB</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAttachment(null);
                  fileRef.current.value = '';
                }}
                className="rounded-full border border-x-border px-3 py-1 text-xs font-bold text-x-muted"
              >
                Убрать
              </button>
            </div>
          )}

          <div className="flex items-center justify-between mt-3 border-t border-x-border/80 pt-3 ">
            <div className="flex gap-1">
              <input ref={fileRef} type="file" accept="image/*,.pdf,.doc,.docx,.txt,.zip,.rar" onChange={handleFile} className="hidden" />
              <button
                onClick={() => fileRef.current?.click()}
                className="p-2 rounded-full text-x-accent hover:bg-x-accent/10 hover:shadow-neon transition"
                title="Добавить вложение"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                  <path d="M3 5.5C3 4.119 4.119 3 5.5 3h13C19.881 3 21 4.119 21 5.5v13c0 1.381-1.119 2.5-2.5 2.5h-13C4.119 21 3 19.881 3 18.5v-13zM5.5 5c-.276 0-.5.224-.5.5v9.086l3-3 3 3 5-5 3 3V5.5c0-.276-.224-.5-.5-.5h-13zM19 15.414l-3-3-5 5-3-3-3 3V18.5c0 .276.224.5.5.5h13c.276 0 .5-.224.5-.5v-3.086zM9.75 7C8.784 7 8 7.784 8 8.75s.784 1.75 1.75 1.75 1.75-.784 1.75-1.75S10.716 7 9.75 7z"/>
                </svg>
              </button>
            </div>

            <div className="flex items-center gap-3">
              {!plusActive && content.length > 240 && (
                <span className="hidden rounded-full border border-fuchsia-300/30 bg-fuchsia-300/10 px-2 py-1 text-xs font-bold text-fuchsia-100 sm:inline">
                  Plus: до 500
                </span>
              )}
              {content.length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-x-border">
                    <div
                      className={`h-full rounded-full ${remaining < 0 ? 'bg-x-danger' : remaining < 20 ? 'bg-yellow-400' : 'bg-x-accent'}`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className={`text-sm font-medium ${remaining < 20 ? remaining < 0 ? 'text-x-danger' : 'text-yellow-500' : 'text-x-muted'}`}>
                    {remaining}
                  </span>
                </div>
              )}
              <button
                onClick={() => mutation.mutate()}
                disabled={!canPost || mutation.isPending}
                className="btn-primary px-5 py-1.5 text-[15px]"
              >
                {mutation.isPending ? 'Публикую...' : parentId ? 'Ответить' : 'Опубликовать'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
