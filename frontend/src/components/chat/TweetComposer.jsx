// src/components/chat/TweetComposer.jsx
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';

export default function TweetComposer({ onSuccess, parentId = null, placeholder = 'Что нового в космосе?', queryKey = ['feed'], defaultCommunityId = '' }) {
  const { user } = useAuthStore();
  const [content, setContent] = useState('');
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [communityId, setCommunityId] = useState(defaultCommunityId);
  const fileRef = useRef();
  const qc = useQueryClient();

  const { data: myCommunities = [] } = useQuery({
    queryKey: ['my-communities'],
    queryFn: () => api.get('/communities/mine').then((r) => r.data.communities),
    enabled: !!user && !parentId,
    staleTime: 30000,
  });

  useEffect(() => {
    setCommunityId(defaultCommunityId);
  }, [defaultCommunityId]);

  const MAX = 280;
  const remaining = MAX - content.length;
  const canPost = content.trim().length > 0 && remaining >= 0;

  const mutation = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('content', content.trim());
      if (parentId) fd.append('parentId', parentId);
      if (!parentId && communityId) fd.append('communityId', communityId);
      if (image) fd.append('image', image);
      return api.post('/tweets', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: () => {
      setContent('');
      setImage(null);
      setPreview(null);
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
    if (file.size > 10 * 1024 * 1024) { toast.error('Файл больше 10MB'); return; }
    setImage(file);
    setPreview(URL.createObjectURL(file));
  };

  const selectedCommunity = myCommunities.find((community) => community.id === communityId);
  const identity = selectedCommunity
    ? {
        displayName: selectedCommunity.name,
        avatarUrl: selectedCommunity.avatarUrl,
        isCommunity: true,
      }
    : user;

  return (
    <div className="mx-3 my-4 rounded-3xl border border-x-border/80 bg-x-panel/60 px-4 py-4 shadow-panel backdrop-blur-xl sm:mx-4">
      <div className="flex gap-3">
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
            onChange={(e) => setContent(e.target.value)}
            placeholder={placeholder}
            rows={3}
            maxLength={300}
            className="w-full bg-transparent text-xl placeholder-x-muted resize-none focus:outline-none"
          />

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

          <div className="flex items-center justify-between mt-3 border-t border-x-border/80 pt-3 ">
            <div className="flex gap-1">
              <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
              <button
                onClick={() => fileRef.current?.click()}
                className="p-2 rounded-full text-x-accent hover:bg-x-accent/10 hover:shadow-neon transition"
                title="Добавить фото"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                  <path d="M3 5.5C3 4.119 4.119 3 5.5 3h13C19.881 3 21 4.119 21 5.5v13c0 1.381-1.119 2.5-2.5 2.5h-13C4.119 21 3 19.881 3 18.5v-13zM5.5 5c-.276 0-.5.224-.5.5v9.086l3-3 3 3 5-5 3 3V5.5c0-.276-.224-.5-.5-.5h-13zM19 15.414l-3-3-5 5-3-3-3 3V18.5c0 .276.224.5.5.5h13c.276 0 .5-.224.5-.5v-3.086zM9.75 7C8.784 7 8 7.784 8 8.75s.784 1.75 1.75 1.75 1.75-.784 1.75-1.75S10.716 7 9.75 7z"/>
                </svg>
              </button>
            </div>

            <div className="flex items-center gap-3">
              {content.length > 0 && (
                <div className={`text-sm font-medium ${remaining < 20 ? remaining < 0 ? 'text-x-danger' : 'text-yellow-500' : 'text-x-muted'}`}>
                  {remaining}
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
