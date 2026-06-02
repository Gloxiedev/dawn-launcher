export const pageTransition = {
  initial: { opacity: 0, y: 14, filter: 'blur(8px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  exit: { opacity: 0, y: -10, filter: 'blur(8px)' },
  transition: { duration: 0.18, ease: 'easeOut' }
} as const;

export const cardHover = {
  whileHover: { y: -2, transition: { duration: 0.14 } },
  whileTap: { scale: 0.99 }
} as const;
