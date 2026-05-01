import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../services/api';
import NavIcon from '../components/layout/NavIcon';
import TweetCard from '../components/chat/TweetCard';
import TweetComposer from '../components/chat/TweetComposer';

function CommunitySettingsModal({ community, members, onClose, onSave, onAddMembers, onRemoveMember, onDelete, isSaving }) {
  const [name, setName] = useState(community.name || '');
  const [bio, setBio] = useState(community.bio || '');
  const [avatar, setAvatar] = useState(null);
  const [banner, setBanner] = useState(null);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState([]);
  const memberIds = new Set((members || []).map((member) => member.id));
  const { data, isLoading } = useQuery({
    queryKey: ['community-add-users', community.slug, q],
    queryFn: () => api.get(`/users/search?q=${q}`).then((r) => r.data.users),
    enabled: q.trim().length > 0,
  });
  const avatarPreview = avatar ? URL.createObjectURL(avatar) : community.avatarUrl;
  const bannerPreview = banner ? URL.createObjectURL(banner) : community.bannerUrl;

  const toggleSelected = (userItem) => {
    if (memberIds.has(userItem.id)) return;
    setSelected((current) =>
      current.some((item) => item.id === userItem.id)
        ? current.filter((item) => item.id !== userItem.id)
        : [...current, userItem]
    );
  };

  const handleSave = () => {
    const fd = new FormData();
    fd.append('name', name.trim());
    fd.append('bio', bio.trim());
    if (avatar) fd.append('avatar', avatar);
    if (banner) fd.append('banner', banner);
    onSave(fd);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-x-bg/75 p-4 backdrop-blur-md">
      <div className="cosmic-panel max-h-[90vh] w-full max-w-xl overflow-hidden rounded-3xl">
        <div className="flex items-center justify-between border-b border-x-border px-4 py-3">
          <div>
            <p className="nebula-section-heading">сообщество</p>
            <h2 className="text-lg font-black">Настройки сообщества</h2>
          </div>
          <button type="button" onClick={onClose} className="panel-icon-button" aria-label="Закрыть">
            <NavIcon name="close" className="h-5 w-5" />
          </button>
        </div>

        <div className="settings-emoji-scroll max-h-[calc(90vh-68px)] overflow-y-auto p-4">
          <label className="relative block h-32 cursor-pointer overflow-hidden rounded-3xl border border-x-border bg-x-bg/55">
            {bannerPreview ? <img src={bannerPreview} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full cosmic-banner" />}
            <input type="file" accept="image/*" className="hidden" onChange={(event) => setBanner(event.target.files?.[0] || null)} />
          </label>
          <div className="-mt-8 flex items-end gap-4 px-3">
            <label className="relative flex h-20 w-20 cursor-pointer items-center justify-center overflow-hidden rounded-3xl border-4 border-x-bg bg-x-bg text-2xl font-black text-x-accent shadow-neon">
              {avatarPreview ? <img src={avatarPreview} alt="" className="h-full w-full object-cover" /> : name?.[0]?.toUpperCase()}
              <input type="file" accept="image/*" className="hidden" onChange={(event) => setAvatar(event.target.files?.[0] || null)} />
            </label>
            <div className="pb-1 text-xs font-bold text-x-muted">Нажмите на обложку или аватар, чтобы заменить</div>
          </div>

          <input value={name} onChange={(event) => setName(event.target.value)} className="input-field mt-4" placeholder="Название" maxLength={100} />
          <textarea value={bio} onChange={(event) => setBio(event.target.value)} className="input-field mt-3 min-h-24 resize-none" placeholder="Описание" maxLength={180} />
          <button type="button" onClick={handleSave} disabled={isSaving || name.trim().length < 2} className="btn-accent mt-4 w-full py-2 text-sm disabled:opacity-50">
            Сохранить сообщество
          </button>

          <div className="mt-5">
            <p className="nebula-section-heading">участники</p>
            <div className="mt-3 grid gap-2">
              {(members || []).map((member) => (
                <div key={member.id} className="flex items-center gap-3 rounded-2xl border border-x-border bg-x-bg/45 px-3 py-2">
                  <div className="h-10 w-10 overflow-hidden rounded-full cosmic-avatar">
                    {member.avatarUrl ? <img src={member.avatarUrl} alt={member.displayName} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center font-black">{member.displayName?.[0]?.toUpperCase()}</div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black">{member.displayName}</p>
                    <p className="truncate text-xs text-x-muted">@{member.username}</p>
                  </div>
                  {member.role === 'owner' ? (
                    <span className="rounded-full border border-cyan-300/35 px-2 py-0.5 text-xs font-black text-x-accent">Владелец</span>
                  ) : (
                    <button type="button" onClick={() => onRemoveMember(member.id)} className="rounded-full border border-red-400/30 px-3 py-1 text-xs font-black text-red-300 hover:bg-red-500/10">
                      Удалить
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <p className="nebula-section-heading">добавить</p>
            <input value={q} onChange={(event) => setQ(event.target.value)} className="input-field mt-3" placeholder="Найти пользователей..." />
            {selected.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {selected.map((item) => (
                  <button key={item.id} type="button" onClick={() => toggleSelected(item)} className="rounded-full border border-x-border px-3 py-1 text-xs font-black">
                    {item.displayName} ×
                  </button>
                ))}
              </div>
            )}
            <div className="mt-3 max-h-52 overflow-y-auto">
              {isLoading && <p className="px-2 py-3 text-sm text-x-muted">Поиск...</p>}
              {data?.map((item) => {
                const alreadyMember = memberIds.has(item.id);
                const selectedUser = selected.some((selectedItem) => selectedItem.id === item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={alreadyMember}
                    onClick={() => toggleSelected(item)}
                    className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left ${alreadyMember ? 'cursor-not-allowed opacity-55' : 'cosmic-hover'}`}
                  >
                    <div className="h-9 w-9 overflow-hidden rounded-full cosmic-avatar">
                      {item.avatarUrl ? <img src={item.avatarUrl} alt={item.displayName} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center font-black">{item.displayName?.[0]?.toUpperCase()}</div>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black">{item.displayName}</p>
                      <p className="truncate text-xs text-x-muted">@{item.username}</p>
                    </div>
                    <span className="text-xs font-black text-x-muted">{alreadyMember ? 'Уже участник' : selectedUser ? 'Выбран' : ''}</span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              disabled={selected.length === 0 || isSaving}
              onClick={() => onAddMembers(selected.map((item) => item.id)).then(() => setSelected([]))}
              className="btn-outline mt-3 w-full py-2 text-sm disabled:opacity-50"
            >
              Добавить участников
            </button>
          </div>

          <button type="button" onClick={onDelete} className="mt-5 w-full rounded-2xl border border-red-400/35 bg-red-500/10 px-4 py-3 text-sm font-black text-red-300 hover:bg-red-500/15">
            Удалить сообщество
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CommunityPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showSettings, setShowSettings] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['community', slug],
    queryFn: () => api.get(`/communities/${slug}`).then((r) => r.data.community),
  });
  const { data: tweetsData } = useQuery({
    queryKey: ['community-tweets', slug],
    queryFn: () => api.get(`/communities/${slug}/tweets`).then((r) => r.data),
    enabled: !!data,
  });
  const { data: membersData } = useQuery({
    queryKey: ['community-members', slug],
    queryFn: () => api.get(`/communities/${slug}/members`).then((r) => r.data),
    enabled: !!data && data.memberRole === 'owner',
  });

  const joinMutation = useMutation({
    mutationFn: () => api.post(`/communities/${slug}/join`),
    onSuccess: ({ data: res }) => {
      qc.invalidateQueries({ queryKey: ['community', slug] });
      qc.invalidateQueries({ queryKey: ['communities'] });
      qc.invalidateQueries({ queryKey: ['explore'] });
      toast.success(res.member ? 'Вы вступили в сообщество' : 'Вы вышли из сообщества');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Не удалось обновить участие'),
  });

  const updateCommunityMutation = useMutation({
    mutationFn: (formData) => api.patch(`/communities/${slug}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
    onSuccess: ({ data: res }) => {
      qc.setQueryData(['community', slug], res.community);
      qc.invalidateQueries({ queryKey: ['communities'] });
      qc.invalidateQueries({ queryKey: ['explore'] });
      toast.success('Сообщество обновлено');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Не удалось обновить сообщество'),
  });

  const addMembersMutation = useMutation({
    mutationFn: (userIds) => api.post(`/communities/${slug}/members`, { userIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['community', slug] });
      qc.invalidateQueries({ queryKey: ['community-members', slug] });
      toast.success('Участники добавлены');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Не удалось добавить участников'),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (targetUserId) => api.delete(`/communities/${slug}/members/${targetUserId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['community', slug] });
      qc.invalidateQueries({ queryKey: ['community-members', slug] });
      toast.success('Участник удалён');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Не удалось удалить участника'),
  });

  const deleteCommunityMutation = useMutation({
    mutationFn: () => api.delete(`/communities/${slug}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['communities'] });
      qc.invalidateQueries({ queryKey: ['explore'] });
      navigate('/communities');
      toast.success('Сообщество удалено');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Не удалось удалить сообщество'),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-x-accent border-t-transparent" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="px-8 py-16 text-center text-x-muted">
        <p className="text-lg font-black text-x-text">Сообщество не найдено</p>
      </div>
    );
  }

  const isOwner = data.memberRole === 'owner';

  return (
    <div className="min-h-full">
      <div className="cosmic-header flex items-center gap-4 px-4 py-3">
        <button type="button" onClick={() => navigate(-1)} className="panel-icon-button">
          <NavIcon name="expandLeft" className="h-5 w-5" />
        </button>
        <div>
          <p className="nebula-section-heading">Сообщество</p>
          <h1 className="text-xl font-black">{data.name}</h1>
        </div>
      </div>

      <div className="relative z-0 h-40 overflow-hidden cosmic-banner sm:h-48">
        {data.bannerUrl && <img src={data.bannerUrl} alt={data.name} className="h-full w-full object-cover" />}
      </div>

      <section className="relative z-10 border-b border-x-border/80 bg-x-panel/95 px-4 pb-5 shadow-[0_-18px_34px_rgba(3,7,18,0.62)]">
        <div className="-mt-12 mb-4 flex items-start justify-between gap-3">
          <div className="relative z-20 h-24 w-24 rounded-3xl border-4 border-x-bg bg-x-bg cosmic-avatar shadow-neon">
            {data.avatarUrl ? (
              <img src={data.avatarUrl} alt={data.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-3xl font-black">
                {data.name?.[0]?.toUpperCase()}
              </div>
            )}
          </div>
          <div className="mt-11 flex gap-2">
            {isOwner && (
              <button type="button" onClick={() => setShowSettings(true)} className="btn-outline px-4 py-2 text-sm">
                Управление
              </button>
            )}
            <button
              type="button"
              disabled={joinMutation.isPending || isOwner}
              onClick={() => joinMutation.mutate()}
              className={`px-4 py-2 text-sm ${data.isMember ? 'btn-outline' : 'btn-accent'} ${isOwner ? 'opacity-70' : ''}`}
            >
              {isOwner ? 'Вы владелец' : data.isMember ? 'Выйти' : 'Вступить'}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-black">{data.name}</h2>
          <span className="rounded-full border border-cyan-300/35 bg-cyan-300/10 px-2 py-0.5 text-xs font-black uppercase tracking-normal text-x-accent">
            Канал
          </span>
        </div>
        <p className="text-x-muted">@{data.slug}</p>
        {data.bio && <p className="mt-3 text-[15px]">{data.bio}</p>}
        <div className="mt-4 flex flex-wrap gap-4 text-sm text-x-muted">
          <span><strong className="text-x-text">{data._count?.members || 0}</strong> участников</span>
          <span>Создатель: <strong className="text-x-text">@{data.owner?.username}</strong></span>
        </div>
      </section>

      {isOwner && (
        <TweetComposer
          defaultCommunityId={data.id}
          placeholder={`Новая запись в ${data.name}`}
          queryKey={['community-tweets', slug]}
        />
      )}

      <div className="py-4">
        {(tweetsData?.tweets || []).length > 0 ? (
          tweetsData.tweets.map((tweet) => (
            <TweetCard key={tweet.id} tweet={tweet} queryKey={['community-tweets', slug]} />
          ))
        ) : (
          <div className="px-8 py-16 text-center text-x-muted">
            <p className="text-lg font-black text-x-text">Записей пока нет</p>
            <p className="mt-1 text-sm">Владелец может опубликовать первый звит от лица сообщества.</p>
          </div>
        )}
      </div>

      {showSettings && isOwner && (
        <CommunitySettingsModal
          community={data}
          members={membersData?.members || []}
          onClose={() => setShowSettings(false)}
          onSave={(formData) => updateCommunityMutation.mutate(formData)}
          onAddMembers={(userIds) => addMembersMutation.mutateAsync(userIds)}
          onRemoveMember={(targetUserId) => removeMemberMutation.mutate(targetUserId)}
          onDelete={() => {
            if (window.confirm('Удалить сообщество вместе со всеми записями?')) {
              deleteCommunityMutation.mutate();
            }
          }}
          isSaving={
            updateCommunityMutation.isPending ||
            addMembersMutation.isPending ||
            removeMemberMutation.isPending ||
            deleteCommunityMutation.isPending
          }
        />
      )}
    </div>
  );
}
