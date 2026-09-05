import { describe, test, expect } from '@jest/globals';
import { api, signUp } from './helpers.js';

async function makeNote(me, body = {}) {
  const res = await me.auth(api().post('/api/notes'))
    .send({ title: 'Shared plans', body: 'draft one', ...body })
    .expect(201);
  return res.body.note;
}

describe('sharing a note', () => {
  test('the owner can share, and the recipient then sees it', async () => {
    const owner = await signUp();
    const friend = await signUp();
    const note = await makeNote(owner);

    // Before sharing, the note may as well not exist for them.
    await friend.auth(api().get(`/api/notes/${note.id}`)).expect(404);

    const res = await owner.auth(api().post(`/api/notes/${note.id}/collaborators`))
      .send({ email: friend.email, role: 'viewer' }).expect(201);
    expect(res.body.collaborators).toHaveLength(1);
    expect(res.body.collaborators[0].email).toBe(friend.email);

    await friend.auth(api().get(`/api/notes/${note.id}`)).expect(200);
  });

  test('a shared note appears on the recipient\'s board and in their shared view', async () => {
    const owner = await signUp();
    const friend = await signUp();
    const note = await makeNote(owner, { title: 'Trip plan' });
    await owner.auth(api().post(`/api/notes/${note.id}/collaborators`))
      .send({ email: friend.email }).expect(201);

    const board = await friend.auth(api().get('/api/notes')).expect(200);
    expect(board.body.notes.map((n) => n.title)).toContain('Trip plan');

    const shared = await friend.auth(api().get('/api/notes?view=shared')).expect(200);
    expect(shared.body.notes).toHaveLength(1);
    expect(shared.body.notes[0].owner.email).toBe(owner.email);
  });

  test('a viewer can read but not edit', async () => {
    const owner = await signUp();
    const friend = await signUp();
    const note = await makeNote(owner);
    await owner.auth(api().post(`/api/notes/${note.id}/collaborators`))
      .send({ email: friend.email, role: 'viewer' }).expect(201);

    await friend.auth(api().get(`/api/notes/${note.id}`)).expect(200);
    // 404 rather than 403: a 403 would confirm the note exists to someone who
    // is being told it does not.
    await friend.auth(api().patch(`/api/notes/${note.id}`)).send({ body: 'nope' }).expect(404);
  });

  test('an editor can edit', async () => {
    const owner = await signUp();
    const friend = await signUp();
    const note = await makeNote(owner);
    await owner.auth(api().post(`/api/notes/${note.id}/collaborators`))
      .send({ email: friend.email, role: 'editor' }).expect(201);

    const res = await friend.auth(api().patch(`/api/notes/${note.id}`))
      .send({ body: 'edited by a collaborator' }).expect(200);
    expect(res.body.note.body).toBe('edited by a collaborator');
  });

  test('an editor still cannot share, trash or delete — those are the owner\'s', async () => {
    const owner = await signUp();
    const editor = await signUp();
    const stranger = await signUp();
    const note = await makeNote(owner);
    await owner.auth(api().post(`/api/notes/${note.id}/collaborators`))
      .send({ email: editor.email, role: 'editor' }).expect(201);

    await editor.auth(api().post(`/api/notes/${note.id}/collaborators`))
      .send({ email: stranger.email }).expect(404);
    await editor.auth(api().post(`/api/notes/${note.id}/trash`)).expect(404);
    await editor.auth(api().delete(`/api/notes/${note.id}`)).expect(404);
  });

  test('re-sharing changes the role instead of adding a second row', async () => {
    const owner = await signUp();
    const friend = await signUp();
    const note = await makeNote(owner);

    await owner.auth(api().post(`/api/notes/${note.id}/collaborators`))
      .send({ email: friend.email, role: 'viewer' }).expect(201);
    const res = await owner.auth(api().post(`/api/notes/${note.id}/collaborators`))
      .send({ email: friend.email, role: 'editor' }).expect(201);

    expect(res.body.collaborators).toHaveLength(1);
    expect(res.body.collaborators[0].role).toBe('editor');
  });

  test('revoking access takes the note away again', async () => {
    const owner = await signUp();
    const friend = await signUp();
    const note = await makeNote(owner);
    await owner.auth(api().post(`/api/notes/${note.id}/collaborators`))
      .send({ email: friend.email }).expect(201);
    await friend.auth(api().get(`/api/notes/${note.id}`)).expect(200);

    await owner.auth(api().delete(`/api/notes/${note.id}/collaborators/${friend.user.id}`)).expect(200);
    await friend.auth(api().get(`/api/notes/${note.id}`)).expect(404);
  });

  test('a collaborator can leave a note themselves', async () => {
    const owner = await signUp();
    const friend = await signUp();
    const note = await makeNote(owner);
    await owner.auth(api().post(`/api/notes/${note.id}/collaborators`))
      .send({ email: friend.email }).expect(201);

    await friend.auth(api().post(`/api/notes/${note.id}/leave`)).expect(200);
    await friend.auth(api().get(`/api/notes/${note.id}`)).expect(404);
    // The owner still has their note.
    await owner.auth(api().get(`/api/notes/${note.id}`)).expect(200);
  });

  test('sharing with an address nobody uses says so', async () => {
    const owner = await signUp();
    const note = await makeNote(owner);
    const res = await owner.auth(api().post(`/api/notes/${note.id}/collaborators`))
      .send({ email: 'nobody@example.com' }).expect(404);
    expect(res.body.error.code).toBe('no_recipient');
  });

  test('sharing a note with yourself is refused', async () => {
    const owner = await signUp();
    const note = await makeNote(owner);
    await owner.auth(api().post(`/api/notes/${note.id}/collaborators`))
      .send({ email: owner.email }).expect(400);
  });

  test('the recipient is notified, and the sender is not', async () => {
    const owner = await signUp();
    const friend = await signUp();
    const note = await makeNote(owner, { title: 'Budget' });
    await owner.auth(api().post(`/api/notes/${note.id}/collaborators`))
      .send({ email: friend.email }).expect(201);

    const theirs = await friend.auth(api().get('/api/notifications')).expect(200);
    expect(theirs.body.unread).toBe(1);
    expect(theirs.body.notifications[0].type).toBe('shared_with_you');
    expect(theirs.body.notifications[0].body).toBe('Budget');

    const mine = await owner.auth(api().get('/api/notifications')).expect(200);
    expect(mine.body.unread).toBe(0);
  });

  test('collaborators are listed with the caller\'s own role', async () => {
    const owner = await signUp();
    const friend = await signUp();
    const note = await makeNote(owner);
    await owner.auth(api().post(`/api/notes/${note.id}/collaborators`))
      .send({ email: friend.email, role: 'editor' }).expect(201);

    const asOwner = await owner.auth(api().get(`/api/notes/${note.id}/collaborators`)).expect(200);
    expect(asOwner.body.myRole).toBe('owner');
    expect(asOwner.body.owner.email).toBe(owner.email);

    const asFriend = await friend.auth(api().get(`/api/notes/${note.id}/collaborators`)).expect(200);
    expect(asFriend.body.myRole).toBe('editor');
  });

  test('deleting a shared note for good removes it for everyone', async () => {
    const owner = await signUp();
    const friend = await signUp();
    const note = await makeNote(owner);
    await owner.auth(api().post(`/api/notes/${note.id}/collaborators`))
      .send({ email: friend.email }).expect(201);

    await owner.auth(api().delete(`/api/notes/${note.id}`)).expect(200);
    await friend.auth(api().get(`/api/notes/${note.id}`)).expect(404);
  });
});
