import { useState } from 'react';
import { CloseIcon, TrashIcon, PlusIcon, LabelIcon } from './Icons.jsx';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll.js';

/** Rename and delete labels. Deleting one detaches it from its notes on the
 *  server rather than deleting them, and the copy here says so, because a
 *  destructive-looking button needs to say what it actually destroys. */
export default function LabelManager({ labels, actions, onClose }) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState(null);

  useLockBodyScroll();

  const add = async (e) => {
    e.preventDefault();
    const name = draft.trim();
    if (!name) return;
    try {
      await actions.createLabel(name);
      setDraft('');
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 grid place-items-start justify-center bg-black/50 p-4 pt-24"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div role="dialog" aria-modal="true" aria-label="Edit labels" className="w-full max-w-sm rounded-lg bg-white p-4 shadow-raised">
        <div className="flex items-center">
          <h2 className="text-sm font-medium">Edit labels</h2>
          <button type="button" className="icon-btn ml-auto" aria-label="Close" onClick={onClose}>
            <CloseIcon width={18} height={18} />
          </button>
        </div>

        <form onSubmit={add} className="mt-3 flex items-center gap-2 border-b border-black/10 pb-2">
          <PlusIcon width={18} height={18} className="text-[#5f6368]" />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Create new label"
            className="w-full bg-transparent text-sm outline-none"
          />
        </form>

        {error && <p className="mt-2 text-xs text-red-700">{error}</p>}

        <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto">
          {labels.map((label) => (
            <li key={label.id} className="group flex items-center gap-2 rounded px-1 py-1 hover:bg-black/5">
              <LabelIcon width={16} height={16} className="shrink-0 text-[#5f6368]" />
              <input
                defaultValue={label.name}
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (name && name !== label.name) {
                    actions.renameLabel(label.id, name).catch((err) => setError(err.message));
                  } else {
                    e.target.value = label.name;
                  }
                }}
                className="w-full bg-transparent text-sm outline-none focus:border-b focus:border-black/30"
              />
              <button
                type="button"
                aria-label={`Delete label ${label.name}`}
                title="Delete label (the notes stay)"
                onClick={() => actions.deleteLabel(label.id).catch((err) => setError(err.message))}
                className="icon-btn h-7 w-7 opacity-0 transition group-hover:opacity-100 focus:opacity-100"
              >
                <TrashIcon width={15} height={15} />
              </button>
            </li>
          ))}
        </ul>

        <p className="mt-3 text-[11px] text-[#5f6368]">
          Deleting a label removes the tag. The notes under it stay where they are.
        </p>
      </div>
    </div>
  );
}
