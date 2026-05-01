// src/components/ui/EditProfileModal.jsx
import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';

export default function EditProfileModal({ user, onClose }) {
  const { updateUser } = useAuthStore();
  const qc = useQueryClient();

  const [form, setForm] = useState({
    displayName: user.displayName || '',
    bio: user.bio || '',
    username: user.username || '',
    birthDate: user.birthDate || '',
  });

  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(user.avatarUrl || null);
  const [bannerFile, setBannerFile] = useState(null);
  const [bannerPreview, setBannerPreview] = useState(user.bannerUrl || null);
  const [birthError, setBirthError] = useState('');

  const avatarRef = useRef();
  const bannerRef = useRef();

  const handleFile = (type, file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error('Файл больше 10MB'); return; }
    const url = URL.createObjectURL(file);
    if (type === 'avatar') { setAvatarFile(file); setAvatarPreview(url); }
    else { setBannerFile(file); setBannerPreview(url); }
  };

  const validateDate = (val) => {
    if (!val) return true;
    const match = val.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!match) return false;
    const [, dd, mm, yyyy] = match;
    const date = new Date(`${yyyy}-${mm}-${dd}`);
    return !isNaN(date) &&
      parseInt(dd) === date.getDate() &&
      parseInt(mm) === date.getMonth() + 1;
  };

  const handleBirthChange = (val) => {
    const digits = val.replace(/\D/g, '');
    let formatted = '';
    if (digits.length <= 2) formatted = digits;
    else if (digits.length <= 4) formatted = `${digits.slice(0,2)}.${digits.slice(2)}`;
    else formatted = `${digits.slice(0,2)}.${digits.slice(2,4)}.${digits.slice(4,8)}`;

    setForm((f) => ({ ...f, birthDate: formatted }));

    if (formatted.length === 10) {
      setBirthError(validateDate(formatted) ? '' : 'Некорректная дата');
    } else {
      setBirthError('');
    }
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append('displayName', form.displayName);
      fd.append('bio', form.bio);
      fd.append('username', form.username);
      fd.append('birthDate', form.birthDate);
      if (avatarFile) fd.append('avatar', avatarFile);
      if (bannerFile) fd.append('banner', bannerFile);
      return api.patch('/users/me/profile', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: ({ data }) => {
      updateUser(data.user);
      qc.invalidateQueries({ queryKey: ['profile', user.username] });
      qc.invalidateQueries({ queryKey: ['profile', data.user.username] });
      toast.success('Профиль обновлён!');
      onClose();
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Ошибка сохранения'),
  });

  const handleSave = () => {
    if (!form.displayName.trim()) { toast.error('Имя не может быть пустым'); return; }
    if (form.username.length < 3) { toast.error('Никнейм минимум 3 символа'); return; }
    if (!/^[a-zA-Z0-9_]+$/.test(form.username)) { toast.error('Только латиница, цифры и _'); return; }
    if (form.birthDate && !validateDate(form.birthDate)) { toast.error('Некорректная дата'); return; }
    mutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 bg-x-bg/75 backdrop-blur-md flex items-center justify-center p-4">
      <div className="cosmic-panel rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        {/* Шапка */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-x-border sticky top-0 bg-x-bg/90 backdrop-blur-xl z-10">
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-cyan-300/10 transition-colors">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
              <path d="M18.3 5.71a1 1 0 00-1.41 0L12 10.59 7.11 5.7A1 1 0 005.7 7.11L10.59 12 5.7 16.89a1 1 0 001.41 1.41L12 13.41l4.89 4.89a1 1 0 001.41-1.41L13.41 12l4.89-4.89a1 1 0 000-1.4z"/>
            </svg>
          </button>
          <h2 className="font-bold text-lg">Редактировать профиль</h2>
          <button
            onClick={handleSave}
            disabled={mutation.isPending}
            className="btn-primary px-4 py-1.5 text-sm"
          >
            {mutation.isPending ? 'Сохраняем...' : 'Сохранить'}
          </button>
        </div>

        {/* Баннер */}
        <div className="relative">
          <div
            className="h-36 cosmic-banner cursor-pointer group relative overflow-hidden"
            onClick={() => bannerRef.current?.click()}
          >
            {bannerPreview && (
              <img src={bannerPreview} alt="banner" className="w-full h-full object-cover object-center" />
            )}
            <div className="absolute inset-0 bg-x-bg/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white">
                <path d="M3 5.5C3 4.119 4.119 3 5.5 3h13C19.881 3 21 4.119 21 5.5v13c0 1.381-1.119 2.5-2.5 2.5h-13C4.119 21 3 19.881 3 18.5v-13zM5.5 5c-.276 0-.5.224-.5.5v9.086l3-3 3 3 5-5 3 3V5.5c0-.276-.224-.5-.5-.5h-13zM19 15.414l-3-3-5 5-3-3-3 3V18.5c0 .276.224.5.5.5h13c.276 0 .5-.224.5-.5v-3.086z"/>
              </svg>
              <span className="text-white text-sm font-semibold">Изменить фон</span>
            </div>
          </div>
          <input ref={bannerRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => handleFile('banner', e.target.files?.[0])} />

          {/* Аватарка */}
          <div className="absolute -bottom-10 left-4">
            <div
              className="w-20 h-20 rounded-full border-4 border-x-bg cosmic-avatar cursor-pointer group relative"
              onClick={() => avatarRef.current?.click()}
            >
              {avatarPreview
                ? <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover object-top" />
                : <div className="w-full h-full flex items-center justify-center font-bold text-2xl">
                    {user.displayName?.[0]?.toUpperCase()}
                  </div>
              }
              <div className="absolute inset-0 bg-x-bg/70 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14v-4H8l4-4 4 4h-3v4h-2z"/>
                </svg>
              </div>
            </div>
            <input ref={avatarRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => handleFile('avatar', e.target.files?.[0])} />
          </div>
        </div>

        {/* Поля формы */}
        <div className="px-4 pt-14 pb-6 flex flex-col gap-4">

          {/* Имя */}
          <div>
            <label className="block text-xs text-x-muted mb-1.5">Отображаемое имя</label>
            <input
              value={form.displayName}
              onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
              maxLength={100}
              className="input-field"
              placeholder="Твоё имя"
            />
            <p className="text-xs text-x-muted mt-1 text-right">{form.displayName.length}/100</p>
          </div>

          {/* Никнейм */}
          <div>
            <label className="block text-xs text-x-muted mb-1.5">Никнейм</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-x-muted">@</span>
              <input
                value={form.username}
                onChange={(e) => setForm((f) => ({
                  ...f,
                  username: e.target.value.replace(/[^a-zA-Z0-9_]/g, '')
                }))}
                maxLength={50}
                className="input-field pl-7"
                placeholder="username"
              />
            </div>
          </div>

          {/* Био */}
          <div>
            <label className="block text-xs text-x-muted mb-1.5">О себе</label>
            <textarea
              value={form.bio}
              onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
              maxLength={160}
              rows={3}
              className="input-field resize-none"
              placeholder="Расскажи о себе..."
            />
            <p className="text-xs text-x-muted mt-1 text-right">{form.bio.length}/160</p>
          </div>

          {/* Дата рождения */}
          <div>
            <label className="block text-xs text-x-muted mb-1.5">Дата рождения</label>
            <input
              value={form.birthDate}
              onChange={(e) => handleBirthChange(e.target.value)}
              className={`input-field ${birthError ? 'border-red-500 focus:border-red-500' : ''}`}
              placeholder="ДД.ММ.ГГГГ"
              maxLength={10}
            />
            {birthError
              ? <p className="text-xs text-red-400 mt-1">{birthError}</p>
              : <p className="text-xs text-x-muted mt-1">Укажите дату рождения в формате: ДД.ММ.ГГГГ</p>
            }
          </div>
        </div>
      </div>
    </div>
  );
}
