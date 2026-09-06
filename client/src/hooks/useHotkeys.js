import { useEffect } from 'react';

/** Typing in a field must not trigger a single-letter shortcut. */
function isTyping(target) {
  const tag = target?.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target?.isContentEditable
  );
}

/**
 * A tiny keyboard-shortcut binder.
 *
 * Bindings are written the way people say them — `mod+k`, `shift+?`, `g n` —
 * and `mod` is Cmd on a Mac and Ctrl everywhere else, so one binding is right
 * on both. Sequences (`g` then `n`) are supported because that is how every
 * app with real keyboard support does navigation, and a 900ms window is long
 * enough to be typed and short enough not to catch an unrelated later press.
 */
export function useHotkeys(bindings, { enabled = true } = {}) {
  useEffect(() => {
    if (!enabled) return undefined;

    let sequence = [];
    let timer = null;

    const reset = () => {
      sequence = [];
      if (timer) clearTimeout(timer);
      timer = null;
    };

    const onKeyDown = (event) => {
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      const combo = [
        mod ? 'mod' : null,
        event.shiftKey && key.length > 1 ? 'shift' : null,
        key,
      ].filter(Boolean).join('+');

      // Shortcuts with a modifier still work inside a text field — ⌘K should
      // open the palette wherever you are. Bare letters must not.
      const typing = isTyping(event.target);

      const direct = bindings[combo] || (event.shiftKey ? bindings[`shift+${key}`] : null);
      if (direct && (mod || !typing)) {
        event.preventDefault();
        direct(event);
        reset();
        return;
      }

      if (typing || mod) return;

      sequence.push(key);
      const asSequence = sequence.join(' ');

      if (bindings[asSequence]) {
        event.preventDefault();
        bindings[asSequence](event);
        reset();
        return;
      }

      // Keep waiting only while some binding could still be completed.
      const stillPossible = Object.keys(bindings).some((b) => b.startsWith(`${asSequence} `));
      if (!stillPossible) {
        reset();
        return;
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(reset, 900);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (timer) clearTimeout(timer);
    };
  }, [bindings, enabled]);
}

export const SHORTCUTS = [
  { keys: ['⌘', 'K'], label: 'Open the command palette' },
  { keys: ['/'], label: 'Focus search' },
  { keys: ['C'], label: 'Compose a note' },
  { keys: ['L'], label: 'Compose a checklist' },
  { keys: ['G', 'N'], label: 'Go to Notes' },
  { keys: ['G', 'A'], label: 'Go to Archive' },
  { keys: ['G', 'T'], label: 'Go to Trash' },
  { keys: ['G', 'S'], label: 'Go to Shared with me' },
  { keys: ['G', 'R'], label: 'Go to Reminders' },
  { keys: ['G', 'I'], label: 'Go to Insights' },
  { keys: ['G', 'C'], label: 'Go to Settings' },
  { keys: ['T'], label: 'Toggle light and dark' },
  { keys: ['?'], label: 'Show this list' },
  { keys: ['Esc'], label: 'Close whatever is open' },
];
