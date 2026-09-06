import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import Avatar from './Avatar.jsx';
import { CloseIcon } from './Icons.jsx';

/**
 * Who changed this note, and when.
 *
 * The version history answers "what did it say"; this answers "who did that".
 * Once a note has more than one person on it those are different questions,
 * and only one of them is answerable from snapshots.
 */
const SENTENCES = {
  created: () => 'created this note',
  edited: () => 'edited it',
  restored_version: (m) => `restored version ${m.version}`,
  pinned: () => 'pinned it',
  unpinned: () => 'unpinned it',
  archived: () => 'archived it',
  unarchived: () => 'took it out of the archive',
  trashed: () => 'moved it to the trash',
  untrashed: () => 'restored it from the trash',
  shared: (m) => `shared it with ${m.email} as ${m.role === 'editor' ? 'an editor' : 'a viewer'}`,
  unshared: () => 'removed someone’s access',
  role_changed: (m) => `changed a role to ${m.role || 'something else'}`,
  attached: (m) => `attached ${m.filename || 'an image'}`,
  detached: (m) => `removed ${m.filename || 'an image'}`,
  reminder_set: () => 'set a reminder',
  reminder_cleared: () => 'cleared the reminder',
};

function ago(iso) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export default function ActivityPanel({ note, onClose }) {
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.listActivity(note.id)
      .then((res) => !cancelled && setActivity(res.activity))
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [note.id]);

  return (
    <div className="flex max-h-[70vh] flex-col">
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <h2 className="text-sm font-medium">Activity</h2>
        <span className="truncate text-xs text-muted">{note.title || 'Untitled'}</span>
        <button type="button" className="icon-btn ml-auto" onClick={onClose} aria-label="Back to the note">
          <CloseIcon width={18} height={18} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {loading && (
          <div className="space-y-2">
            <div className="skeleton h-8" />
            <div className="skeleton h-8" />
          </div>
        )}

        <ol className="space-y-3">
          {activity.map((a) => (
            <li key={a.id} className="flex items-start gap-3 text-sm">
              <Avatar user={a.actor} size={26} />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{a.actor.name || 'Someone'}</span>{' '}
                <span className="opacity-75">{(SENTENCES[a.action] || (() => a.action))(a.meta)}</span>
                <span className="ml-2 whitespace-nowrap text-[11px] opacity-50">{ago(a.createdAt)}</span>
              </span>
            </li>
          ))}
        </ol>

        {!loading && activity.length === 0 && (
          <p className="py-8 text-center text-sm text-muted">Nothing has happened yet.</p>
        )}
      </div>
    </div>
  );
}
