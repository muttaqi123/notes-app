import { useState } from 'react';
import { colorOf } from '../lib/colors.js';
import { renderMarkdown } from '../lib/markdown.js';
import { ColorMenu } from './Menus.jsx';
import {
  PinIcon, ArchiveIcon, UnarchiveIcon, TrashIcon, RestoreIcon, PaletteIcon, HistoryIcon,
} from './Icons.jsx';

function ChecklistPreview({ items }) {
  const done = items.filter((i) => i.checked);
  const todo = items.filter((i) => !i.checked);
  const shown = [...todo.slice(0, 8), ...done.slice(0, 3)];

  return (
    <ul className="mt-1 space-y-1 text-sm">
      {shown.map((item, i) => (
        <li key={i} className="flex items-start gap-2">
          <span
            className={`mt-[3px] grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[3px] border text-[9px] leading-none ${
              item.checked ? 'border-black/40 bg-black/40 text-white' : 'border-black/30'
            }`}
          >
            {item.checked ? '✓' : ''}
          </span>
          <span className={item.checked ? 'text-black/45 line-through' : ''}>{item.text}</span>
        </li>
      ))}
      {items.length > shown.length && (
        <li className="pl-5 text-xs text-black/50">+ {items.length - shown.length} more</li>
      )}
    </ul>
  );
}

/**
 * One note. The whole card opens the editor, but the action row does not —
 * hence stopPropagation on every button. Actions stay visible on touch (where
 * there is no hover) and fade in on a pointer device, which is what Keep does.
 */
export default function NoteCard({ note, view, actions, onOpen, onHistory }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const c = colorOf(note.color);
  const inTrash = view === 'trash';

  const stop = (fn) => (e) => {
    e.stopPropagation();
    fn();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !inTrash && onOpen(note)}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !inTrash) {
          e.preventDefault();
          onOpen(note);
        }
      }}
      className="group relative w-full cursor-default rounded-lg border p-4 text-left shadow-sm transition hover:shadow-raised focus:outline-none focus-visible:ring-2 focus-visible:ring-black/40"
      style={{ background: c.bg, borderColor: c.border }}
    >
      {!inTrash && (
        <button
          type="button"
          aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
          onClick={stop(() => actions.togglePin(note))}
          className={`icon-btn absolute right-2 top-2 ${
            note.pinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
          }`}
        >
          <PinIcon filled={note.pinned} width={18} height={18} />
        </button>
      )}

      {note.title && (
        <h3 className="pr-8 text-base font-medium leading-snug break-words">{note.title}</h3>
      )}

      {note.type === 'checklist' ? (
        <ChecklistPreview items={note.items} />
      ) : (
        note.body && (
          // The note body is markdown, rendered through DOMPurify in
          // renderMarkdown — this is the only place the app sets HTML, and it
          // never receives anything the sanitiser has not been through.
          <div
            className="md mt-1 max-h-72 overflow-hidden"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(note.body) }}
          />
        )
      )}

      {note.labels.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {note.labels.map((label) => (
            <span key={label.id} className="chip">{label.name}</span>
          ))}
        </div>
      )}

      {note.version > 1 && !inTrash && (
        <p className="mt-2 text-[11px] text-black/40">v{note.version}</p>
      )}

      <div
        className="mt-2 flex flex-wrap items-center gap-0.5 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        {inTrash ? (
          <>
            <button type="button" className="icon-btn" title="Restore" onClick={stop(() => actions.restore(note))}>
              <RestoreIcon width={18} height={18} />
            </button>
            <button type="button" className="icon-btn" title="Delete forever" onClick={stop(() => actions.deleteForever(note))}>
              <TrashIcon width={18} height={18} />
            </button>
          </>
        ) : (
          <>
            <div className="relative">
              <button type="button" className="icon-btn" title="Change colour" onClick={stop(() => setPaletteOpen((o) => !o))}>
                <PaletteIcon width={18} height={18} />
              </button>
              <ColorMenu
                open={paletteOpen}
                onClose={() => setPaletteOpen(false)}
                value={note.color}
                onPick={(color) => actions.update(note.id, { color })}
              />
            </div>
            <button
              type="button"
              className="icon-btn"
              title={note.archived ? 'Unarchive' : 'Archive'}
              onClick={stop(() => actions.toggleArchive(note))}
            >
              {note.archived ? <UnarchiveIcon width={18} height={18} /> : <ArchiveIcon width={18} height={18} />}
            </button>
            <button
              type="button"
              className="icon-btn"
              title="Version history"
              disabled={note.version < 2}
              onClick={stop(() => onHistory(note))}
            >
              <HistoryIcon width={18} height={18} className={note.version < 2 ? 'opacity-30' : ''} />
            </button>
            <button type="button" className="icon-btn" title="Move to trash" onClick={stop(() => actions.trash(note))}>
              <TrashIcon width={18} height={18} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
