import { FileArchive, FolderInput, Power, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ContentFile, ContentKind } from '@/types/launcher';
import { Button } from './Button';
import { Panel } from './Panel';

interface ContentTableProps {
  instanceId?: string;
  kind: ContentKind;
  query?: string;
}

export function ContentTable({ instanceId, kind, query = '' }: ContentTableProps) {
  const [files, setFiles] = useState<ContentFile[]>([]);
  const filtered = files.filter((file) => file.name.toLowerCase().includes(query.trim().toLowerCase()));

  const refresh = async () => {
    if (!instanceId) {
      setFiles([]);
      return;
    }
    setFiles(await window.dawn.content.list(instanceId, kind));
  };

  useEffect(() => {
    void refresh();
  }, [instanceId, kind]);

  return (
    <Panel className="flex h-full min-h-[320px] flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/10 p-4">
        <div>
          <h3 className="font-black">Installed</h3>
          <p className="text-sm text-zinc-400">{filtered.length} of {files.length} files</p>
        </div>
        <Button icon={<FolderInput size={16} />} onClick={() => instanceId && window.dawn.content.import(instanceId, kind).then(setFiles)}>
          Import
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.map((file) => (
          <div key={file.path} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-white/[0.06] px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <FileArchive size={18} className="text-orange-200" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{file.name}</p>
                <p className="text-xs text-zinc-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            </div>
            <Button
              tone={file.enabled ? 'secondary' : 'ghost'}
              icon={<Power size={15} />}
              onClick={() => instanceId && window.dawn.content.toggle(instanceId, kind, file.path).then(setFiles)}
            >
              {file.enabled ? 'Enabled' : 'Disabled'}
            </Button>
            <Button tone="danger" icon={<Trash2 size={15} />} onClick={() => instanceId && window.dawn.content.remove(instanceId, kind, file.path).then(setFiles)} />
          </div>
        ))}
        {!filtered.length && <div className="p-8 text-center text-sm text-zinc-500">{files.length ? 'No files match the search.' : 'No files installed.'}</div>}
      </div>
    </Panel>
  );
}
