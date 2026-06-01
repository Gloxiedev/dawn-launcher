import { Search, Tags } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/Button';
import { ContentTable } from '@/components/ContentTable';
import { MarketplaceGrid } from '@/components/MarketplaceGrid';
import { PageShell } from '@/components/PageShell';
import { Panel } from '@/components/Panel';
import type { ContentKind, MarketplaceProject } from '@/types/launcher';
import { useLauncherStore } from '@/store/useLauncherStore';

interface LibraryPageProps {
  kind: ContentKind;
  title: string;
}

export function LibraryPage({ kind, title }: LibraryPageProps) {
  const selectedInstanceId = useLauncherStore((state) => state.selectedInstanceId);
  const instances = useLauncherStore((state) => state.instances);
  const versions = useLauncherStore((state) => state.versions);
  const query = useLauncherStore((state) => state.librarySearch);
  const librarySearchNonce = useLauncherStore((state) => state.librarySearchNonce);
  const setQuery = useLauncherStore((state) => state.setLibrarySearch);
  const searchMarketplace = useLauncherStore((state) => state.searchMarketplace);
  const installProject = useLauncherStore((state) => state.installProject);
  const selected = instances.find((instance) => instance.id === selectedInstanceId);
  const [provider, setProvider] = useState<'modrinth' | 'curseforge'>('modrinth');
  const [versionFilter, setVersionFilter] = useState(selected?.gameVersion ?? '');
  const [projects, setProjects] = useState<MarketplaceProject[]>([]);
  const [searching, setSearching] = useState(false);

  const versionOptions = useMemo(() => {
    const values = new Set<string>([selected?.gameVersion ?? '', ...versions.slice(0, 80)]);
    return [...values].filter(Boolean);
  }, [selected?.gameVersion, versions]);

  useEffect(() => {
    setVersionFilter(selected?.gameVersion ?? '');
    setProjects([]);
  }, [kind, selected?.gameVersion, selectedInstanceId]);

  const runSearch = useCallback(async () => {
    if (!query.trim()) {
      setProjects([]);
      return;
    }
    setSearching(true);
    try {
      const results = await searchMarketplace({
        provider,
        query: query.trim(),
        kind,
        gameVersion: versionFilter || selected?.gameVersion,
        loader: selected?.loader,
        limit: 24
      });
      setProjects(results.filter((project) => project.projectType === kind));
    } finally {
      setSearching(false);
    }
  }, [provider, query, kind, versionFilter, selected?.gameVersion, selected?.loader, searchMarketplace]);

  useEffect(() => {
    if (librarySearchNonce > 0) {
      void runSearch();
    }
  }, [librarySearchNonce, runSearch]);

  const main = (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black tracking-normal">{title}</h2>
          <p className="mt-1 text-sm text-zinc-400">
            {selected ? `${selected.name} / ${selected.gameVersion} / ${selected.loader}` : 'Select an instance first.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={provider}
            onChange={(event) => setProvider(event.target.value as 'modrinth' | 'curseforge')}
            className="h-10 rounded-md border border-white/10 bg-zinc-950/80 px-3 text-sm outline-none"
          >
            <option value="modrinth">Modrinth</option>
            <option value="curseforge">CurseForge</option>
          </select>
          <label className="relative">
            <Tags size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <select
              value={versionFilter}
              onChange={(event) => setVersionFilter(event.target.value)}
              className="h-10 w-40 rounded-md border border-white/10 bg-zinc-950/80 pl-9 pr-3 text-sm outline-none"
            >
              {versionOptions.map((version) => (
                <option key={version} value={version}>
                  {version}
                </option>
              ))}
            </select>
          </label>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && void runSearch()}
            className="h-10 w-72 rounded-md border border-white/10 bg-white/[0.06] px-3 text-sm outline-none"
            placeholder={`Search ${title.toLowerCase()}`}
          />
          <Button tone="primary" icon={<Search size={16} />} onClick={() => void runSearch()} disabled={searching}>
            {searching ? 'Searching…' : 'Search'}
          </Button>
        </div>
      </div>
      <MarketplaceGrid projects={projects} instanceId={selectedInstanceId} onInstall={(project) => selectedInstanceId && void installProject(project, selectedInstanceId)} />
      {!projects.length && (
        <Panel className="p-8 text-center text-zinc-500">
          {query.trim() ? 'No results yet. Try another query or provider.' : 'Search Modrinth or CurseForge to install content into the selected instance.'}
        </Panel>
      )}
    </>
  );

  return (
    <PageShell aside={<ContentTable instanceId={selectedInstanceId} kind={kind} query={query} />} asideWidth={420}>
      {main}
    </PageShell>
  );
}
