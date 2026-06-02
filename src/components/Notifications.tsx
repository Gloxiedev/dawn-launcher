import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Info } from 'lucide-react';
import { useLauncherStore } from '@/store/useLauncherStore';

export function Notifications() {
  const notifications = useLauncherStore((state) => state.notifications);

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-96 flex-col gap-3">
      <AnimatePresence>
        {notifications.map((item) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            className="glass rounded-lg p-4"
          >
            <div className="flex gap-3">
              {item.tone === 'success' ? <CheckCircle2 className="text-emerald-300" size={20} /> : <Info className="text-orange-200" size={20} />}
              <div>
                <p className="text-sm font-black">{item.title}</p>
                <p className="mt-1 text-sm text-zinc-400">{item.body}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
