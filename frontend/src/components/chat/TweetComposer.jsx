// src/components/chat/TweetComposer.jsx
import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';

export default function TweetComposer({ onSuccess }) {
  const { user } = useAuthStore();
  const [content, setContent] = useState('');
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const fileRef = useRef();
  const qc = useQueryClient();

  const MAX = 280;
  const remaining = MAX - content.length;
  const canPost = content.trim().length > 0 && remaining >= 0;

  const mutation = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('content', content.trim());
      if (image) fd.append('image', image);
      return api.post('/tweets', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: () => {
      setContent('');
      setImage(null);
      setPreview(null);
      qc.invalidateQueries({ queryKey: ['feed'] });
      if (onSuccess) onSuccess();
      toast.success('Твит опубликован!');
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

  return (
    <div className="border-b border-x-border px-4 py-3">
      <div className="flex gap-3">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full bg-x-surface flex-shrink-0 overflow-hidden border border-x-border">
          {user?.avatarUrl
            ? <img src={user.avatarUrl} alt={user.displayName} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center font-bold">
                {user?.displayName?.[0]?.toUpperCase()}
              </div>
          }
        </div>

        <div className="flex-1">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Что происходит?"
            rows={3}
            maxLength={300}
            className="w-full bg-transparent text-xl placeholder-x-muted resize-none focus:outline-none"
          />

          {preview && (
            <div className="relative mt-2 rounded-2xl overflow-hidden border border-x-border">
              <img src={preview} alt="preview" className="w-full object-cover max-h-64" />
              <button
                onClick={() => { setImage(null); setPreview(null); fileRef.current.value = ''; }}
                className="absolute top-2 right-2 bg-black/70 rounded-full p-1 hover:bg-black"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M10.59 12L4.54 5.96l1.42-1.42L12 10.59l6.04-6.05 1.42 1.42L13.41 12l6.05 6.04-1.42 1.42L12 13.41l-6.04 6.05-1.42-1.42L10.59 12z"/></svg>
              </button>
            </div>
          )}

          <div className="flex items-center justify-between mt-3 border-t border-x-border pt-3 ">
            <div className="flex gap-1">
              <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
              <button
                onClick={() => fileRef.current?.click()}
                className="p-2 rounded-full text-x-accent hover:bg-x-accent/10 transition-colors"
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
                {mutation.isPending ? 'Публикую...' : 'Опубликовать'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
