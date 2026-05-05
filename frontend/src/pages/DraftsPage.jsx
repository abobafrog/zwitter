import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import { deleteDraft, extractHashtags, loadDrafts, normalizeHashtags, saveDrafts, upsertDraft } from '../utils/drafts';
import NavIcon from '../components/layout/NavIcon';

const draftTypes = {
  all: 'Все',
  tweet: 'Звиты',
  reply: 'Ответы',
  community: 'Сообщества',
  chat: 'Чаты',
};

const formatDate = (value) => new Date(value).toLocaleString('ru-RU', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export default function DraftsPage() {
  const { user } = useAuthStore();
  const [drafts, setDrafts] = useState(() => loadDrafts(user?.id));
  const [activeType, setActiveType] = useState('all');
  const [draftText, setDraftText] = useState('');
  const [editingId, setEditingId] = useState(null);

  const reload = () => setDrafts(loadDrafts(user?.id));

  useEffect(() => {
    reload();
    window.addEventListener('zwitter:drafts-changed', reload);
    return () => window.removeEventListener('zwitter:drafts-changed', reload);
  }, [user?.id]);

  const filteredDrafts = useMemo(
    () => drafts.filter((draft) => activeType === 'all' || draft.type === activeType),
    [activeType, drafts]
  );

  const stats = {
    total: drafts.length,
    tags: new Set(drafts.flatMap((draft) => draft.tags || extractHashtags(draft.content))).size,
    updated: drafts[0]?.updatedAt ? formatDate(drafts[0].updatedAt) : 'нет',
  };

  const saveCurrent = () => {
    const content = normalizeHashtags(draftText);
    if (!content.trim()) return;
    upsertDraft(user?.id, {
      id: editingId || `manual:${Date.now()}`,
      type: 'tweet',
      title: editingId ? 'Черновик' : 'Новый черновик',
      content,
      sourcePath: '/home',
    });
    setDraftText('');
    setEditingId(null);
    reload();
    toast.success('Черновик сохранён');
  };

  const startEdit = (draft) => {
    setEditingId(draft.id);
    setDraftText(draft.content);
  };

  const removeDraft = (draftId) => {
    deleteDraft(user?.id, draftId);
    reload();
  };

  const clearAll = () => {
    saveDrafts(user?.id, []);
    reload();
  };

  return (
    <div className="min-h-full">
      <div className="cosmic-header px-4 py-3 sm:px-5">
        <p className="nebula-section-heading">Draft Vault</p>
        <h1 className="flex items-center gap-2 text-xl font-black tracking-normal">
          <NavIcon name="bookmark" className="h-5 w-5 text-x-accent" />
          Черновики
        </h1>
      </div>

      <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <main className="min-w-0">
          <section className="rounded-3xl border border-cyan-300/25 bg-x-panel/55 p-4 shadow-panel">
            <textarea
              value={draftText}
              onChange={(event) => setDraftText(normalizeHashtags(event.target.value))}
              className="input-field min-h-36 resize-none"
              placeholder="Набросай мысль, ответ, идею поста или набор тезисов..."
              maxLength={500}
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-bold text-x-muted">{draftText.length}/500 · повторы хэштегов убираются автоматически</span>
              <div className="flex gap-2">
                {editingId && (
                  <button type="button" onClick={() => { setEditingId(null); setDraftText(''); }} className="btn-outline px-4 py-2 text-sm">
                    Отмена
                  </button>
                )}
                <button type="button" onClick={saveCurrent} disabled={!draftText.trim()} className="btn-accent px-5 py-2 text-sm disabled:opacity-50">
                  {editingId ? 'Обновить' : 'Сохранить'}
                </button>
              </div>
            </div>
          </section>

          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(draftTypes).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveType(id)}
                className={`nebula-pill ${activeType === id ? 'border-x-accent/70 text-x-text' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>

          <section className="mt-4 grid gap-3">
            {filteredDrafts.map((draft) => (
              <article key={draft.id} className="rounded-3xl border border-x-border/75 bg-x-panel/55 p-4 shadow-panel">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="nebula-section-heading">{draftTypes[draft.type] || 'Черновик'}</p>
                    <h2 className="text-lg font-black text-x-text">{draft.title}</h2>
                    <p className="text-xs font-bold text-x-muted">Обновлён {formatDate(draft.updatedAt)}</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => startEdit(draft)} className="btn-outline px-4 py-2 text-sm">
                      Изменить
                    </button>
                    <button type="button" onClick={() => removeDraft(draft.id)} className="rounded-full border border-red-400/35 px-4 py-2 text-sm font-black text-red-300">
                      Удалить
                    </button>
                  </div>
                </div>
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-x-text">{draft.content}</p>
                {(draft.tags || []).length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {draft.tags.map((tag) => (
                      <Link key={tag} to={`/search?q=${encodeURIComponent(tag)}`} className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 text-xs font-bold text-x-accent">
                        {tag}
                      </Link>
                    ))}
                  </div>
                )}
              </article>
            ))}
            {filteredDrafts.length === 0 && (
              <div className="rounded-3xl border border-dashed border-x-border p-8 text-center text-x-muted">
                <p className="text-lg font-black text-x-text">Черновиков пока нет</p>
                <p className="mt-1 text-sm">Начни писать в композере или сохрани набросок здесь.</p>
              </div>
            )}
          </section>
        </main>

        <aside className="space-y-4">
          <section className="rounded-3xl border border-x-border/75 bg-x-panel/55 p-4 shadow-panel">
            <p className="nebula-section-heading">Сводка</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl border border-x-border bg-x-bg/45 p-3">
                <p className="text-lg font-black">{stats.total}</p>
                <p className="text-xs text-x-muted">всего</p>
              </div>
              <div className="rounded-2xl border border-x-border bg-x-bg/45 p-3">
                <p className="text-lg font-black">{stats.tags}</p>
                <p className="text-xs text-x-muted">тегов</p>
              </div>
              <div className="rounded-2xl border border-x-border bg-x-bg/45 p-3">
                <p className="text-xs font-black">{stats.updated}</p>
                <p className="text-xs text-x-muted">апдейт</p>
              </div>
            </div>
            {drafts.length > 0 && (
              <button type="button" onClick={clearAll} className="mt-3 w-full rounded-2xl border border-red-400/30 px-4 py-2 text-sm font-black text-red-300">
                Очистить всё
              </button>
            )}
          </section>
          <section className="rounded-3xl border border-fuchsia-300/25 bg-fuchsia-300/10 p-4">
            <p className="text-sm font-bold text-fuchsia-100">
              Plus-режим даёт до 500 символов в звите; черновики уже готовы к этому лимиту.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
