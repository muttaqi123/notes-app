import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { useSocket } from './useSocket.js';

/**
 * Everything the board knows about notes.
 *
 * Four decisions worth defending:
 *
 * 1. **Search is client-side.** The API supports `?q=`, but filtering what is
 *    already in memory is instant, works offline, and fires no request per
 *    keystroke. The server search stays for when a user has more notes than
 *    one page holds.
 *
 * 2. **Writes are optimistic.** The card changes the moment you click and the
 *    server response replaces it when it lands. On failure the previous state
 *    is restored and the error surfaced — a pin that silently un-pins itself
 *    is worse than one that says why.
 *
 * 3. **Live updates merge rather than refetch.** A change from another device
 *    arrives as the note itself, so the board updates without a round trip and
 *    without losing the user's scroll position.
 *
 * 4. **The actor is checked before applying a live update.** Without that, the
 *    tab that made a change receives its own echo and overwrites the optimistic
 *    state it already applied — usually invisible, but it makes a fast typist's
 *    caret jump.
 */
export function useNotes({ view = 'active', labelId = null, sort = 'updated' } = {}) {
  const [notes, setNotes] = useState([]);
  const [labels, setLabels] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');

  // Guards against a slow response for a view the user has already left
  // overwriting the notes of the view they are now looking at.
  const requestId = useRef(0);

  // A synchronous mirror of `notes`.
  //
  // An optimistic update has to capture the state it is about to replace, so
  // that a failed request can put it back. Reading it inside a setState
  // updater does not work: React runs the updater during the render pass, not
  // at the call site, so by the time a rejected promise reaches its catch the
  // variable may never have been assigned — the rollback then silently does
  // nothing and the UI keeps a change the server refused.
  const notesRef = useRef(notes);
  const viewRef = useRef({ view, labelId });

  // Both refs are written after each commit rather than during render. Every
  // reader of them runs from an event handler or a socket callback, which is
  // always after a commit, so they are never stale where it matters.
  useEffect(() => {
    notesRef.current = notes;
    viewRef.current = { view, labelId };
  });

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const [notesRes, labelsRes] = await Promise.all([
        api.listNotes({ view, label: labelId || undefined, sort }),
        api.listLabels(),
      ]);
      if (id !== requestId.current) return;
      setNotes(notesRes.notes);
      setCursor(notesRes.nextCursor);
      setLabels(labelsRes.labels);
      setError(null);
    } catch (err) {
      if (id === requestId.current) setError(err.message);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [view, labelId, sort]);

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api.listNotes({ view, label: labelId || undefined, sort, cursor });
      // Deduplicated on merge: a note created while the reader was paging can
      // otherwise arrive on two pages.
      setNotes((current) => {
        const seen = new Set(current.map((n) => n.id));
        return [...current, ...res.notes.filter((n) => !seen.has(n.id))];
      });
      setCursor(res.nextCursor);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, view, labelId, sort]);

  /** Does this note belong in the view currently on screen? */
  const belongsHere = useCallback((note) => {
    const { view: v, labelId: l } = viewRef.current;
    if (l && !note.labels.some((label) => label.id === l)) return false;
    if (v === 'trash') return note.trashed;
    if (note.trashed) return false;
    if (v === 'archive') return note.archived;
    if (v === 'reminders') return Boolean(note.remindAt);
    if (v === 'shared') return true;
    return !note.archived;
  }, []);

  const mergeNote = useCallback((note) => {
    setNotes((current) => {
      const exists = current.some((n) => n.id === note.id);
      if (!belongsHere(note)) return exists ? current.filter((n) => n.id !== note.id) : current;
      if (exists) return current.map((n) => (n.id === note.id ? note : n));
      return [note, ...current];
    });
  }, [belongsHere]);

  const removeNote = useCallback((noteId) => {
    setNotes((current) => current.filter((n) => n.id !== noteId));
  }, []);

  const socket = useSocket({
    handlers: {
      'note:changed': ({ note }) => mergeNote(note),
      'note:removed': ({ noteId }) => removeNote(noteId),
    },
  });

  /** Apply a change locally at once, then reconcile with the server. */
  const optimistic = useCallback(async (id, patch, call) => {
    const previous = notesRef.current;
    setNotes(previous.map((n) => (n.id === id ? { ...n, ...patch } : n)));
    try {
      const { note } = await call();
      setNotes((current) => current.map((n) => (n.id === id ? note : n)));
      return note;
    } catch (err) {
      setNotes(previous);
      setError(err.message);
      throw err;
    }
  }, []);

  /** Remove the card immediately, and put it back if the server disagrees. */
  const withdraw = useCallback(async (note, call) => {
    const previous = notesRef.current;
    setNotes(previous.filter((n) => n.id !== note.id));
    try {
      return await call();
    } catch (err) {
      setNotes(previous);
      setError(err.message);
      throw err;
    }
  }, []);

  const actions = useMemo(
    () => ({
      reload: load,
      loadMore,
      hasMore: Boolean(cursor),

      async create(input) {
        const { note } = await api.createNote(input);
        if (belongsHere(note)) setNotes((current) => [note, ...current]);
        return note;
      },

      update: (id, patch) => optimistic(id, patch, () => api.updateNote(id, patch)),

      togglePin: (note) =>
        optimistic(note.id, { pinned: !note.pinned }, () =>
          api.updateNote(note.id, { pinned: !note.pinned })
        ),

      toggleArchive: (note) =>
        withdraw(note, () => api.updateNote(note.id, { archived: !note.archived })),

      trash: (note) => withdraw(note, () => api.trashNote(note.id)),
      restore: (note) => withdraw(note, () => api.restoreNote(note.id)),
      deleteForever: (note) => withdraw(note, () => api.deleteNote(note.id)),
      leave: (note) => withdraw(note, () => api.leaveNote(note.id)),

      async emptyTrash() {
        const previous = notesRef.current;
        setNotes([]);
        try {
          await api.emptyTrash();
        } catch (err) {
          setNotes(previous);
          setError(err.message);
        }
      },

      /** Persist a drag. One request for the whole board, and the local order
       *  is applied first so the card does not snap back while it saves. */
      async reorder(ordered) {
        const previous = notesRef.current;
        setNotes(ordered);
        try {
          await api.reorderNotes(ordered.map((n, index) => ({ id: n.id, order: index })));
        } catch (err) {
          setNotes(previous);
          setError(err.message);
        }
      },

      async createLabel(name) {
        const { label } = await api.createLabel({ name });
        setLabels((current) => [...current, label].sort((a, b) => a.name.localeCompare(b.name)));
        return label;
      },

      async renameLabel(id, name) {
        const { label } = await api.updateLabel(id, { name });
        setLabels((current) =>
          current.map((l) => (l.id === id ? label : l)).sort((a, b) => a.name.localeCompare(b.name))
        );
        // Notes carry a copy of the label, so they need the new name too.
        setNotes((current) =>
          current.map((n) => ({ ...n, labels: n.labels.map((l) => (l.id === id ? label : l)) }))
        );
      },

      async deleteLabel(id) {
        await api.deleteLabel(id);
        setLabels((current) => current.filter((l) => l.id !== id));
        setNotes((current) =>
          current.map((n) => ({ ...n, labels: n.labels.filter((l) => l.id !== id) }))
        );
      },

      mergeNote,
      dismissError: () => setError(null),
    }),
    [load, loadMore, cursor, optimistic, withdraw, belongsHere, mergeNote]
  );

  // Instant search, over the notes already in memory.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((n) =>
      [n.title, n.body, ...(n.items || []).map((i) => i.text), ...(n.labels || []).map((l) => l.name)]
        .join('\n')
        .toLowerCase()
        .includes(q)
    );
  }, [notes, query]);

  const pinned = useMemo(() => visible.filter((n) => n.pinned && !n.trashed), [visible]);
  const others = useMemo(() => visible.filter((n) => !n.pinned || n.trashed), [visible]);

  return {
    notes: visible, allNotes: notes, pinned, others, labels,
    loading, loadingMore, error, query, setQuery, actions,
    connected: socket.connected, socket,
  };
}
