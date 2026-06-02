import { motion } from 'framer-motion';
import { Box, Camera, ChevronRight, FlaskConical, Gamepad2, Home, Layers3, Package, Settings, Sparkles, TerminalSquare, UserRound, WandSparkles } from 'lucide-react';
import type { ComponentType } from 'react';
import type { PageId } from '@/types/launcher';
import { useLauncherStore } from '@/store/useLauncherStore';
import { cn } from '@/utils/cn';

interface NavItem {
  id: PageId;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  section?: string;
}

const nav: NavItem[] = [
  { id: 'home',         label: 'Home',           icon: Home,           section: 'main' },
  { id: 'instances',    label: 'Instances',       icon: Box,            section: 'main' },
  { id: 'snapshots',    label: 'Snapshots',       icon: FlaskConical,   section: 'main' },
  { id: 'mods',         label: 'Mods',            icon: Package,        section: 'content' },
  { id: 'modpacks',     label: 'Modpacks',        icon: Layers3,        section: 'content' },
  { id: 'resourcepacks',label: 'Resource Packs',  icon: Sparkles,       section: 'content' },
  { id: 'shaders',      label: 'Shaders',         icon: WandSparkles,   section: 'content' },
  { id: 'accounts',     label: 'Accounts',        icon: UserRound,      section: 'system' },
  { id: 'console',      label: 'Console',         icon: TerminalSquare, section: 'system' },
  { id: 'gallery',      label: 'Gallery',         icon: Camera,         section: 'system' },
  { id: 'settings',     label: 'Settings',        icon: Settings,       section: 'system' },
];

export function Sidebar() {
  const active = useLauncherStore((state) => state.activePage);
  const setActivePage = useLauncherStore((state) => state.setActivePage);

  return (
    <aside className="relative flex h-full min-h-0 flex-col border-r border-subtle bg-black/30 backdrop-blur-xl">
      <div className="flex items-center gap-2.5 border-b border-subtle px-4 py-3.5">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--accent)] shadow-glow">
          <Gamepad2 size={18} className="text-black" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-black leading-none">Dawn</p>
          <p className="mt-0.5 text-[10px] uppercase tracking-widest text-muted">Launcher</p>
        </div>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden p-2">
        <div className="space-y-0.5">
          {nav.slice(0, 3).map((item) => <NavButton key={item.id} item={item} active={active} onNavigate={setActivePage} />)}
        </div>

        <div className="mx-2 my-2 border-t border-subtle" />
        <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted">Content</p>
        <div className="space-y-0.5">
          {nav.slice(3, 7).map((item) => <NavButton key={item.id} item={item} active={active} onNavigate={setActivePage} />)}
        </div>

        <div className="mx-2 my-2 border-t border-subtle" />
        <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted">System</p>
        <div className="space-y-0.5">
          {nav.slice(7).map((item) => <NavButton key={item.id} item={item} active={active} onNavigate={setActivePage} />)}
        </div>
      </nav>
    </aside>
  );
}

function NavButton({ item, active, onNavigate }: { item: NavItem; active: PageId; onNavigate: (id: PageId) => void }) {
  const Icon = item.icon;
  const selected = active === item.id;

  return (
    <button
      key={item.id}
      title={item.label}
      aria-label={item.label}
      onClick={() => onNavigate(item.id)}
      className={cn(
        'relative flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm transition-colors',
        selected
          ? 'text-white'
          : 'text-muted hover:bg-surface-hover hover:text-primary'
      )}
    >
      {selected && (
        <motion.span
          layoutId="sidebar-active"
          className="absolute inset-0 rounded-md bg-white/[0.09]"
          transition={{ duration: 0.15, ease: 'easeOut' }}
        />
      )}
      <Icon size={16} className="relative shrink-0" />
      <span className="relative min-w-0 flex-1 truncate font-medium">{item.label}</span>
      {selected && (
        <ChevronRight size={12} className="relative shrink-0 text-accent" />
      )}
    </button>
  );
}
