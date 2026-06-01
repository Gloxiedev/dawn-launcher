import { Camera, FolderOpen, RotateCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/Button';
import { Panel } from '@/components/Panel';
import type { ScreenshotItem } from '@/types/launcher';
import { useLauncherStore } from '@/store/useLauncherStore';

export function GalleryPage() {
  const instances = useLauncherStore((state) => state.instances);
  const selectedInstanceId = useLauncherStore((state) => state.selectedInstanceId);
  const selected = instances.find((instance) => instance.id === selectedInstanceId);
  const [screenshots, setScreenshots] = useState<ScreenshotItem[]>([]);

  const refresh = async () => {
    if (!selectedInstanceId) {
      setScreenshots([]);
      return;
    }
    setScreenshots(await window.dawn.gallery.list(selectedInstanceId));
  };

  useEffect(() => {
    void refresh();
  }, [selectedInstanceId]);

  return (
    <div className="h-full min-h-0 overflow-auto pr-1">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-black tracking-normal">Gallery</h2>
          <p className="mt-1 text-sm text-zinc-400">{selected?.name || 'Select an instance'}</p>
        </div>
        <div className="flex gap-2">
          <Button icon={<RotateCw size={16} />} onClick={() => void refresh()}>
            Refresh
          </Button>
          <Button tone="primary" icon={<FolderOpen size={16} />} onClick={() => selected && window.dawn.gallery.openFolder(selected.id)}>
            Screenshots
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {screenshots.map((screenshot) => (
          <Panel key={screenshot.path} className="overflow-hidden">
            <button className="block w-full" onClick={() => void window.dawn.app.revealPath(screenshot.path)}>
              <img src={screenshot.url} alt={screenshot.name} className="aspect-video w-full object-cover" />
              <div className="flex items-center justify-between gap-3 p-3 text-left">
                <span className="min-w-0 truncate text-sm font-semibold">{screenshot.name}</span>
                <span className="text-xs text-zinc-500">{new Date(screenshot.createdAt).toLocaleDateString()}</span>
              </div>
            </button>
          </Panel>
        ))}
        {!screenshots.length && (
          <Panel className="grid aspect-video place-items-center border-dashed text-center text-zinc-500">
            <div>
              <Camera size={34} className="mx-auto mb-3" />
              <p>No screenshots found.</p>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
