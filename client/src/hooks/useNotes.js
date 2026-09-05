import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client.js';

/**
 * Everything the notes screen knows about notes.
 *
 * Two decisions worth defending in an interview:
 *
 * 1. Search is client-side. The API supports `?q=`, but filtering the notes
 *    already in memory is instant, works while offline, and does not fire a
 *    request per keystroke. The server-side search stays for the day a user
 *    has more notes than one page can hold.
 *
 * 2. Writes are optimistic. The card updates the moment you click, and the
 *    server response replaces it when it lands. On failure the previous state
 *    is put back and the error is surfaced — a pin that silently un-pins
 *    itself is worse than one that says why.
 */
export function useNotes({ view = 'active', labelId = null } = {}) {
  const [notes, setNotes] = useState([]);
  const [labels, setLabels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');

  // Guards against a slow response for a view the user has already left
  // overwriting the notes of the view they are now looking at.
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const [{ notes: fetched }, { labels: fetchedLabels }] = await Promise.all([
        api.listNotes({ view, label: labelId || undefined }),
        api.listLabels(),
      ]);
      if (id !== requestId.current) return;
      setNotes(fetched);
      setLabels(fetchedLabels);
      setError(null);
    } catch (err) {
      if (id === requestId.current) setError(err.message);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [view, labelId]);

  useEffect(() => {
    load();
  }, [load]);

  /** Apply a change locally at once, then reconcile with the server. */
  const optimistic = useCallback(async (id, patch, call) => {
    const before = notes;
    setNotes((current) => current.map((n) => (n.id === id ? { ...n, ...patch } : n)));
    try {
      const { note } = await call();
      setNotes((current) => current.map((n) => (n.id === id ? note : n)));
      return note;
    } catch (err) {
      setNotes(before);
      setError(err.message);
      throw err;
    }
  }, [notes]);

  const actions = useMemo(
    () => ({
      reload: load,

      async create(input) {
        const { note } = await api.createNote(input);
        // A new note only belongs on screen if this view would have shown it.
        const belongsHere =
          view === 'active' ? !note.archived : view === 'archive' ? note.archived : false;
        if (belongsHere) setNotes((current) => [note, ...current]);
        return note;
      },

      update(id, patch) {
        return optimistic(id, patch, () => api.updateNote(id, patch));
      },

      togglePin(note) {
        return optimistic(note.id, { pinned: !note.pinned }, () =>
          api.updateNote(note.id, { pinned: !note.pinned })
        );
      },

      async toggleArchive(note) {
        const next = !note.archived;
        setNotes((current) => current.filter((n) => n.id !== note.id));
        try {
          await api.updateNote(note.id, { archived: next });
        } catch (err) {
          setError(err.message);
          load();
        }
      },

      async trash(note) {
        setNotes((current) => current.filter((n) => n.id !== note.id));
        try {
          await api.trashNote(note.id);
        } catch (err) {
          setError(err.message);
          load();
        }
      },

      async restore(note) {
        setNotes((current) => current.filter((n) => n.id !== note.id));
        try {
          await api.restoreNote(note.id);
        } catch (err) {
          setError(err.message);
          load();
        }
      },

      async deleteForever(note) {
        setNotes((current) => current.filter((n) => n.id !== note.id));
        try {
          await api.deleteNote(note.id);
        } catch (err) {
          setError(err.message);
          load();
        }
      },

      async emptyTrash() {
        const before = notes;
        setNotes([]);
        try {
          await api.emptyTrash();
        } catch (err) {
          setNotes(before);
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
          current.map((n) => ({
            ...n,
            labels: n.labels.map((l) => (l.id === id ? label : l)),
          }))
        );
      },

      async deleteLabel(id) {
        await api.deleteLabel(id);
        setLabels((current) => current.filter((l) => l.id !== id));
        setNotes((current) =>
          current.map((n) => ({ ...n, labels: n.labels.filter((l) => l.id !== id) }))
        );
      },

      dismissError: () => setError(null),
    }),
    [load, notes, optimistic, view]
  );

  // Instant search, over the notes already in memory.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((n) => {
      const haystack = [
        n.title,
        n.body,
        ...(n.items || []).map((i) => i.text),
        ...(n.labels || []).map((l) => l.name),
      ]
        .join('\n')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [notes, query]);

  const pinned = useMemo(() => visible.filter((n) => n.pinned && !n.trashed), [visible]);
  const others = useMemo(() => visible.filter((n) => !n.pinned || n.trashed), [visible]);

  return { notes: visible, pinned, others, labels, loading, error, query, setQuery, actions };
}
