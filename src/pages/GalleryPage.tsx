import { Camera, FolderOpen, RotateCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/Button';
import { PageShell } from '@/components/PageShell';
import { Panel } from '@/components/Panel';
import type { ScreenshotItem } from '@/types/launcher';
import { useLauncherStore } from '@/store/useLauncherStore';

// @ts-ignore
import galleryBg from '../../backgrounds/background2.png';

function ScreenshotCard({ screenshot }: { screenshot: ScreenshotItem }) {
  const [url, setUrl] = useState('');
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void window.dawn.gallery.preview(screenshot.path).then((preview) => {
      if (cancelled) return;
      if (!preview) {
        setMissing(true);
        return;
      }
      setUrl(preview);
    });
    return () => {
      cancelled = true;
    };
  }, [screenshot.path]);

  return (
    <Panel className="overflow-hidden transition hover:border-accent/30">
      <button type="button" className="block w-full" onClick={() => void window.dawn.app.revealPath(screenshot.path)}>
        {url && !missing ? (
          <img src={url} alt={screenshot.name} className="aspect-video w-full object-cover" />
        ) : (
          <div className="grid aspect-video place-items-center bg-white/[0.04] text-xs text-zinc-500">
            {missing ? 'File missing' : 'Loading…'}
          </div>
        )}
        <div className="flex items-center justify-between gap-3 p-3 text-left">
          <span className="min-w-0 truncate text-sm font-semibold">{screenshot.name}</span>
          <span className="shrink-0 text-xs text-zinc-500">
            {new Date(screenshot.createdAt).toLocaleDateString()}
          </span>
        </div>
      </button>
    </Panel>
  );
}

export function GalleryPage() {
  const instances = useLauncherStore((state) => state.instances);
  const selectedInstanceId = useLauncherStore((state) => state.selectedInstanceId);
  const selected = instances.find((instance) => instance.id === selectedInstanceId);
  const [screenshots, setScreenshots] = useState<ScreenshotItem[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const librarySearch = useLauncherStore((state) => state.librarySearch);
  const visibleScreenshots = screenshots.filter(
    (shot) => !librarySearch.trim() || shot.name.toLowerCase().includes(librarySearch.trim().toLowerCase())
  );

  const refresh = useCallback(async () => {
    if (!selectedInstanceId) {
      setScreenshots([]);
      return;
    }
    setIsRefreshing(true);
    try {
      setScreenshots(await window.dawn.gallery.list(selectedInstanceId));
    } finally {
      setIsRefreshing(false);
    }
  }, [selectedInstanceId]);

  useEffect(() => {
    if (!selectedInstanceId) {
      setScreenshots([]);
      return;
    }

    void refresh();
    void window.dawn.gallery.watch(selectedInstanceId);
    const unsubscribe = window.dawn.events.onGalleryChanged((instanceId) => {
      if (instanceId === selectedInstanceId) {
        void refresh();
      }
    });

    return () => {
      unsubscribe();
      void window.dawn.gallery.unwatch(selectedInstanceId);
    };
  }, [selectedInstanceId, refresh]);

  return (
    <PageShell>
      <Panel className="relative mb-5 overflow-hidden" style={{ minHeight: 130 }}>
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${galleryBg})` }} />
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-black/40" />
        <div className="relative z-10 flex items-center justify-between gap-4 p-5" style={{ minHeight: 130 }}>
          <div>
            <h2 className="text-3xl font-black tracking-normal">Gallery</h2>
            <p className="mt-1 max-w-lg text-sm text-zinc-300">
              {selected
                ? `Screenshots for ${selected.name} — press F2 in-game to capture.`
                : 'Select an instance to browse its screenshots.'}
            </p>
            {selected && (
              <p className="mt-1.5 text-xs text-zinc-400">
                {selected.gameDir}/screenshots
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button icon={<RotateCw size={16} />} onClick={() => void refresh()} disabled={isRefreshing}>
              {isRefreshing ? 'Refreshing…' : 'Refresh'}
            </Button>
            <Button
              tone="primary"
              icon={<FolderOpen size={16} />}
              onClick={() => selected && void window.dawn.gallery.openFolder(selected.id)}
              disabled={!selected}
            >
              Open Folder
            </Button>
          </div>
        </div>
      </Panel>

      {visibleScreenshots.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleScreenshots.map((screenshot) => (
            <ScreenshotCard key={screenshot.path} screenshot={screenshot} />
          ))}
        </div>
      ) : (
        <Panel className="grid aspect-video place-items-center border-dashed text-center text-zinc-500 max-h-64">
          <div>
            <Camera size={36} className="mx-auto mb-3 opacity-40" />
            <p className="font-semibold">No screenshots found</p>
            <p className="mt-1 text-sm">
              {selected
                ? 'Press F2 while in-game to take a screenshot.'
                : 'Select an instance from the sidebar first.'}
            </p>
          </div>
        </Panel>
      )}
    </PageShell>
  );
}
