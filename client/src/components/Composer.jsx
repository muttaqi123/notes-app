import { useEffect, useRef, useState } from 'react';
import { colorOf } from '../lib/colors.js';
import { ColorMenu, LabelMenu } from './Menus.jsx';
import ChecklistEditor from './ChecklistEditor.jsx';
import { CheckboxIcon, NoteIcon, PaletteIcon, LabelIcon, ArchiveIcon, PinIcon } from './Icons.jsx';

const EMPTY = {
  title: '', body: '', type: 'note', items: [{ text: '', checked: false }],
  color: 'default', pinned: false, labels: [],
};

/**
 * The "Take a note…" box. Collapsed it is a single line; clicking expands it,
 * and clicking away saves and collapses — the note is never lost to a missing
 * Save button, and an untouched box saves nothing at all.
 */
export default function Composer({ labels, onCreate, onCreateLabel }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [error, setError] = useState(null);
  const boxRef = useRef(null);
  const bodyRef = useRef(null);

  const isEmpty =
    !draft.title.trim() &&
    !draft.body.trim() &&
    !draft.items.some((i) => i.text.trim());

  const close = async () => {
    setPaletteOpen(false);
    setLabelsOpen(false);
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

  const c = colorOf(draft.color);

  if (!open) {
    return (
      <div className="mx-auto mb-8 w-full max-w-xl">
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            requestAnimationFrame(() => bodyRef.current?.focus());
          }}
          className="flex w-full items-center justify-between rounded-lg border border-black/10 bg-white px-4 py-3 text-left shadow-card"
        >
          <span className="text-[15px] font-medium text-[#80868b]">Take a note…</span>
          <span className="flex items-center gap-1 text-[#5f6368]">
            <CheckboxIcon width={18} height={18} />
          </span>
        </button>
      </div>
    );
  }

  return (
    <div
      ref={boxRef}
      className="mx-auto mb-8 w-full max-w-xl rounded-lg border p-4 shadow-raised"
      style={{ background: c.bg, borderColor: c.border }}
    >
      <div className="flex items-start gap-2">
        <input
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          placeholder="Title"
          className="w-full bg-transparent text-base font-medium outline-none placeholder:text-black/40"
        />
        <button
          type="button"
          className="icon-btn"
          title={draft.pinned ? 'Unpin' : 'Pin'}
          onClick={() => setDraft({ ...draft, pinned: !draft.pinned })}
        >
          <PinIcon filled={draft.pinned} width={18} height={18} />
        </button>
      </div>

      {draft.type === 'checklist' ? (
        <div className="mt-2">
          <ChecklistEditor items={draft.items} onChange={(items) => setDraft({ ...draft, items })} />
        </div>
      ) : (
        <textarea
          ref={bodyRef}
          value={draft.body}
          onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          placeholder="Take a note…  **markdown** works"
          rows={3}
          className="mt-2 w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-black/40"
        />
      )}

      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-1">
        <div className="relative">
          <button type="button" className="icon-btn" title="Change colour" onClick={() => setPaletteOpen((o) => !o)}>
            <PaletteIcon width={18} height={18} />
          </button>
          <ColorMenu
            open={paletteOpen}
            onClose={() => setPaletteOpen(false)}
            value={draft.color}
            onPick={(color) => setDraft({ ...draft, color })}
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
              setDraft({
                ...draft,
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

        <button
          type="button"
          className="icon-btn"
          title={draft.type === 'checklist' ? 'Switch to a note' : 'Switch to a checklist'}
          onClick={() =>
            setDraft({ ...draft, type: draft.type === 'checklist' ? 'note' : 'checklist' })
          }
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
          className="ml-auto rounded px-4 py-1.5 text-sm font-medium text-[#3c4043] hover:bg-black/10"
        >
          Close
        </button>
      </div>

      {draft.labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {labels
            .filter((l) => draft.labels.includes(l.id))
            .map((l) => (
              <span key={l.id} className="chip">{l.name}</span>
            ))}
        </div>
      )}
    </div>
  );
}
