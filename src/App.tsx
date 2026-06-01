import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { AccountPage } from './pages/AccountPage';
import { ConsolePage } from './pages/ConsolePage';
import { GalleryPage } from './pages/GalleryPage';
import { HomePage } from './pages/HomePage';
import { InstancesPage } from './pages/InstancesPage';
import { LibraryPage } from './pages/LibraryPage';
import { SettingsPage } from './pages/SettingsPage';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { Notifications } from './components/Notifications';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useLauncherStore } from './store/useLauncherStore';

export function App() {
  const activePage = useLauncherStore((state) => state.activePage);
  const bootstrap = useLauncherStore((state) => state.bootstrap);
  const settings = useLauncherStore((state) => state.settings);
  useKeyboardShortcuts();

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', settings?.accentColor || '#ff7a1a');
    document.documentElement.dataset.theme = settings?.theme || 'ember';

    let style = document.getElementById('dawn-custom-theme');
    if (!style) {
      style = document.createElement('style');
      style.id = 'dawn-custom-theme';
      document.head.appendChild(style);
    }
    style.textContent = settings?.theme === 'custom' ? settings.customThemeCss || '' : '';
  }, [settings?.accentColor, settings?.customThemeCss, settings?.theme]);

  return (
    <div className="h-screen overflow-hidden bg-[var(--page-bg)] text-zinc-100">
      <div className="app-aurora" />
      <div className="noise-layer" />
      <div className="relative grid h-screen grid-cols-[176px_minmax(0,1fr)]">
        <Sidebar />
        <main className="flex min-w-0 flex-col">
          <TopBar />
          <section className="min-h-0 flex-1 overflow-hidden px-6 pb-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={activePage}
                initial={{ opacity: 0, y: 14, filter: 'blur(8px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -10, filter: 'blur(8px)' }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="h-full min-h-0"
              >
                {activePage === 'home' && <HomePage />}
                {activePage === 'instances' && <InstancesPage />}
                {activePage === 'mods' && <LibraryPage kind="mod" title="Mods" />}
                {activePage === 'modpacks' && <LibraryPage kind="modpack" title="Modpacks" />}
                {activePage === 'resourcepacks' && <LibraryPage kind="resourcepack" title="Resource Packs" />}
                {activePage === 'shaders' && <LibraryPage kind="shader" title="Shaders" />}
                {activePage === 'accounts' && <AccountPage />}
                {activePage === 'settings' && <SettingsPage />}
                {activePage === 'console' && <ConsolePage />}
                {activePage === 'gallery' && <GalleryPage />}
              </motion.div>
            </AnimatePresence>
          </section>
        </main>
      </div>
      <Notifications />
    </div>
  );
}
