import { useState } from 'react';
import { Popover } from './Menus.jsx';
import { ClockIcon } from './Icons.jsx';

/**
 * When to be reminded.
 *
 * The presets are the ones people actually pick, phrased the way they would
 * say them. "Later today" is 18:00 and "Tomorrow" is 08:00 — real times, not
 * offsets from now, because "in 8 hours" at 11pm means something nobody wants.
 */
function at(dayOffset, hour) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function nextMonday() {
  const d = new Date();
  const daysAhead = (8 - d.getDay()) % 7 || 7;
  d.setDate(d.getDate() + daysAhead);
  d.setHours(8, 0, 0, 0);
  return d;
}

/** The format <input type="datetime-local"> wants: local time, no zone. */
function toLocalInput(date) {
  const d = new Date(date);
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
}

export function formatReminder(iso) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `Today, ${time}`;

  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow, ${time}`;

  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`;
}

export default function ReminderMenu({ open, onClose, value, onPick }) {
  const [custom, setCustom] = useState(value ? toLocalInput(value) : '');

  const presets = [
    { label: 'Later today', hint: '18:00', when: () => at(0, 18) },
    { label: 'Tomorrow', hint: '08:00', when: () => at(1, 8) },
    { label: 'Next week', hint: 'Mon 08:00', when: nextMonday },
  ];

  return (
    <Popover open={open} onClose={onClose} className="w-64">
      <p className="px-1 pb-1 text-xs font-medium text-muted">Remind me</p>

      {presets.map((p) => (
        <button
          key={p.label}
          type="button"
          onClick={() => {
            onPick(p.when().toISOString());
            onClose();
          }}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-subtle"
        >
          <ClockIcon width={15} height={15} className="text-muted" />
          <span>{p.label}</span>
          <span className="ml-auto text-xs text-faint">{p.hint}</span>
        </button>
      ))}

      <div className="mt-2 border-t border-line pt-2">
        <label className="block px-1 pb-1 text-[11px] text-muted" htmlFor="reminder-custom">
          Pick a date and time
        </label>
        <input
          id="reminder-custom"
          type="datetime-local"
          value={custom}
          // A reminder in the past would fire the moment it is saved.
          min={toLocalInput(new Date())}
          onChange={(e) => setCustom(e.target.value)}
          className="field text-xs"
        />
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={!custom}
            onClick={() => {
              onPick(new Date(custom).toISOString());
              onClose();
            }}
            className="btn-primary flex-1 py-1.5 text-xs"
          >
            Save
          </button>
          {value && (
            <button
              type="button"
              onClick={() => {
                onPick(null);
                onClose();
              }}
              className="btn-ghost py-1.5 text-xs"
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </Popover>
  );
}
