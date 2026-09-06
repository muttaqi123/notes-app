import Modal from './Modal.jsx';
import { SHORTCUTS } from '../hooks/useHotkeys.js';

export default function ShortcutsDialog({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} label="Keyboard shortcuts" width="max-w-lg">
      <div className="p-5">
        <h2 className="mb-4 text-base font-medium">Keyboard shortcuts</h2>
        <ul className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
          {SHORTCUTS.map((s) => (
            <li key={s.label} className="flex items-center justify-between gap-4 text-sm">
              <span className="text-muted">{s.label}</span>
              <span className="flex shrink-0 gap-1">
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="min-w-[1.6rem] rounded border border-line bg-subtle px-1.5 py-0.5 text-center font-sans text-[11px] text-ink"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-5 text-xs text-faint">
          Single-letter shortcuts are ignored while you are typing in a field.
        </p>
      </div>
    </Modal>
  );
}
