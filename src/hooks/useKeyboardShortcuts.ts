import { useEffect } from 'react';
import { useLauncherStore } from '@/store/useLauncherStore';

export function useKeyboardShortcuts() {
  const launchSelected = useLauncherStore((state) => state.launchSelected);
  const setActivePage = useLauncherStore((state) => state.setActivePage);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        void launchSelected();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setActivePage('mods');
      }
      if ((event.ctrlKey || event.metaKey) && event.key === ',') {
        event.preventDefault();
        setActivePage('settings');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [launchSelected, setActivePage]);
}
