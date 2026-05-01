import { useState } from 'react';
import NavIcon from '../components/layout/NavIcon';
import ladyGagaTracks from '../data/ladyGagaTracks';
import useMusicStore from '../store/musicStore';

const miniServices = [
  {
    id: 'music',
    title: 'Музыка',
    label: 'Lady Gaga',
    description: 'Лицензированная музыка прямо внутри сайта с фоновым воспроизведением.',
    icon: 'music',
    accent: 'from-fuchsia-400 to-cyan-300',
  },
  {
    id: 'notes',
    title: 'Быстрые заметки',
    label: 'пример',
    description: 'Место для коротких черновиков, идей постов и личных напоминаний.',
    icon: 'bookmark',
    accent: 'from-cyan-300 to-blue-500',
  },
  {
    id: 'weather',
    title: 'Погода',
    label: 'пример',
    description: 'Виджет для будущего прогноза по городу и космического настроения дня.',
    icon: 'compass',
    accent: 'from-sky-300 to-emerald-300',
  },
  {
    id: 'tasks',
    title: 'Задачи',
    label: 'пример',
    description: 'Мини-доска для дел: запланировать, сделать, сохранить на потом.',
    icon: 'services',
    accent: 'from-violet-300 to-blue-400',
  },
];

function ServiceCard({ service, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-40 rounded-3xl border p-4 text-left transition ${
        active
          ? 'border-cyan-300/60 bg-cyan-300/12 shadow-neon'
          : 'border-x-border/70 bg-x-panel/50 hover:border-cyan-300/45 hover:bg-cyan-300/10'
      }`}
    >
      <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${service.accent} text-slate-950 shadow-neon`}>
        <NavIcon name={service.icon} className="h-6 w-6" />
      </div>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-black text-x-text">{service.title}</h2>
        <span className="rounded-full border border-x-border bg-x-bg/70 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-x-muted">
          {service.label}
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-x-muted">{service.description}</p>
    </button>
  );
}

function ExamplePanel({ service }) {
  const [selectedTrackId, setSelectedTrackId] = useState(ladyGagaTracks[0].id);
  const playTrack = useMusicStore((state) => state.playTrack);
  const currentTrack = useMusicStore((state) => state.currentTrack);
  const isPlaying = useMusicStore((state) => state.isPlaying);
  const selectedTrack = ladyGagaTracks.find((track) => track.id === selectedTrackId) || ladyGagaTracks[0];

  if (service.id === 'music') {
    return (
      <section className="rounded-3xl border border-cyan-300/25 bg-x-panel/55 p-4 shadow-panel">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="nebula-section-heading">music service</p>
            <h2 className="text-2xl font-black text-x-text">Lady Gaga</h2>
            <p className="mt-1 text-sm text-x-muted">
              Выбирайте трек и слушайте фоном прямо на сайте. Плеер готов для подключённых лицензированных аудиофайлов.
            </p>
          </div>
          <a
            href="https://music.apple.com/search?term=Lady%20Gaga"
            target="_blank"
            rel="noreferrer"
            className="btn-outline inline-flex justify-center px-4 py-2 text-sm"
          >
            Lady Gaga
          </a>
        </div>
        <div className="rounded-3xl border border-x-border bg-slate-950/70 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-x-muted">Выбранный трек</p>
              <p className="mt-1 truncate text-xl font-black text-x-text">{selectedTrack.title}</p>
              <p className="text-sm text-x-muted">{selectedTrack.year} · играет фоном при переходах</p>
            </div>
            <button
              type="button"
              onClick={() => playTrack(selectedTrack)}
              className="btn-accent px-5 py-2 text-sm"
            >
              {isPlaying && currentTrack?.id === selectedTrack.id ? 'Играет фоном' : 'Слушать фоном'}
            </button>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {ladyGagaTracks.map((track) => (
            <button
              key={track.id}
              type="button"
              onClick={() => {
                setSelectedTrackId(track.id);
                playTrack(track);
              }}
              className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                selectedTrack.id === track.id
                  ? 'border-cyan-300/60 bg-cyan-300/12 text-x-text shadow-neon'
                  : 'border-x-border bg-x-bg/55 text-x-muted hover:border-cyan-300/45 hover:text-x-text'
              }`}
            >
              <span className="font-black">{track.title}</span>
              <span className="text-xs font-bold">{track.year}</span>
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-x-border/70 bg-x-panel/55 p-5 shadow-panel">
      <p className="nebula-section-heading">demo service</p>
      <h2 className="mt-2 text-2xl font-black text-x-text">{service.title}</h2>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-x-muted">{service.description}</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {['Статус', 'Данные', 'Интеграция'].map((item, index) => (
          <div key={item} className="rounded-2xl border border-x-border bg-x-bg/55 p-4">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-x-muted">{item}</p>
            <p className="mt-2 text-lg font-black text-x-text">{index === 0 ? 'Готово' : 'Пример'}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function ServicesPage() {
  const [activeId, setActiveId] = useState('music');
  const activeService = miniServices.find((service) => service.id === activeId) || miniServices[0];

  return (
    <div className="min-h-full">
      <div className="cosmic-header px-4 py-3 sm:px-5">
        <p className="nebula-section-heading">лаборатория</p>
        <h1 className="flex items-center gap-2 text-xl font-black tracking-normal">
          <NavIcon name="services" className="h-5 w-5 text-x-accent" />
          Мини-сервисы
        </h1>
        <p className="mt-2 text-sm text-x-muted">
          Небольшие встроенные инструменты и витрины будущих сервисов Zwiteer.
        </p>
      </div>

      <div className="grid gap-5 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          {miniServices.map((service) => (
            <ServiceCard
              key={service.id}
              service={service}
              active={service.id === activeId}
              onClick={() => setActiveId(service.id)}
            />
          ))}
        </div>
        <ExamplePanel service={activeService} />
      </div>
    </div>
  );
}
