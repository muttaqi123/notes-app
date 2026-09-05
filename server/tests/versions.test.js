import { describe, test, expect } from '@jest/globals';
import { api, signUp } from './helpers.js';

async function makeNote(me, body = {}) {
  const res = await me.auth(api().post('/api/notes')).send({ title: 'v1 title', body: 'v1 body', ...body });
  return res.body.note;
}

describe('version history', () => {
  test('a fresh note has no history yet', async () => {
    const me = await signUp();
    const note = await makeNote(me);
    const res = await me.auth(api().get(`/api/notes/${note.id}/versions`)).expect(200);
    expect(res.body.versions).toHaveLength(0);
  });

  test('each content edit snapshots the previous state and bumps the version', async () => {
    const me = await signUp();
    const note = await makeNote(me);

    await me.auth(api().patch(`/api/notes/${note.id}`)).send({ body: 'v2 body' }).expect(200);
    const third = await me.auth(api().patch(`/api/notes/${note.id}`))
      .send({ body: 'v3 body' }).expect(200);

    expect(third.body.note.version).toBe(3);

    const res = await me.auth(api().get(`/api/notes/${note.id}/versions`)).expect(200);
    expect(res.body.versions).toHaveLength(2);
    // Newest first, and each entry holds the text as it was BEFORE that edit.
    expect(res.body.versions[0]).toMatchObject({ version: 2, body: 'v2 body' });
    expect(res.body.versions[1]).toMatchObject({ version: 1, body: 'v1 body' });
  });

  test('pinning, archiving and colouring do not create versions', async () => {
    const me = await signUp();
    const note = await makeNote(me);

    await me.auth(api().patch(`/api/notes/${note.id}`)).send({ pinned: true }).expect(200);
    await me.auth(api().patch(`/api/notes/${note.id}`)).send({ archived: true }).expect(200);

    const res = await me.auth(api().get(`/api/notes/${note.id}/versions`)).expect(200);
    expect(res.body.versions).toHaveLength(0);
  });

  test('a PATCH that changes nothing creates no version', async () => {
    const me = await signUp();
    const note = await makeNote(me);
    await me.auth(api().patch(`/api/notes/${note.id}`)).send({ body: 'v1 body' }).expect(200);

    const res = await me.auth(api().get(`/api/notes/${note.id}/versions`)).expect(200);
    expect(res.body.versions).toHaveLength(0);
  });

  test('restoring brings the old text back', async () => {
    const me = await signUp();
    const note = await makeNote(me);
    await me.auth(api().patch(`/api/notes/${note.id}`))
      .send({ title: 'rewritten', body: 'rewritten body' }).expect(200);

    const restored = await me.auth(api().post(`/api/notes/${note.id}/versions/1/restore`)).expect(200);
    expect(restored.body.note.title).toBe('v1 title');
    expect(restored.body.note.body).toBe('v1 body');
  });

  test('a restore is itself undoable — the newer text is snapshotted first', async () => {
    const me = await signUp();
    const note = await makeNote(me);
    await me.auth(api().patch(`/api/notes/${note.id}`)).send({ body: 'v2 body' }).expect(200);
    await me.auth(api().post(`/api/notes/${note.id}/versions/1/restore`)).expect(200);

    const res = await me.auth(api().get(`/api/notes/${note.id}/versions`)).expect(200);
    const restorePoint = res.body.versions.find((v) => v.reason === 'restore');
    expect(restorePoint.body).toBe('v2 body');
  });

  test('a checklist edit is versioned like any other content change', async () => {
    const me = await signUp();
    const note = await makeNote(me, {
      type: 'checklist', body: '', items: [{ text: 'Milk', checked: false }],
    });

    await me.auth(api().patch(`/api/notes/${note.id}`))
      .send({ items: [{ text: 'Milk', checked: true }] }).expect(200);

    const res = await me.auth(api().get(`/api/notes/${note.id}/versions`)).expect(200);
    expect(res.body.versions[0].items[0]).toMatchObject({ text: 'Milk', checked: false });
  });

  test('history is private to the owner, and so is restoring', async () => {
    const me = await signUp();
    const stranger = await signUp();
    const note = await makeNote(me);
    await me.auth(api().patch(`/api/notes/${note.id}`)).send({ body: 'v2' }).expect(200);

    await stranger.auth(api().get(`/api/notes/${note.id}/versions`)).expect(404);
    await stranger.auth(api().post(`/api/notes/${note.id}/versions/1/restore`)).expect(404);
  });

  test('deleting a note forever takes its history with it', async () => {
    const me = await signUp();
    const note = await makeNote(me);
    await me.auth(api().patch(`/api/notes/${note.id}`)).send({ body: 'v2' }).expect(200);
    await me.auth(api().delete(`/api/notes/${note.id}`)).expect(200);
    await me.auth(api().get(`/api/notes/${note.id}/versions`)).expect(404);
  });
});
