import { useState } from 'react';
import { colorStyle } from '../lib/colors.js';
import { renderMarkdown } from '../lib/markdown.js';
import { assetUrl } from '../api/client.js';
import { ColorMenu } from './Menus.jsx';
import { AvatarStack } from './Avatar.jsx';
import { formatReminder } from './ReminderMenu.jsx';
import {
  PinIcon, ArchiveIcon, UnarchiveIcon, TrashIcon, RestoreIcon, PaletteIcon,
  HistoryIcon, ShareIcon, ClockIcon, UsersIcon,
} from './Icons.jsx';

function ChecklistPreview({ items, onToggle, readOnly }) {
  const todo = items.filter((i) => !i.checked);
  const done = items.filter((i) => i.checked);
  const shown = [...todo.slice(0, 8), ...done.slice(0, 3)];

  return (
    <ul className="mt-1 space-y-1 text-sm">
      {shown.map((item) => (
        <li key={item.id} className="flex items-start gap-2">
          <button
            type="button"
            disabled={readOnly}
            aria-label={item.checked ? `Mark "${item.text}" not done` : `Mark "${item.text}" done`}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(item);
            }}
            className={`mt-[3px] grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[3px]
                        border text-[9px] leading-none transition-colors
                        ${readOnly ? 'cursor-default' : ''}`}
            style={
              item.checked
                // Not `bg-current` with `text-transparent`: they fight, because
                // `currentColor` is the very property being set to transparent,
                // so the fill resolves to nothing and the box renders empty.
                // The tick and the box are both stated outright instead.
                ? { background: 'currentColor', borderColor: 'currentColor' }
                : { borderColor: 'color-mix(in srgb, currentColor 45%, transparent)' }
            }
          >
            {item.checked && (
              <svg viewBox="0 0 12 12" width={9} height={9} aria-hidden="true">
                <path
                  d="M2 6.2 4.6 8.8 10 3.4"
                  fill="none"
                  stroke="var(--note-default)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
          <span className={item.checked ? 'opacity-50 line-through' : ''}>{item.text}</span>
        </li>
      ))}
      {items.length > shown.length && (
        <li className="pl-5 text-xs opacity-60">+ {items.length - shown.length} more</li>
      )}
    </ul>
  );
}

/**
 * One note.
 *
 * The whole card opens the editor, but the action row does not — hence
 * stopPropagation on every button. Actions stay visible on touch, where there
 * is no hover to reveal them, and fade in on a pointer device.
 */
export default function NoteCard({
  note, view, actions, onOpen, onHistory, onShare, currentUserId, dragHandle,
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const inTrash = view === 'trash';
  const isOwner = !note.owner?.id || note.owner.id === currentUserId;
  const isShared = Boolean(note.owner?.id) && !isOwner;

  const stop = (fn) => (e) => {
    e.stopPropagation();
    fn();
  };

  const toggleItem = (item) => {
    actions.update(note.id, {
      items: note.items.map((i) => (i.id === item.id ? { ...i, checked: !i.checked } : i)),
    });
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
      className="group relative w-full cursor-default rounded-lg border p-4 text-left shadow-sm transition-shadow hover:shadow-raised focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      style={colorStyle(note.color)}
    >
      <div className="absolute right-2 top-2 flex items-center gap-1">
        {dragHandle}
        {!inTrash && (
          <button
            type="button"
            aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
            onClick={stop(() => actions.togglePin(note))}
            className={`icon-btn ${
              note.pinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
            }`}
          >
            <PinIcon filled={note.pinned} width={18} height={18} />
          </button>
        )}
      </div>

      {note.attachments?.length > 0 && (
        <div className={`mb-2 grid gap-1 ${note.attachments.length > 1 ? 'grid-cols-2' : ''}`}>
          {note.attachments.slice(0, 4).map((a) => (
            <img
              key={a.id}
              src={assetUrl(a.url)}
              alt={a.filename}
              loading="lazy"
              // The intrinsic size is known, so the space is reserved before
              // the image lands and the card does not jump as it loads.
              width={a.width}
              height={a.height}
              className="w-full rounded object-cover"
              style={{ maxHeight: note.attachments.length > 1 ? 96 : 200 }}
            />
          ))}
        </div>
      )}

      {note.title && (
        <h3 className="pr-14 text-base font-medium leading-snug break-words">{note.title}</h3>
      )}

      {note.type === 'checklist' ? (
        <ChecklistPreview items={note.items} onToggle={toggleItem} readOnly={inTrash} />
      ) : (
        note.body && (
          // The body is markdown, rendered through DOMPurify in renderMarkdown.
          // This is the only place the app sets HTML, and it never receives
          // anything the sanitiser has not been through.
          <div
            className="md mt-1 max-h-72 overflow-hidden"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(note.body) }}
          />
        )
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1">
        {note.remindAt && (
          <span
            className={`chip ${note.reminderSent ? 'opacity-50' : ''}`}
            title={note.reminderSent ? 'This reminder has been sent' : 'Reminder'}
          >
            <ClockIcon width={11} height={11} />
            {formatReminder(note.remindAt)}
          </span>
        )}
        {note.labels.map((label) => (
          <span key={label.id} className="chip">{label.name}</span>
        ))}
        {isShared && (
          <span className="chip" title={`Shared by ${note.owner.name}`}>
            <UsersIcon width={11} height={11} />
            {note.owner.name}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center gap-1">
        {note.version > 1 && !inTrash && (
          <span className="text-[11px] opacity-45">v{note.version}</span>
        )}
        {note.collaborators?.length > 0 && (
          <span className="ml-auto"><AvatarStack users={note.collaborators} size={20} /></span>
        )}
      </div>

      <div
        className="mt-1 flex flex-wrap items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
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

            {isOwner && (
              <button type="button" className="icon-btn" title="Share" onClick={stop(() => onShare(note))}>
                <ShareIcon width={18} height={18} />
              </button>
            )}

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
              title={note.version < 2 ? 'No history yet' : 'Version history'}
              disabled={note.version < 2}
              onClick={stop(() => onHistory(note))}
            >
              <HistoryIcon width={18} height={18} />
            </button>

            {isOwner ? (
              <button type="button" className="icon-btn" title="Move to trash" onClick={stop(() => actions.trash(note))}>
                <TrashIcon width={18} height={18} />
              </button>
            ) : (
              <button
                type="button"
                className="icon-btn"
                title="Leave this note"
                onClick={stop(() => actions.leave(note))}
              >
                <CloseLike />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Leaving a shared note is not deletion, so it must not wear a bin icon. */
function CloseLike() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M14 16l4-4-4-4M18 12H8" />
    </svg>
  );
}
