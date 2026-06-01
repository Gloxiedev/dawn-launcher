import { Minus, Square, X } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import { cn } from '@/utils/cn';

export function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    void window.dawn.window.isMaximized().then(setMaximized);
    return window.dawn.events.onWindowMaximized(setMaximized);
  }, []);

  if (window.dawn.app.platform === 'darwin') {
    return null;
  }

  return (
    <div className="window-controls flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
      <button
        type="button"
        className="window-control-btn"
        aria-label="Minimize"
        onClick={() => void window.dawn.window.minimize()}
      >
        <Minus size={16} />
      </button>
      <button
        type="button"
        className="window-control-btn"
        aria-label={maximized ? 'Restore' : 'Maximize'}
        onClick={() => void window.dawn.window.toggleMaximize()}
      >
        <Square size={14} className={cn(maximized && 'scale-90')} />
      </button>
      <button
        type="button"
        className="window-control-btn window-control-btn-close"
        aria-label="Close"
        onClick={() => void window.dawn.window.close()}
      >
        <X size={16} />
      </button>
    </div>
  );
}
