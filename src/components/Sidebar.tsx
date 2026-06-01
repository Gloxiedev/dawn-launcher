import { motion } from 'framer-motion';
import { Box, Camera, ChevronRight, Gamepad2, Home, Layers3, Package, Settings, Sparkles, TerminalSquare, UserRound, WandSparkles } from 'lucide-react';
import type { ComponentType } from 'react';
import type { PageId } from '@/store/useLauncherStore';
import { useLauncherStore } from '@/store/useLauncherStore';
import { cn } from '@/utils/cn';

const nav: Array<{ id: PageId; label: string; icon: ComponentType<{ size?: number; className?: string }> }> = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'instances', label: 'Instances', icon: Box },
  { id: 'mods', label: 'Mods', icon: Package },
  { id: 'modpacks', label: 'Modpacks', icon: Layers3 },
  { id: 'resourcepacks', label: 'Resource Packs', icon: Sparkles },
  { id: 'shaders', label: 'Shaders', icon: WandSparkles },
  { id: 'accounts', label: 'Accounts', icon: UserRound },
  { id: 'console', label: 'Console', icon: TerminalSquare },
  { id: 'gallery', label: 'Gallery', icon: Camera },
  { id: 'settings', label: 'Settings', icon: Settings }
];

export function Sidebar() {
  const active = useLauncherStore((state) => state.activePage);
  const setActivePage = useLauncherStore((state) => state.setActivePage);

  return (
    <aside className="relative flex h-screen min-h-0 flex-col border-r border-white/10 bg-black/25 px-3 py-4 backdrop-blur-xl">
      <div className="mb-6 flex items-center gap-3 px-1">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[var(--accent)] text-black shadow-glow">
          <Gamepad2 size={24} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-black">Dawn</p>
          <p className="truncate text-xs text-zinc-500">Launcher</p>
        </div>
      </div>
      <nav className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden pr-1">
        {nav.map((item) => {
          const Icon = item.icon;
          const selected = active === item.id;
          return (
            <button
              key={item.id}
              title={item.label}
              aria-label={item.label}
              onClick={() => setActivePage(item.id)}
              className={cn(
                'relative flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold text-zinc-400 transition hover:bg-white/[0.08] hover:text-white',
                selected && 'text-white'
              )}
            >
              {selected && (
                <motion.span
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-lg bg-white/[0.1] accent-ring"
                  transition={{ duration: 0.18 }}
                />
              )}
              <Icon size={19} className="relative shrink-0" />
              <span className="relative min-w-0 truncate">{item.label}</span>
              {selected && <ChevronRight size={14} className="absolute right-2 text-orange-300" />}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
