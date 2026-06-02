import { Search, Tags } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/Button';
import { ContentTable } from '@/components/ContentTable';
import { MarketplaceGrid } from '@/components/MarketplaceGrid';
import { PageShell } from '@/components/PageShell';
import { Panel } from '@/components/Panel';
import type { ContentKind, MarketplaceProject } from '@/types/launcher';
import { useLauncherStore } from '@/store/useLauncherStore';

// @ts-ignore
import modsBg from '../../backgrounds/mod.png';
// @ts-ignore
import shaderBg from '../../backgrounds/shader.png';
// @ts-ignore
import modpackBg from '../../backgrounds/mod.png';
// @ts-ignore
import resourceBg from '../../backgrounds/background2.png';

const sectionBg: Record<ContentKind, string> = {
  mod: modsBg,
  shader: shaderBg,
  modpack: modpackBg,
  resourcepack: resourceBg
};

const sectionDescription: Record<ContentKind, string> = {
  mod: 'Browse, install, and manage mods for your instances via Modrinth and CurseForge.',
  shader: 'Browse and install shader packs to elevate your Minecraft visuals.',
  modpack: 'Discover and install curated modpacks from Modrinth and CurseForge.',
  resourcepack: 'Find and install resource packs to customize your game textures and sounds.'
};

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

  useEffect(() => {
    if (!query.trim()) {
      setProjects([]);
      return;
    }
    const timer = setTimeout(() => {
      void runSearch();
    }, 350);
    return () => clearTimeout(timer);
  }, [query, provider, versionFilter, kind, selected?.gameVersion, selected?.loader, runSearch]);

  const bg = sectionBg[kind];

  const main = (
    <>
      <Panel className="relative mb-4 overflow-hidden" style={{ minHeight: 140 }}>
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${bg})` }} />
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-black/40" />
        <div className="relative z-10 flex h-full flex-col justify-between p-5" style={{ minHeight: 140 }}>
          <div>
            <h2 className="text-3xl font-black tracking-normal">{title}</h2>
            <p className="mt-1 max-w-lg text-sm text-zinc-300">{sectionDescription[kind]}</p>
            {selected && (
              <p className="mt-1.5 text-xs text-zinc-400">
                Instance: <span className="text-white font-semibold">{selected.name}</span>
                {' '}· {selected.gameVersion} · {selected.loader}
              </p>
            )}
          </div>
          {!selected && (
            <p className="mt-2 text-sm text-yellow-300/80">
              Select an instance in Instances to install content.
            </p>
          )}
        </div>
      </Panel>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={provider}
          onChange={(event) => setProvider(event.target.value as 'modrinth' | 'curseforge')}
          className="ui-input h-10 px-3 text-sm"
        >
          <option value="modrinth">Modrinth</option>
          <option value="curseforge">CurseForge</option>
        </select>
        {versionOptions.length > 0 && (
          <label className="relative">
            <Tags size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <select
              value={versionFilter}
              onChange={(event) => setVersionFilter(event.target.value)}
              className="ui-input h-10 w-40 pl-9 pr-3 text-sm"
            >
              {versionOptions.map((version) => (
                <option key={version} value={version}>
                  {version}
                </option>
              ))}
            </select>
          </label>
        )}
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && void runSearch()}
          className="ui-input h-10 min-w-[14rem] flex-1 px-3 text-sm"
          placeholder={`Search ${title.toLowerCase()}…`}
        />
        <Button tone="primary" icon={<Search size={16} />} onClick={() => void runSearch()} disabled={searching}>
          {searching ? 'Searching…' : 'Search'}
        </Button>
      </div>

      {projects.length > 0 ? (
        <MarketplaceGrid
          projects={projects}
          instanceId={selectedInstanceId}
          onInstall={(project) => selectedInstanceId && void installProject(project, selectedInstanceId)}
        />
      ) : (
        <Panel className="p-8 text-center text-zinc-500">
          {query.trim()
            ? 'No results found. Try a different query or switch providers.'
            : `Search Modrinth or CurseForge to find and install ${title.toLowerCase()} into the selected instance.`}
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
