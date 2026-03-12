// src/components/layout/RightPanel.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';

export default function RightPanel() {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ['search-users', query],
    queryFn: () => api.get(`/users/search?q=${query}`).then((r) => r.data.users),
    enabled: query.trim().length > 0,
    staleTime: 5000,
  });

  return (
    <div className="hidden">
      {/* Search */}
      <div className="sticky top-0 pt-2 pb-1 bg-black z-10">
        <div className="relative">
          <svg viewBox="0 0 24 24" className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 fill-current text-x-muted">
            <path d="M10.25 3.75c-3.59 0-6.5 2.91-6.5 6.5s2.91 6.5 6.5 6.5c1.795 0 3.419-.726 4.596-1.904 1.178-1.177 1.904-2.801 1.904-4.596 0-3.59-2.91-6.5-6.5-6.5zm-8.5 6.5c0-4.694 3.806-8.5 8.5-8.5s8.5 3.806 8.5 8.5c0 1.986-.682 3.815-1.814 5.272l4.521 4.521-1.414 1.414-4.521-4.521A8.456 8.456 0 0110.25 18.75c-4.694 0-8.5-3.806-8.5-8.5z"/>
          </svg>
          <input
            type="text"
            placeholder="Поиск"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-x-surface rounded-full py-3 pl-10 pr-4 text-sm placeholder-x-muted focus:outline-none focus:ring-1 focus:ring-x-accent focus:bg-black"
          />
        </div>
      </div>

      {/* Search results */}
      {query && data && data.length > 0 && (
        <div className="bg-x-surface rounded-2xl overflow-hidden">
          <h2 className="font-bold text-xl px-4 py-3">Результаты</h2>
          {data.map((user) => (
            <div
              key={user.id}
              onClick={() => { navigate(`/${user.username}`); setQuery(''); }}
              className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 cursor-pointer transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-x-border overflow-hidden flex-shrink-0">
                {user.avatarUrl
                  ? <img src={user.avatarUrl} alt={user.displayName} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center font-bold">
                      {user.displayName?.[0]?.toUpperCase()}
                    </div>
                }
              </div>
              <div>
                <p className="font-bold text-sm">{user.displayName}</p>
                <p className="text-x-muted text-sm">@{user.username}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}

    </div>
  );
}
