import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll.js';

/**
 * One dialog implementation, used by every dialog in the app.
 *
 * It handles the three things that are easy to forget individually and
 * embarrassing to get wrong: Escape closes it, a click outside closes it, and
 * the page behind it stops scrolling. Focus is moved into the panel on open so
 * a keyboard user is not left tabbing through the board underneath.
 */
export default function Modal({
  open, onClose, children, label, width = 'max-w-2xl', align = 'start',
}) {
  const panelRef = useRef(null);
  useLockBodyScroll(open);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelector(
        'input, textarea, button, [href], select, [tabindex]:not([tabindex="-1"])'
      );
      (focusable || panel).focus?.();
    });
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className={`fixed inset-0 z-50 flex justify-center overflow-y-auto p-4 ${
            align === 'center' ? 'items-center' : 'items-start pt-12 sm:pt-20'
          }`}
          style={{ background: 'var(--overlay)' }}
          onMouseDown={(e) => {
            if (!panelRef.current?.contains(e.target)) onClose();
          }}
        >
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            initial={{ opacity: 0, y: 10, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.99 }}
            transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
            className={`w-full ${width} rounded-xl border border-line bg-raised text-ink shadow-raised outline-none`}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
