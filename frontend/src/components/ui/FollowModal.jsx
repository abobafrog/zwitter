// src/components/ui/FollowModal.jsx
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';

export default function FollowModal({ username, type, onClose }) {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['follow-list', username, type],
    queryFn: () => api.get(`/users/${username}/${type}`).then((r) => r.data.users),
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-black border border-x-border rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col">

        {/* Шапка */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-x-border flex-shrink-0">
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 transition-colors">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
              <path d="M18.3 5.71a1 1 0 00-1.41 0L12 10.59 7.11 5.7A1 1 0 005.7 7.11L10.59 12 5.7 16.89a1 1 0 001.41 1.41L12 13.41l4.89 4.89a1 1 0 001.41-1.41L13.41 12l4.89-4.89a1 1 0 000-1.4z"/>
            </svg>
          </button>
          <h2 className="font-bold text-lg">
            {type === 'followers' ? 'Подписчики' : 'Подписки'}
          </h2>
          <div className="w-8" />
        </div>

        {/* Список */}
        <div className="overflow-y-auto flex-1">
          {isLoading && (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-x-accent border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {data?.length === 0 && (
            <div className="py-12 text-center text-x-muted text-sm">
              {type === 'followers' ? 'Нет подписчиков' : 'Нет подписок'}
            </div>
          )}

          {data?.map((user) => (
            <button
              key={user.id}
              onClick={() => { onClose(); navigate(`/${user.username}`); }}
              className="flex items-center gap-3 w-full px-4 py-3 hover:bg-white/5 transition-colors border-b border-x-border"
            >
              <div className="w-12 h-12 rounded-full bg-x-surface border border-x-border overflow-hidden flex-shrink-0">
                {user.avatarUrl
                  ? <img src={user.avatarUrl} alt={user.displayName} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center font-bold">
                      {user.displayName?.[0]?.toUpperCase()}
                    </div>
                }
              </div>
              <div className="text-left min-w-0">
                <p className="font-bold truncate">{user.displayName}</p>
                <p className="text-x-muted text-sm truncate">@{user.username}</p>
                {user.bio && <p className="text-xs text-x-muted mt-0.5 truncate">{user.bio}</p>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}