import { describe, test, expect } from '@jest/globals';
import { api, signUp } from './helpers.js';

async function makeNote(me, body = {}) {
  const res = await me.auth(api().post('/api/notes'))
    .send({ title: 'Meeting notes', body: 'first draft', ...body })
    .expect(201);
  return res.body.note;
}

describe('optimistic concurrency', () => {
  test('a save against the current version succeeds', async () => {
    const me = await signUp();
    const note = await makeNote(me);

    const res = await me.auth(api().patch(`/api/notes/${note.id}`))
      .send({ body: 'second draft', expectedVersion: note.version })
      .expect(200);
    expect(res.body.note.body).toBe('second draft');
    expect(res.body.note.version).toBe(2);
  });

  test('a save against a stale version is refused, and nothing is overwritten', async () => {
    const me = await signUp();
    const note = await makeNote(me);

    // Another tab — or another person — gets there first.
    await me.auth(api().patch(`/api/notes/${note.id}`))
      .send({ body: 'their edit' }).expect(200);

    const conflict = await me.auth(api().patch(`/api/notes/${note.id}`))
      .send({ body: 'my edit', expectedVersion: note.version })
      .expect(409);

    expect(conflict.body.error.code).toBe('version_conflict');
    // The response carries the note as it now stands, so the client can show
    // both sides rather than just saying no.
    expect(conflict.body.current.body).toBe('their edit');

    const after = await me.auth(api().get(`/api/notes/${note.id}`)).expect(200);
    expect(after.body.note.body).toBe('their edit');
  });

  test('two collaborators editing at once: the second is told, not ignored', async () => {
    const owner = await signUp();
    const editor = await signUp();
    const note = await makeNote(owner, { body: 'agenda' });
    await owner.auth(api().post(`/api/notes/${note.id}/collaborators`))
      .send({ email: editor.email, role: 'editor' }).expect(201);

    // Both loaded version 1.
    await owner.auth(api().patch(`/api/notes/${note.id}`))
      .send({ body: 'agenda + owner notes', expectedVersion: 1 }).expect(200);

    const second = await editor.auth(api().patch(`/api/notes/${note.id}`))
      .send({ body: 'agenda + editor notes', expectedVersion: 1 }).expect(409);

    expect(second.body.current.body).toBe('agenda + owner notes');
  });

  test('without expectedVersion the write goes through — the check is opt-in', async () => {
    const me = await signUp();
    const note = await makeNote(me);
    await me.auth(api().patch(`/api/notes/${note.id}`)).send({ body: 'v2' }).expect(200);

    // A colour change does not need the protection and should not be blocked
    // by an edit that happened in between.
    await me.auth(api().patch(`/api/notes/${note.id}`)).send({ color: 'blue' }).expect(200);
  });

  test('a refused save leaves no version behind', async () => {
    const me = await signUp();
    const note = await makeNote(me);
    await me.auth(api().patch(`/api/notes/${note.id}`)).send({ body: 'v2' }).expect(200);
    await me.auth(api().patch(`/api/notes/${note.id}`))
      .send({ body: 'conflicting', expectedVersion: 1 }).expect(409);

    const res = await me.auth(api().get(`/api/notes/${note.id}/versions`)).expect(200);
    // Exactly one snapshot: the successful edit. The refused one wrote nothing.
    expect(res.body.versions).toHaveLength(1);
  });
});

describe('pagination', () => {
  test('a cursor walks the whole set without repeating or dropping a note', async () => {
    const me = await signUp();
    for (let i = 0; i < 12; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await me.auth(api().post('/api/notes')).send({ title: `Note ${i}` }).expect(201);
    }

    const seen = [];
    let cursor = null;
    let pages = 0;

    do {
      // eslint-disable-next-line no-await-in-loop
      const res = await me.auth(
        api().get(`/api/notes?limit=5${cursor ? `&cursor=${cursor}` : ''}`)
      ).expect(200);
      seen.push(...res.body.notes.map((n) => n.title));
      cursor = res.body.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);

    expect(seen).toHaveLength(12);
    expect(new Set(seen).size).toBe(12);
  });

  test('the last page reports no further cursor', async () => {
    const me = await signUp();
    await me.auth(api().post('/api/notes')).send({ title: 'only one' }).expect(201);

    const res = await me.auth(api().get('/api/notes?limit=5')).expect(200);
    expect(res.body.notes).toHaveLength(1);
    expect(res.body.nextCursor).toBeNull();
  });

  test('a nonsense cursor is ignored rather than throwing', async () => {
    const me = await signUp();
    await me.auth(api().post('/api/notes')).send({ title: 'a note' }).expect(201);
    const res = await me.auth(api().get('/api/notes?cursor=not-a-real-cursor')).expect(200);
    expect(res.body.notes).toHaveLength(1);
  });
});
