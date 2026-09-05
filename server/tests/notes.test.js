import { describe, test, expect } from '@jest/globals';
import { api, signUp } from './helpers.js';

async function makeNote(me, body = {}) {
  const res = await me.auth(api().post('/api/notes'))
    .send({ title: 'A note', body: 'Some **markdown** text', ...body })
    .expect(201);
  return res.body.note;
}

describe('notes CRUD', () => {
  test('a note round-trips through create and read', async () => {
    const me = await signUp();
    const note = await makeNote(me, { title: 'Groceries', body: 'milk' });

    expect(note.title).toBe('Groceries');
    expect(note.version).toBe(1);

    const res = await me.auth(api().get(`/api/notes/${note.id}`)).expect(200);
    expect(res.body.note.body).toBe('milk');
  });

  test('an empty note is not saved', async () => {
    const me = await signUp();
    const res = await me.auth(api().post('/api/notes'))
      .send({ title: '   ', body: '' }).expect(400);
    expect(res.body.error.code).toBe('empty_note');
  });

  test('markdown is stored exactly as typed, not rendered or stripped', async () => {
    const me = await signUp();
    const source = '# Heading\n\n- [ ] a task\n\n`code` and **bold**';
    const note = await makeNote(me, { body: source });
    expect(note.body).toBe(source);
  });

  test('a checklist keeps its items and their checked state', async () => {
    const me = await signUp();
    const note = await makeNote(me, {
      title: 'Shopping',
      type: 'checklist',
      items: [{ text: 'Milk', checked: false }, { text: 'Bread', checked: true }],
    });

    expect(note.type).toBe('checklist');
    expect(note.items).toHaveLength(2);
    expect(note.items[1]).toMatchObject({ text: 'Bread', checked: true });
  });

  test('pin and archive are independent of each other', async () => {
    const me = await signUp();
    const note = await makeNote(me);

    const pinned = await me.auth(api().patch(`/api/notes/${note.id}`))
      .send({ pinned: true }).expect(200);
    expect(pinned.body.note.pinned).toBe(true);
    expect(pinned.body.note.archived).toBe(false);

    const archived = await me.auth(api().patch(`/api/notes/${note.id}`))
      .send({ archived: true, pinned: false }).expect(200);
    expect(archived.body.note.archived).toBe(true);
  });

  test('pinned notes sort above the rest', async () => {
    const me = await signUp();
    await makeNote(me, { title: 'ordinary' });
    const second = await makeNote(me, { title: 'important' });
    await me.auth(api().patch(`/api/notes/${second.id}`)).send({ pinned: true }).expect(200);

    const res = await me.auth(api().get('/api/notes')).expect(200);
    expect(res.body.notes[0].title).toBe('important');
  });

  test('archived notes leave the main list and appear in the archive', async () => {
    const me = await signUp();
    const note = await makeNote(me, { title: 'later' });
    await me.auth(api().patch(`/api/notes/${note.id}`)).send({ archived: true }).expect(200);

    const active = await me.auth(api().get('/api/notes?view=active')).expect(200);
    expect(active.body.notes).toHaveLength(0);

    const archive = await me.auth(api().get('/api/notes?view=archive')).expect(200);
    expect(archive.body.notes[0].title).toBe('later');
  });

  test('deleting trashes first — the note comes back until the trash is emptied', async () => {
    const me = await signUp();
    const note = await makeNote(me, { title: 'oops' });

    await me.auth(api().post(`/api/notes/${note.id}/trash`)).expect(200);
    let active = await me.auth(api().get('/api/notes')).expect(200);
    expect(active.body.notes).toHaveLength(0);

    const trash = await me.auth(api().get('/api/notes?view=trash')).expect(200);
    expect(trash.body.notes[0].trashed).toBe(true);

    await me.auth(api().post(`/api/notes/${note.id}/restore`)).expect(200);
    active = await me.auth(api().get('/api/notes')).expect(200);
    expect(active.body.notes[0].title).toBe('oops');
  });

  test('emptying the trash removes only trashed notes', async () => {
    const me = await signUp();
    const keep = await makeNote(me, { title: 'keep' });
    const drop = await makeNote(me, { title: 'drop' });
    await me.auth(api().post(`/api/notes/${drop.id}/trash`)).expect(200);

    const res = await me.auth(api().delete('/api/notes/trash')).expect(200);
    expect(res.body.deleted).toBe(1);

    await me.auth(api().get(`/api/notes/${keep.id}`)).expect(200);
    await me.auth(api().get(`/api/notes/${drop.id}`)).expect(404);
  });

  test('search matches partial words in title, body and checklist items', async () => {
    const me = await signUp();
    await makeNote(me, { title: 'Dentist appointment', body: 'Tuesday' });
    await makeNote(me, { title: 'Reading list', body: 'Structure and Interpretation' });
    await makeNote(me, {
      title: 'Errands', type: 'checklist', items: [{ text: 'Post office', checked: false }],
    });

    const partial = await me.auth(api().get('/api/notes?q=dent')).expect(200);
    expect(partial.body.notes).toHaveLength(1);

    const inItems = await me.auth(api().get('/api/notes?q=post off')).expect(200);
    expect(inItems.body.notes[0].title).toBe('Errands');
  });

  test('a regex metacharacter in the query is searched for, not executed', async () => {
    const me = await signUp();
    await makeNote(me, { title: 'Costs', body: 'the total is $40.00' });
    const res = await me.auth(api().get('/api/notes?q=' + encodeURIComponent('$40.00'))).expect(200);
    expect(res.body.notes).toHaveLength(1);
  });
});

describe('ownership', () => {
  test('one user cannot read, edit or delete another user\'s note', async () => {
    const owner = await signUp();
    const stranger = await signUp();
    const note = await makeNote(owner, { title: 'private' });

    await stranger.auth(api().get(`/api/notes/${note.id}`)).expect(404);
    await stranger.auth(api().patch(`/api/notes/${note.id}`)).send({ title: 'hacked' }).expect(404);
    await stranger.auth(api().delete(`/api/notes/${note.id}`)).expect(404);

    // And the note is untouched.
    const res = await owner.auth(api().get(`/api/notes/${note.id}`)).expect(200);
    expect(res.body.note.title).toBe('private');
  });

  test('a list only ever contains the caller\'s own notes', async () => {
    const a = await signUp();
    const b = await signUp();
    await makeNote(a, { title: 'mine' });
    await makeNote(b, { title: 'theirs' });

    const res = await a.auth(api().get('/api/notes')).expect(200);
    expect(res.body.notes.map((n) => n.title)).toEqual(['mine']);
  });
});
