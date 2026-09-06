import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import { colorStyle } from '../lib/colors.js';
import { ColorMenu, LabelMenu } from './Menus.jsx';
import ReminderMenu, { formatReminder } from './ReminderMenu.jsx';
import ChecklistEditor from './ChecklistEditor.jsx';
import {
  CheckboxIcon, NoteIcon, PaletteIcon, LabelIcon, ArchiveIcon, PinIcon, ClockIcon,
} from './Icons.jsx';

const EMPTY = {
  title: '', body: '', type: 'note', items: [{ text: '', checked: false }],
  color: 'default', pinned: false, remindAt: null, labels: [],
};

/**
 * The "Take a note…" box.
 *
 * Collapsed it is a single line; clicking expands it, and clicking away saves
 * and collapses — the note is never lost to a missing Save button, and an
 * untouched box saves nothing at all.
 */
const Composer = forwardRef(function Composer({ labels, onCreate, onCreateLabel }, ref) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [error, setError] = useState(null);
  const boxRef = useRef(null);
  const bodyRef = useRef(null);
  const titleRef = useRef(null);

  const isEmpty =
    !draft.title.trim() && !draft.body.trim() && !draft.items.some((i) => i.text.trim());

  // The command palette and the `c` / `l` shortcuts open the composer, so it
  // exposes that rather than the page reaching into its state.
  useImperativeHandle(ref, () => ({
    open(type = 'note') {
      setDraft({ ...EMPTY, type });
      setOpen(true);
      requestAnimationFrame(() => (type === 'note' ? bodyRef : titleRef).current?.focus());
    },
  }));

  const close = async () => {
    setPaletteOpen(false);
    setLabelsOpen(false);
    setReminderOpen(false);
    if (!isEmpty) {
      try {
        await onCreate({
          ...draft,
          items: draft.type === 'checklist' ? draft.items.filter((i) => i.text.trim()) : [],
          body: draft.type === 'checklist' ? '' : draft.body,
        });
        setError(null);
      } catch (err) {
        setError(err.message);
        return; // Stay open so the typing is not thrown away.
      }
    }
    setDraft(EMPTY);
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) close();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  });

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  if (!open) {
    return (
      <div className="mx-auto mb-8 w-full max-w-xl">
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            requestAnimationFrame(() => bodyRef.current?.focus());
          }}
          className="card flex w-full items-center justify-between px-4 py-3 text-left transition-shadow hover:shadow-raised"
        >
          <span className="text-[15px] font-medium text-faint">Take a note…</span>
          <span className="flex items-center gap-1 text-muted">
            <CheckboxIcon width={18} height={18} />
          </span>
        </button>
      </div>
    );
  }

  return (
    <div
      ref={boxRef}
      className="mx-auto mb-8 w-full max-w-xl animate-fade-in rounded-lg border p-4 shadow-raised"
      style={colorStyle(draft.color)}
    >
      <div className="flex items-start gap-2">
        <input
          ref={titleRef}
          value={draft.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="Title"
          className="w-full bg-transparent text-base font-medium outline-none placeholder:opacity-40"
        />
        <button
          type="button"
          className="icon-btn"
          title={draft.pinned ? 'Unpin' : 'Pin'}
          onClick={() => set({ pinned: !draft.pinned })}
        >
          <PinIcon filled={draft.pinned} width={18} height={18} />
        </button>
      </div>

      {draft.type === 'checklist' ? (
        <div className="mt-2">
          <ChecklistEditor items={draft.items} onChange={(items) => set({ items })} />
        </div>
      ) : (
        <textarea
          ref={bodyRef}
          value={draft.body}
          onChange={(e) => set({ body: e.target.value })}
          placeholder="Take a note…  **markdown** works"
          rows={3}
          className="mt-2 w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:opacity-40"
        />
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1">
        {draft.remindAt && (
          <span className="chip"><ClockIcon width={11} height={11} /> {formatReminder(draft.remindAt)}</span>
        )}
        {labels.filter((l) => draft.labels.includes(l.id)).map((l) => (
          <span key={l.id} className="chip">{l.name}</span>
        ))}
      </div>

      {error && <p className="mt-2 text-xs text-red-700 dark:text-red-300">{error}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-1">
        <div className="relative">
          <button type="button" className="icon-btn" title="Change colour" onClick={() => setPaletteOpen((o) => !o)}>
            <PaletteIcon width={18} height={18} />
          </button>
          <ColorMenu
            open={paletteOpen}
            onClose={() => setPaletteOpen(false)}
            value={draft.color}
            onPick={(color) => set({ color })}
          />
        </div>

        <div className="relative">
          <button type="button" className="icon-btn" title="Labels" onClick={() => setLabelsOpen((o) => !o)}>
            <LabelIcon width={18} height={18} />
          </button>
          <LabelMenu
            open={labelsOpen}
            onClose={() => setLabelsOpen(false)}
            labels={labels}
            selectedIds={draft.labels}
            onToggle={(id) =>
              set({
                labels: draft.labels.includes(id)
                  ? draft.labels.filter((l) => l !== id)
                  : [...draft.labels, id],
              })
            }
            onCreate={async (name) => {
              const label = await onCreateLabel(name);
              setDraft((d) => ({ ...d, labels: [...d.labels, label.id] }));
            }}
          />
        </div>

        <div className="relative">
          <button type="button" className="icon-btn" title="Remind me" onClick={() => setReminderOpen((o) => !o)}>
            <ClockIcon width={18} height={18} />
          </button>
          <ReminderMenu
            open={reminderOpen}
            onClose={() => setReminderOpen(false)}
            value={draft.remindAt}
            onPick={(remindAt) => set({ remindAt })}
          />
        </div>

        <button
          type="button"
          className="icon-btn"
          title={draft.type === 'checklist' ? 'Switch to a note' : 'Switch to a checklist'}
          onClick={() => set({ type: draft.type === 'checklist' ? 'note' : 'checklist' })}
        >
          {draft.type === 'checklist' ? <NoteIcon width={18} height={18} /> : <CheckboxIcon width={18} height={18} />}
        </button>

        <button
          type="button"
          className="icon-btn"
          title="Save straight to the archive"
          onClick={async () => {
            if (!isEmpty) await onCreate({ ...draft, archived: true });
            setDraft(EMPTY);
            setOpen(false);
          }}
        >
          <ArchiveIcon width={18} height={18} />
        </button>

        <button
          type="button"
          onClick={close}
          className="ml-auto rounded px-4 py-1.5 text-sm font-medium hover:bg-black/10"
        >
          Close
        </button>
      </div>
    </div>
  );
});

export default Composer;
