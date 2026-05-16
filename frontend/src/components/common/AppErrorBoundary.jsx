import { Component } from 'react';

export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('App render failed', error, info);
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-x-bg px-6 text-x-text">
          <div className="max-w-xl rounded-2xl border border-red-400/40 bg-red-950/30 p-5 shadow-2xl">
            <p className="text-sm font-black uppercase tracking-[0.22em] text-red-200">Ошибка интерфейса</p>
            <h1 className="mt-2 text-2xl font-black">Страница не смогла открыться</h1>
            <p className="mt-3 text-sm text-red-100/90">{error.message || 'Неизвестная ошибка'}</p>
            {error.stack && (
              <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl bg-black/30 p-3 text-xs text-red-50/80">
                {error.stack}
              </pre>
            )}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 rounded-full bg-red-100 px-4 py-2 text-sm font-black text-red-950"
            >
              Перезагрузить
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
