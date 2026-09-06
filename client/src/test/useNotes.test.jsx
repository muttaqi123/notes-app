import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useNotes } from '../hooks/useNotes.js';
import { api } from '../api/client.js';

// The socket is a real connection attempt otherwise, which jsdom cannot make
// and which none of these tests are about.
vi.mock('../hooks/useSocket.js', () => ({
  useSocket: () => ({ connected: true, socket: { current: null } }),
}));

vi.mock('../api/client.js', () => ({
  api: {
    listNotes: vi.fn(),
    listLabels: vi.fn(),
    createNote: vi.fn(),
    updateNote: vi.fn(),
    trashNote: vi.fn(),
    restoreNote: vi.fn(),
    deleteNote: vi.fn(),
    emptyTrash: vi.fn(),
    leaveNote: vi.fn(),
    reorderNotes: vi.fn(),
    createLabel: vi.fn(),
    updateLabel: vi.fn(),
    deleteLabel: vi.fn(),
  },
}));

const note = (over = {}) => ({
  id: 'n1',
  owner: { id: 'me' },
  title: 'A note',
  body: 'body text',
  type: 'note',
  items: [],
  color: 'default',
  pinned: false,
  archived: false,
  trashed: false,
  labels: [],
  attachments: [],
  remindAt: null,
  version: 1,
  updatedAt: new Date().toISOString(),
  ...over,
});

async function mount(notes = [note()], labels = []) {
  api.listNotes.mockResolvedValue({ notes, nextCursor: null });
  api.listLabels.mockResolvedValue({ labels });
  const view = renderHook(() => useNotes({ view: 'active' }));
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
}

beforeEach(() => vi.clearAllMocks());

describe('loading the board', () => {
  test('notes and labels arrive together', async () => {
    const { result } = await mount([note({ title: 'Hello' })], [{ id: 'l1', name: 'Work' }]);
    expect(result.current.notes).toHaveLength(1);
    expect(result.current.labels[0].name).toBe('Work');
  });

  test('pinned notes are separated from the rest', async () => {
    const { result } = await mount([
      note({ id: 'a', title: 'Pinned', pinned: true }),
      note({ id: 'b', title: 'Ordinary' }),
    ]);
    expect(result.current.pinned.map((n) => n.title)).toEqual(['Pinned']);
    expect(result.current.others.map((n) => n.title)).toEqual(['Ordinary']);
  });
});

describe('instant search', () => {
  test('filters on title, body, checklist items and label names', async () => {
    const { result } = await mount([
      note({ id: 'a', title: 'Dentist', body: 'Tuesday' }),
      note({ id: 'b', title: 'Reading', body: 'Kleppmann' }),
      note({ id: 'c', title: 'Errands', type: 'checklist', body: '', items: [{ id: 'i', text: 'Post office', checked: false }] }),
      note({ id: 'd', title: 'Tagged', labels: [{ id: 'l1', name: 'Urgent' }] }),
    ]);

    act(() => result.current.setQuery('dent'));
    expect(result.current.notes.map((n) => n.title)).toEqual(['Dentist']);

    act(() => result.current.setQuery('post off'));
    expect(result.current.notes.map((n) => n.title)).toEqual(['Errands']);

    act(() => result.current.setQuery('urgent'));
    expect(result.current.notes.map((n) => n.title)).toEqual(['Tagged']);
  });

  test('searching fires no request — it filters what is already loaded', async () => {
    const { result } = await mount();
    api.listNotes.mockClear();
    act(() => result.current.setQuery('anything'));
    expect(api.listNotes).not.toHaveBeenCalled();
  });

  test('an empty query shows everything again', async () => {
    const { result } = await mount([note({ id: 'a' }), note({ id: 'b' })]);
    act(() => result.current.setQuery('nothing matches this'));
    expect(result.current.notes).toHaveLength(0);
    act(() => result.current.setQuery(''));
    expect(result.current.notes).toHaveLength(2);
  });
});

describe('optimistic updates', () => {
  test('a pin shows before the server answers', async () => {
    const { result } = await mount([note({ id: 'a', pinned: false })]);

    let resolve;
    api.updateNote.mockReturnValue(new Promise((r) => { resolve = r; }));

    act(() => { result.current.actions.togglePin(result.current.notes[0]); });
    // Applied locally while the request is still in flight — this is the whole
    // point of an optimistic update.
    expect(result.current.notes[0].pinned).toBe(true);

    await act(async () => {
      resolve({ note: note({ id: 'a', pinned: true }) });
    });
    expect(result.current.notes[0].pinned).toBe(true);
  });

  test('a failed update rolls back and surfaces the error', async () => {
    const { result } = await mount([note({ id: 'a', pinned: false })]);
    api.updateNote.mockRejectedValue(Object.assign(new Error('Network is down'), { code: 'x' }));

    await act(async () => {
      await result.current.actions.togglePin(result.current.notes[0]).catch(() => {});
    });

    expect(result.current.notes[0].pinned).toBe(false);
    expect(result.current.error).toBe('Network is down');
  });

  test('trashing removes the card at once, and puts it back if the server refuses', async () => {
    const { result } = await mount([note({ id: 'a', title: 'Doomed' })]);
    api.trashNote.mockRejectedValue(new Error('Nope'));

    await act(async () => {
      await result.current.actions.trash(result.current.notes[0]).catch(() => {});
    });

    expect(result.current.notes.map((n) => n.title)).toEqual(['Doomed']);
    expect(result.current.error).toBe('Nope');
  });
});

describe('live updates', () => {
  test('a changed note replaces the local copy', async () => {
    const { result } = await mount([note({ id: 'a', title: 'Before' })]);
    act(() => result.current.actions.mergeNote(note({ id: 'a', title: 'After' })));
    expect(result.current.notes[0].title).toBe('After');
  });

  test('a note that no longer belongs in this view leaves it', async () => {
    const { result } = await mount([note({ id: 'a', title: 'Here' })]);
    // Archived elsewhere: the active board should drop it.
    act(() => result.current.actions.mergeNote(note({ id: 'a', archived: true })));
    expect(result.current.notes).toHaveLength(0);
  });

  test('a new note from another device appears', async () => {
    const { result } = await mount([]);
    act(() => result.current.actions.mergeNote(note({ id: 'new', title: 'From my phone' })));
    expect(result.current.notes.map((n) => n.title)).toEqual(['From my phone']);
  });
});

describe('labels', () => {
  test('renaming a label updates it on the notes that carry it', async () => {
    const { result } = await mount(
      [note({ id: 'a', labels: [{ id: 'l1', name: 'Work' }] })],
      [{ id: 'l1', name: 'Work' }]
    );
    api.updateLabel.mockResolvedValue({ label: { id: 'l1', name: 'Job' } });

    await act(async () => { await result.current.actions.renameLabel('l1', 'Job'); });

    expect(result.current.labels[0].name).toBe('Job');
    expect(result.current.notes[0].labels[0].name).toBe('Job');
  });

  test('deleting a label detaches it without removing the note', async () => {
    const { result } = await mount(
      [note({ id: 'a', title: 'Kept', labels: [{ id: 'l1', name: 'Work' }] })],
      [{ id: 'l1', name: 'Work' }]
    );
    api.deleteLabel.mockResolvedValue({ id: 'l1' });

    await act(async () => { await result.current.actions.deleteLabel('l1'); });

    expect(result.current.labels).toHaveLength(0);
    expect(result.current.notes[0].title).toBe('Kept');
    expect(result.current.notes[0].labels).toHaveLength(0);
  });
});
