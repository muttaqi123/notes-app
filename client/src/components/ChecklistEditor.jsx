import { useRef } from 'react';
import { CloseIcon, PlusIcon } from './Icons.jsx';

/**
 * The checklist editor. Enter adds the next item and focuses it, Backspace on
 * an empty item removes it and focuses the one above — the two keystrokes that
 * make a list feel like a list rather than a form.
 */
export default function ChecklistEditor({ items, onChange }) {
  const refs = useRef([]);

  const setItem = (index, patch) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  const insertAfter = (index) => {
    const next = [...items];
    next.splice(index + 1, 0, { text: '', checked: false });
    onChange(next);
    // The new input does not exist until React has rendered it.
    requestAnimationFrame(() => refs.current[index + 1]?.focus());
  };

  const removeAt = (index) => {
    onChange(items.filter((_, i) => i !== index));
    requestAnimationFrame(() => {
      const target = refs.current[Math.max(0, index - 1)];
      if (target) {
        target.focus();
        target.setSelectionRange(target.value.length, target.value.length);
      }
    });
  };

  return (
    <div className="space-y-1">
      {items.map((item, index) => (
        <div key={index} className="group flex items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[#5f6368]"
            checked={item.checked}
            onChange={(e) => setItem(index, { checked: e.target.checked })}
            aria-label={`Mark "${item.text || 'item'}" done`}
          />
          <input
            ref={(el) => {
              refs.current[index] = el;
            }}
            value={item.text}
            onChange={(e) => setItem(index, { text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                insertAfter(index);
              }
              if (e.key === 'Backspace' && item.text === '' && items.length > 1) {
                e.preventDefault();
                removeAt(index);
              }
            }}
            placeholder="List item"
            className={`w-full bg-transparent text-sm outline-none placeholder:text-black/35 ${
              item.checked ? 'text-black/45 line-through' : ''
            }`}
          />
          <button
            type="button"
            aria-label="Remove item"
            onClick={() => removeAt(index)}
            className="icon-btn h-6 w-6 opacity-0 transition group-hover:opacity-100 focus:opacity-100"
          >
            <CloseIcon width={14} height={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => insertAfter(items.length - 1)}
        className="mt-1 flex items-center gap-2 text-sm text-black/55 hover:text-black"
      >
        <PlusIcon width={16} height={16} /> List item
      </button>
    </div>
  );
}
