import { AnimatePresence, motion } from 'framer-motion';
import { useToast } from '../context/ToastContext.jsx';
import { CloseIcon } from './Icons.jsx';

const TONES = {
  default: 'bg-ink text-app',
  danger: 'bg-red-600 text-white',
  success: 'bg-emerald-600 text-white',
};

/**
 * Toasts sit above everything, bottom-left, the way Keep's do.
 *
 * The action button is the point: "Moved to trash — Undo" turns a destructive
 * click into a reversible one, which beats a confirmation dialog for anything
 * that can simply be undone.
 */
export default function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <div
      className="pointer-events-none fixed bottom-4 left-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      // Announced to screen readers without stealing focus.
      role="status"
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
            className={`pointer-events-auto flex items-center gap-3 rounded-lg px-4 py-3 text-sm shadow-raised ${
              TONES[t.tone] || TONES.default
            }`}
          >
            <span className="flex-1">{t.message}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action();
                  dismiss(t.id);
                }}
                className="shrink-0 rounded px-2 py-1 text-xs font-semibold uppercase tracking-wide underline-offset-2 hover:underline"
              >
                {t.actionLabel || 'Undo'}
              </button>
            )}
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
              className="shrink-0 opacity-60 transition hover:opacity-100"
            >
              <CloseIcon width={16} height={16} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
