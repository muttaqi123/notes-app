import { useEffect, useRef, useState } from 'react';
import { COLOR_KEYS, colorName, colorStyle } from '../lib/colors.js';
import { PlusIcon } from './Icons.jsx';

/**
 * A popover anchored to its trigger, closed by a click anywhere else or by
 * Escape. Keyboard dismissal matters: a menu you can only close with the mouse
 * is a trap for anyone not using one.
 */
export function Popover({ open, onClose, children, align = 'left', className = '' }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className={`absolute z-30 mt-1 overflow-hidden rounded-lg border border-line bg-raised p-2 text-ink shadow-raised ${
        align === 'right' ? 'right-0' : 'left-0'
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function ColorMenu({ open, onClose, value, onPick }) {
  return (
    <Popover open={open} onClose={onClose} className="w-[212px]">
      <div className="grid grid-cols-6 gap-1.5">
        {COLOR_KEYS.map((key) => {
          const selected = value === key;
          return (
            <button
              key={key}
              type="button"
              title={colorName(key)}
              aria-label={colorName(key)}
              aria-pressed={selected}
              onClick={() => {
                onPick(key);
                onClose();
              }}
              className={`h-7 w-7 rounded-full border transition hover:scale-110 ${
                selected ? 'ring-2 ring-accent ring-offset-2 ring-offset-raised' : ''
              }`}
              style={colorStyle(key)}
            />
          );
        })}
      </div>
    </Popover>
  );
}

export function LabelMenu({ open, onClose, labels, selectedIds, onToggle, onCreate }) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const name = draft.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await onCreate(name);
      setDraft('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover open={open} onClose={onClose} className="w-56">
      <p className="px-1 pb-1 text-xs font-medium text-muted">Label note</p>
      <div className="max-h-48 overflow-y-auto">
        {labels.length === 0 && (
          <p className="px-1 py-2 text-xs text-muted">No labels yet.</p>
        )}
        {labels.map((label) => (
          <label
            key={label.id}
            className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-subtle"
          >
            <input
              type="checkbox"
              className="accent-accent"
              checked={selectedIds.includes(label.id)}
              onChange={() => onToggle(label.id)}
            />
            <span className="truncate">{label.name}</span>
          </label>
        ))}
      </div>
      <form onSubmit={submit} className="mt-1 flex items-center gap-1 border-t border-line pt-2">
        <PlusIcon width={16} height={16} className="text-muted" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Create label"
          className="w-full bg-transparent text-sm outline-none placeholder:text-faint"
        />
      </form>
    </Popover>
  );
}
