import { useEffect } from 'react';

/**
 * Freeze the page behind an open dialog.
 *
 * Without this the board keeps scrolling under the overlay, so closing the
 * dialog leaves you somewhere you never chose to be. The previous value is
 * restored rather than being set to a hard-coded `auto`, so two stacked
 * dialogs cannot unlock the page between them.
 */
export function useLockBodyScroll(active = true) {
  useEffect(() => {
    if (!active) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
}
