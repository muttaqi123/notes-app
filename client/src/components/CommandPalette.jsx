import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import {
  SearchIcon, NoteIcon, ArchiveIcon, TrashIcon, LabelIcon, ChartIcon,
  SettingsIcon, SunIcon, MoonIcon, CheckboxIcon, UsersIcon, ClockIcon,
} from './Icons.jsx';

/**
 * ⌘K.
 *
 * One place to reach anything — every view, every label, every note, and the
 * handful of actions worth a shortcut. The ranking is deliberately simple: a
 * prefix match beats a word-boundary match beats a substring match, which is
 * enough to put the thing you meant at the top without pulling in a fuzzy
 * search library for a list this size.
 */
function score(text, query) {
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  if (!needle) return 1;

  const index = haystack.indexOf(needle);
  if (index === -1) return 0;
  if (index === 0) return 3;
  // A match at the start of any word reads as intentional; mid-word does not.
  if (/\s|[-_/]/.test(haystack[index - 1])) return 2;
  return 1;
}

export default function CommandPalette({ open, ...props }) {
  // Mount only while open, with a fresh instance each time — see the note on
  // resetting state by remounting rather than by effect.
  if (!open) return null;
  return <Palette {...props} />;
}

function Palette({ onClose, notes = [], labels = [], onOpenNote, onCreate }) {
  const [query, setQuery] = useState('');
  const [activeRaw, setActive] = useState(0);
  const navigate = useNavigate();
  const { preference, setPreference, isDark } = useTheme();
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    // The frame delay lets the dialog mount before focus moves into it.
    // Nothing is reset here — the palette is remounted by its `key` when it
    // opens, and remounting is how you clear state you never want carried
    // over, rather than setting it back by hand in an effect.
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const commands = useMemo(() => {
    const go = (path) => () => navigate(path);
    return [
      { id: 'new-note', label: 'New note', hint: 'Create', icon: NoteIcon, run: () => onCreate('note') },
      { id: 'new-list', label: 'New checklist', hint: 'Create', icon: CheckboxIcon, run: () => onCreate('checklist') },
      { id: 'go-notes', label: 'Go to Notes', hint: 'Navigate', icon: NoteIcon, run: go('/') },
      { id: 'go-reminders', label: 'Go to Reminders', hint: 'Navigate', icon: ClockIcon, run: go('/reminders') },
      { id: 'go-shared', label: 'Go to Shared with me', hint: 'Navigate', icon: UsersIcon, run: go('/shared') },
      { id: 'go-archive', label: 'Go to Archive', hint: 'Navigate', icon: ArchiveIcon, run: go('/archive') },
      { id: 'go-trash', label: 'Go to Trash', hint: 'Navigate', icon: TrashIcon, run: go('/trash') },
      { id: 'go-insights', label: 'Go to Insights', hint: 'Navigate', icon: ChartIcon, run: go('/insights') },
      { id: 'go-settings', label: 'Go to Settings', hint: 'Navigate', icon: SettingsIcon, run: go('/settings') },
      {
        id: 'theme',
        label: isDark ? 'Switch to light theme' : 'Switch to dark theme',
        hint: 'Appearance',
        icon: isDark ? SunIcon : MoonIcon,
        run: () => setPreference(isDark ? 'light' : 'dark'),
      },
      {
        id: 'theme-system',
        label: 'Follow the system theme',
        hint: 'Appearance',
        icon: preference === 'system' ? CheckboxIcon : SunIcon,
        run: () => setPreference('system'),
      },
    ];
  }, [navigate, isDark, preference, setPreference, onCreate]);

  const results = useMemo(() => {
    const items = [
      ...commands.map((c) => ({ ...c, group: 'Actions', text: `${c.label} ${c.hint}` })),
      ...labels.map((l) => ({
        id: `label-${l.id}`,
        label: l.name,
        hint: 'Label',
        icon: LabelIcon,
        group: 'Labels',
        text: l.name,
        run: () => navigate(`/label/${l.id}`),
      })),
      ...notes.slice(0, 200).map((n) => ({
        id: `note-${n.id}`,
        label: n.title || 'Untitled',
        hint: (n.body || (n.items || []).map((i) => i.text).join(', ')).slice(0, 60),
        icon: n.type === 'checklist' ? CheckboxIcon : NoteIcon,
        group: 'Notes',
        text: `${n.title} ${n.body} ${(n.items || []).map((i) => i.text).join(' ')}`,
        run: () => onOpenNote(n),
      })),
    ];

    return items
      .map((item) => ({ item, rank: score(item.text || item.label, query) }))
      .filter((r) => r.rank > 0)
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 40)
      .map((r) => r.item);
  }, [commands, labels, notes, query, navigate, onOpenNote]);

  // Derived, not stored: when the results shrink under a longer query the
  // highlight has to stay in range, and clamping on read is simpler — and
  // cannot get out of step — than resetting it from an effect.
  const active = results.length ? Math.min(activeRaw, results.length - 1) : 0;

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const run = (item) => {
    onClose();
    item.run();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % Math.max(results.length, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % Math.max(results.length, 1));
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault();
      run(results[active]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-[12vh]"
        style={{ background: 'var(--overlay)' }}
        onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ opacity: 0, y: -8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          className="w-full max-w-xl overflow-hidden rounded-xl border border-line bg-raised shadow-raised"
        >
          <div className="flex items-center gap-3 border-b border-line px-4">
            <SearchIcon width={18} height={18} className="shrink-0 text-muted" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search notes, jump to a view, run a command…"
              aria-label="Command palette search"
              className="w-full bg-transparent py-4 text-sm text-ink outline-none placeholder:text-faint"
            />
            <kbd className="hidden shrink-0 rounded border border-line px-1.5 py-0.5 text-[10px] text-faint sm:block">
              ESC
            </kbd>
          </div>

          <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-2">
            {results.length === 0 && (
              <p className="px-3 py-8 text-center text-sm text-muted">Nothing matches “{query}”</p>
            )}

            {results.map((item, index) => {
              const showGroup = item.group !== results[index - 1]?.group;
              const Icon = item.icon;
              return (
                <div key={item.id}>
                  {showGroup && (
                    <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-faint">
                      {item.group}
                    </p>
                  )}
                  <button
                    type="button"
                    data-active={index === active}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => run(item)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      index === active ? 'bg-subtle text-ink' : 'text-ink hover:bg-subtle/60'
                    }`}
                  >
                    <Icon width={16} height={16} className="shrink-0 text-muted" />
                    <span className="truncate">{item.label}</span>
                    {item.hint && (
                      <span className="ml-auto truncate pl-3 text-xs text-faint">{item.hint}</span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-4 border-t border-line px-4 py-2 text-[11px] text-faint">
            <span><kbd className="font-sans">↑↓</kbd> navigate</span>
            <span><kbd className="font-sans">↵</kbd> open</span>
            <span><kbd className="font-sans">esc</kbd> close</span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
