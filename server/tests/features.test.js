import { describe, test, expect } from '@jest/globals';
import { api, signUp } from './helpers.js';
import { sweepDueReminders, purgeOldTrash } from '../src/services/reminders.service.js';
import { Note } from '../src/models/Note.js';

async function makeNote(me, body = {}) {
  const res = await me.auth(api().post('/api/notes')).send({ title: 'A note', ...body }).expect(201);
  return res.body.note;
}

const inThePast = () => new Date(Date.now() - 60_000).toISOString();
const inTheFuture = () => new Date(Date.now() + 60 * 60_000).toISOString();

describe('reminders', () => {
  test('a reminder can be set and cleared', async () => {
    const me = await signUp();
    const note = await makeNote(me);
    const when = inTheFuture();

    const set = await me.auth(api().patch(`/api/notes/${note.id}`))
      .send({ remindAt: when }).expect(200);
    expect(new Date(set.body.note.remindAt).toISOString()).toBe(when);

    const cleared = await me.auth(api().patch(`/api/notes/${note.id}`))
      .send({ remindAt: null }).expect(200);
    expect(cleared.body.note.remindAt).toBeNull();
  });

  test('the sweep notifies when a reminder is due, and only then', async () => {
    const me = await signUp();
    await makeNote(me, { title: 'Later', remindAt: inTheFuture() });
    const due = await makeNote(me, { title: 'Now', remindAt: inThePast() });

    const result = await sweepDueReminders();
    expect(result.sent).toBe(1);

    const notes = await me.auth(api().get('/api/notifications')).expect(200);
    expect(notes.body.notifications[0]).toMatchObject({ type: 'reminder', noteId: due.id });
  });

  test('a reminder is sent once, however often the sweep runs', async () => {
    const me = await signUp();
    await makeNote(me, { title: 'Once', remindAt: inThePast() });

    await sweepDueReminders();
    const second = await sweepDueReminders();
    expect(second.sent).toBe(0);

    const res = await me.auth(api().get('/api/notifications')).expect(200);
    expect(res.body.notifications).toHaveLength(1);
  });

  test('changing the time re-arms a reminder that already fired', async () => {
    const me = await signUp();
    const note = await makeNote(me, { remindAt: inThePast() });
    await sweepDueReminders();

    await me.auth(api().patch(`/api/notes/${note.id}`)).send({ remindAt: inThePast() }).expect(200);
    const again = await sweepDueReminders();
    expect(again.sent).toBe(1);
  });

  test('collaborators are reminded too', async () => {
    const owner = await signUp();
    const friend = await signUp();
    const note = await makeNote(owner, { title: 'Standup', remindAt: inThePast() });
    await owner.auth(api().post(`/api/notes/${note.id}/collaborators`))
      .send({ email: friend.email }).expect(201);

    await sweepDueReminders();

    const theirs = await friend.auth(api().get('/api/notifications')).expect(200);
    expect(theirs.body.notifications.some((n) => n.type === 'reminder')).toBe(true);
  });

  test('a trashed note does not remind anyone', async () => {
    const me = await signUp();
    const note = await makeNote(me, { remindAt: inThePast() });
    await me.auth(api().post(`/api/notes/${note.id}/trash`)).expect(200);

    expect((await sweepDueReminders()).sent).toBe(0);
  });
});

describe('the trash purge', () => {
  test('only notes past the retention window are removed', async () => {
    const me = await signUp();
    const recent = await makeNote(me, { title: 'binned today' });
    const old = await makeNote(me, { title: 'binned long ago' });

    await me.auth(api().post(`/api/notes/${recent.id}/trash`)).expect(200);
    await me.auth(api().post(`/api/notes/${old.id}/trash`)).expect(200);

    // Backdate one of them past the window.
    await Note.updateOne(
      { _id: old.id },
      { $set: { trashedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) } }
    );

    const result = await purgeOldTrash(30);
    expect(result.purged).toBe(1);

    await me.auth(api().get(`/api/notes/${recent.id}`)).expect(200);
    await me.auth(api().get(`/api/notes/${old.id}`)).expect(404);
  });

  test('notes that are not in the trash are never touched', async () => {
    const me = await signUp();
    const keep = await makeNote(me, { title: 'in use' });
    expect((await purgeOldTrash(0)).purged).toBe(0);
    await me.auth(api().get(`/api/notes/${keep.id}`)).expect(200);
  });
});

describe('the activity log', () => {
  test('it records who did what, in order', async () => {
    const me = await signUp();
    const note = await makeNote(me);
    await me.auth(api().patch(`/api/notes/${note.id}`)).send({ body: 'edited' }).expect(200);
    await me.auth(api().patch(`/api/notes/${note.id}`)).send({ pinned: true }).expect(200);

    const res = await me.auth(api().get(`/api/notes/${note.id}/activity`)).expect(200);
    const actions = res.body.activity.map((a) => a.action);

    expect(actions).toEqual(['pinned', 'edited', 'created']);
    expect(res.body.activity[0].actor.name).toBe(me.name);
  });

  test('it names the collaborator who made the change, not the owner', async () => {
    const owner = await signUp();
    const editor = await signUp();
    const note = await makeNote(owner);
    await owner.auth(api().post(`/api/notes/${note.id}/collaborators`))
      .send({ email: editor.email, role: 'editor' }).expect(201);
    await editor.auth(api().patch(`/api/notes/${note.id}`)).send({ body: 'their words' }).expect(200);

    const res = await owner.auth(api().get(`/api/notes/${note.id}/activity`)).expect(200);
    expect(res.body.activity[0]).toMatchObject({ action: 'edited' });
    expect(res.body.activity[0].actor.email).toBe(editor.email);
  });

  test('a version records who wrote the text it replaced', async () => {
    const owner = await signUp();
    const editor = await signUp();
    const note = await makeNote(owner, { body: 'the owner wrote this' });
    await owner.auth(api().post(`/api/notes/${note.id}/collaborators`))
      .send({ email: editor.email, role: 'editor' }).expect(201);
    await editor.auth(api().patch(`/api/notes/${note.id}`)).send({ body: 'the editor rewrote it' }).expect(200);

    const res = await owner.auth(api().get(`/api/notes/${note.id}/versions`)).expect(200);
    expect(res.body.versions[0].body).toBe('the owner wrote this');
    expect(res.body.versions[0].author.name).toBe(editor.name);
  });

  test('activity is private to people with access', async () => {
    const me = await signUp();
    const stranger = await signUp();
    const note = await makeNote(me);
    await stranger.auth(api().get(`/api/notes/${note.id}/activity`)).expect(404);
  });
});

describe('notifications', () => {
  test('they can be marked read, one at a time and all at once', async () => {
    const owner = await signUp();
    const friend = await signUp();
    const a = await makeNote(owner, { title: 'One' });
    const b = await makeNote(owner, { title: 'Two' });
    for (const note of [a, b]) {
      // eslint-disable-next-line no-await-in-loop
      await owner.auth(api().post(`/api/notes/${note.id}/collaborators`))
        .send({ email: friend.email }).expect(201);
    }

    let list = await friend.auth(api().get('/api/notifications')).expect(200);
    expect(list.body.unread).toBe(2);

    const marked = await friend.auth(
      api().post(`/api/notifications/${list.body.notifications[0].id}/read`)
    ).expect(200);
    expect(marked.body.unread).toBe(1);

    list = await friend.auth(api().post('/api/notifications/read-all')).expect(200);
    expect(list.body.unread).toBe(0);
  });

  test('one person cannot read another\'s notifications', async () => {
    const owner = await signUp();
    const friend = await signUp();
    const note = await makeNote(owner);
    await owner.auth(api().post(`/api/notes/${note.id}/collaborators`))
      .send({ email: friend.email }).expect(201);

    const mine = await owner.auth(api().get('/api/notifications')).expect(200);
    expect(mine.body.notifications).toHaveLength(0);
  });
});

describe('sorting and manual order', () => {
  test('notes can be sorted by title', async () => {
    const me = await signUp();
    await makeNote(me, { title: 'Zebra' });
    await makeNote(me, { title: 'Apple' });
    await makeNote(me, { title: 'Mango' });

    const res = await me.auth(api().get('/api/notes?sort=title')).expect(200);
    expect(res.body.notes.map((n) => n.title)).toEqual(['Apple', 'Mango', 'Zebra']);
  });

  test('a manual order is honoured, and only over your own notes', async () => {
    const me = await signUp();
    const stranger = await signUp();
    const first = await makeNote(me, { title: 'First' });
    const second = await makeNote(me, { title: 'Second' });
    const theirs = await makeNote(stranger, { title: 'Theirs' });

    const res = await me.auth(api().patch('/api/notes/reorder')).send({
      order: [
        { id: second.id, order: 1 },
        { id: first.id, order: 2 },
        { id: theirs.id, order: 3 },
      ],
    }).expect(200);

    // The stranger's note is silently dropped, not reordered.
    expect(res.body.reordered).toBe(2);

    const board = await me.auth(api().get('/api/notes?sort=manual')).expect(200);
    expect(board.body.notes.map((n) => n.title)).toEqual(['Second', 'First']);
  });
});

describe('export', () => {
  test('JSON export carries every note and label', async () => {
    const me = await signUp();
    const label = (await me.auth(api().post('/api/labels')).send({ name: 'Work' })).body.label;
    await makeNote(me, { title: 'Kept', body: '# heading', labels: [label.id] });

    const res = await me.auth(api().get('/api/export/json')).expect(200);
    expect(res.headers['content-disposition']).toMatch(/attachment/);

    const data = JSON.parse(res.text);
    expect(data.format).toBe('keep-notes/v1');
    expect(data.labels.map((l) => l.name)).toEqual(['Work']);
    expect(data.notes[0].body).toBe('# heading');
  });

  test('Markdown export is readable, with checklists as task lists', async () => {
    const me = await signUp();
    await makeNote(me, {
      title: 'Shopping',
      type: 'checklist',
      items: [{ text: 'Milk', checked: true }, { text: 'Bread', checked: false }],
    });

    const res = await me.auth(api().get('/api/export/markdown')).expect(200);
    expect(res.text).toContain('# Shopping');
    expect(res.text).toContain('- [x] Milk');
    expect(res.text).toContain('- [ ] Bread');
  });

  test('an export contains only your own notes', async () => {
    const me = await signUp();
    const stranger = await signUp();
    await makeNote(me, { title: 'Mine' });
    await makeNote(stranger, { title: 'Theirs' });

    const res = await me.auth(api().get('/api/export/json')).expect(200);
    const data = JSON.parse(res.text);
    expect(data.notes.map((n) => n.title)).toEqual(['Mine']);
  });
});

describe('stats', () => {
  test('the totals describe the account', async () => {
    const me = await signUp();
    await makeNote(me, { title: 'One', pinned: true });
    await makeNote(me, { title: 'Two', type: 'checklist', items: [{ text: 'x', checked: false }] });
    const archived = await makeNote(me, { title: 'Three' });
    await me.auth(api().patch(`/api/notes/${archived.id}`)).send({ archived: true }).expect(200);

    const res = await me.auth(api().get('/api/notes/stats')).expect(200);
    expect(res.body.totals).toMatchObject({
      total: 3, active: 2, archived: 1, pinned: 1, checklists: 1,
    });
    expect(res.body.timeline).toHaveLength(30);
    expect(res.body.timeline.at(-1).count).toBe(3);
  });

  test('label and colour breakdowns are reported', async () => {
    const me = await signUp();
    const label = (await me.auth(api().post('/api/labels')).send({ name: 'Ideas' })).body.label;
    await makeNote(me, { title: 'A', color: 'blue', labels: [label.id] });
    await makeNote(me, { title: 'B', color: 'blue' });

    const res = await me.auth(api().get('/api/notes/stats')).expect(200);
    expect(res.body.byColor.find((c) => c.color === 'blue').count).toBe(2);
    expect(res.body.byLabel).toEqual([{ name: 'Ideas', count: 1 }]);
  });
});

describe('user settings', () => {
  test('preferences round-trip', async () => {
    const me = await signUp();
    const res = await me.auth(api().patch('/api/auth/settings'))
      .send({ theme: 'dark', density: 'compact', sort: 'manual' }).expect(200);

    expect(res.body.user.settings).toMatchObject({
      theme: 'dark', density: 'compact', sort: 'manual',
    });

    const me2 = await me.auth(api().get('/api/auth/me')).expect(200);
    expect(me2.body.user.settings.theme).toBe('dark');
  });

  test('an invalid theme is rejected at the edge', async () => {
    const me = await signUp();
    await me.auth(api().patch('/api/auth/settings')).send({ theme: 'neon' }).expect(400);
  });
});
