import { Camera, FolderOpen, RotateCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/Button';
import { PageShell } from '@/components/PageShell';
import { Panel } from '@/components/Panel';
import type { ScreenshotItem } from '@/types/launcher';
import { useLauncherStore } from '@/store/useLauncherStore';

function ScreenshotCard({ screenshot }: { screenshot: ScreenshotItem }) {
  const [url, setUrl] = useState('');
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void window.dawn.gallery.preview(screenshot.path).then((preview) => {
      if (cancelled) {
        return;
      }
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
    <Panel className="overflow-hidden">
      <button type="button" className="block w-full" onClick={() => void window.dawn.app.revealPath(screenshot.path)}>
        {url && !missing ? (
          <img src={url} alt={screenshot.name} className="aspect-video w-full object-cover" />
        ) : (
          <div className="grid aspect-video place-items-center bg-white/[0.04] text-xs text-zinc-500">{missing ? 'File missing' : 'Loading…'}</div>
        )}
        <div className="flex items-center justify-between gap-3 p-3 text-left">
          <span className="min-w-0 truncate text-sm font-semibold">{screenshot.name}</span>
          <span className="text-xs text-zinc-500">{new Date(screenshot.createdAt).toLocaleDateString()}</span>
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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-black tracking-normal">Gallery</h2>
          <p className="mt-1 text-sm text-zinc-400">
            {selected ? `${selected.name} — ${selected.gameDir}/screenshots` : 'Select an instance'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button icon={<RotateCw size={16} />} onClick={() => void refresh()} disabled={isRefreshing}>
            {isRefreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
          <Button tone="primary" icon={<FolderOpen size={16} />} onClick={() => selected && window.dawn.gallery.openFolder(selected.id)}>
            Screenshots
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {screenshots.map((screenshot) => (
          <ScreenshotCard key={screenshot.path} screenshot={screenshot} />
        ))}
        {!screenshots.length && (
          <Panel className="grid aspect-video place-items-center border-dashed text-center text-zinc-500 md:col-span-2 xl:col-span-3">
            <div>
              <Camera size={34} className="mx-auto mb-3" />
              <p>No screenshots found. Press F2 in-game to capture.</p>
            </div>
          </Panel>
        )}
      </div>
    </PageShell>
  );
}
