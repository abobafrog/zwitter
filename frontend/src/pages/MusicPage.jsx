import NavIcon from '../components/layout/NavIcon';
import MusicHub from '../components/music/MusicHub';

export default function MusicPage() {
  return (
    <div className="min-h-full px-4 py-5 sm:px-5">
      <div className="mb-5 flex items-center gap-2">
        <NavIcon name="music" className="h-5 w-5 text-x-accent" />
        <div>
          <h1 className="text-xl font-black tracking-normal text-white">Музыка</h1>
          <p className="text-sm text-x-muted">Отдельный музыкальный раздел Zwitter.</p>
        </div>
      </div>

      <div className="grid gap-5">
        <MusicHub />
      </div>
    </div>
  );
}
