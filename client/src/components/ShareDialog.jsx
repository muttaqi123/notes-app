import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import Modal from './Modal.jsx';
import Avatar from './Avatar.jsx';
import { CloseIcon, UsersIcon } from './Icons.jsx';

/**
 * Who can see a note, and what they can do with it.
 *
 * The owner is shown but not editable — there is no way to hand a note over,
 * and pretending otherwise with a disabled dropdown would be worse than
 * showing plainly that the owner is the owner.
 */
export default function ShareDialog({ open, note, onClose, onChanged }) {
  const [state, setState] = useState({ owner: null, collaborators: [], myRole: null });
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !note) return;
    setLoading(true);
    setError(null);
    api.collaborators(note.id)
      .then(setState)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [open, note]);

  const isOwner = state.myRole === 'owner';

  const submit = async (e) => {
    e.preventDefault();
    const address = email.trim();
    if (!address || busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await api.share(note.id, { email: address, role });
      setState(next);
      setEmail('');
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const change = async (userId, nextRole) => {
    try {
      setState(await api.setRole(note.id, userId, nextRole));
      onChanged?.();
    } catch (err) {
      setError(err.message);
    }
  };

  const revoke = async (userId) => {
    try {
      setState(await api.revokeShare(note.id, userId));
      onChanged?.();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Modal open={open} onClose={onClose} label="Share this note" width="max-w-md">
      <div className="p-5">
        <div className="mb-1 flex items-center gap-2">
          <UsersIcon width={18} height={18} className="text-muted" />
          <h2 className="text-base font-medium">Share</h2>
          <button type="button" className="icon-btn ml-auto" aria-label="Close" onClick={onClose}>
            <CloseIcon width={18} height={18} />
          </button>
        </div>
        <p className="mb-4 truncate text-xs text-muted">{note?.title || 'Untitled note'}</p>

        {isOwner && (
          <form onSubmit={submit} className="mb-4 flex gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Their email address"
              className="field flex-1"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              aria-label="Their role"
              className="field w-28 shrink-0"
            >
              <option value="viewer">Can view</option>
              <option value="editor">Can edit</option>
            </select>
            <button type="submit" disabled={busy} className="btn-primary shrink-0">
              {busy ? '…' : 'Share'}
            </button>
          </form>
        )}

        {error && (
          <p role="alert" className="mb-3 rounded bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        {loading ? (
          <div className="space-y-2">
            <div className="skeleton h-10" />
            <div className="skeleton h-10" />
          </div>
        ) : (
          <ul className="space-y-1">
            {state.owner && (
              <li className="flex items-center gap-3 rounded-lg px-2 py-2">
                <Avatar user={state.owner} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{state.owner.name}</span>
                  <span className="block truncate text-xs text-muted">{state.owner.email}</span>
                </span>
                <span className="shrink-0 text-xs text-muted">Owner</span>
              </li>
            )}

            {state.collaborators.map((c) => (
              <li key={c.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-subtle">
                <Avatar user={c} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{c.name}</span>
                  <span className="block truncate text-xs text-muted">{c.email}</span>
                </span>
                {isOwner ? (
                  <>
                    <select
                      value={c.role}
                      onChange={(e) => change(c.id, e.target.value)}
                      aria-label={`Role for ${c.name}`}
                      className="shrink-0 rounded border border-line bg-surface px-1.5 py-1 text-xs text-ink"
                    >
                      <option value="viewer">Can view</option>
                      <option value="editor">Can edit</option>
                    </select>
                    <button
                      type="button"
                      className="icon-btn h-7 w-7"
                      aria-label={`Remove ${c.name}`}
                      title="Remove access"
                      onClick={() => revoke(c.id)}
                    >
                      <CloseIcon width={14} height={14} />
                    </button>
                  </>
                ) : (
                  <span className="shrink-0 text-xs text-muted">
                    {c.role === 'editor' ? 'Can edit' : 'Can view'}
                  </span>
                )}
              </li>
            ))}

            {state.collaborators.length === 0 && (
              <li className="px-2 py-4 text-center text-sm text-muted">
                {isOwner ? 'Not shared with anyone yet.' : 'Nobody else has this note.'}
              </li>
            )}
          </ul>
        )}

        {!isOwner && !loading && (
          <p className="mt-4 text-xs text-faint">
            Only the note’s owner can change who it is shared with.
          </p>
        )}
      </div>
    </Modal>
  );
}
