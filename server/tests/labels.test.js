import { describe, test, expect } from '@jest/globals';
import { api, signUp } from './helpers.js';

describe('labels and tag filtering', () => {
  test('a label is created and listed', async () => {
    const me = await signUp();
    const res = await me.auth(api().post('/api/labels')).send({ name: 'Work' }).expect(201);
    expect(res.body.label.name).toBe('Work');

    const list = await me.auth(api().get('/api/labels')).expect(200);
    expect(list.body.labels).toHaveLength(1);
  });

  test('one user cannot have two labels of the same name, two users can', async () => {
    const a = await signUp();
    const b = await signUp();
    await a.auth(api().post('/api/labels')).send({ name: 'Work' }).expect(201);
    await a.auth(api().post('/api/labels')).send({ name: 'Work' }).expect(409);
    await b.auth(api().post('/api/labels')).send({ name: 'Work' }).expect(201);
  });

  test('notes filter by label', async () => {
    const me = await signUp();
    const work = (await me.auth(api().post('/api/labels')).send({ name: 'Work' })).body.label;
    const home = (await me.auth(api().post('/api/labels')).send({ name: 'Home' })).body.label;

    await me.auth(api().post('/api/notes')).send({ title: 'standup', labels: [work.id] }).expect(201);
    await me.auth(api().post('/api/notes')).send({ title: 'bins', labels: [home.id] }).expect(201);
    await me.auth(api().post('/api/notes')).send({ title: 'unfiled' }).expect(201);

    const res = await me.auth(api().get(`/api/notes?label=${work.id}`)).expect(200);
    expect(res.body.notes.map((n) => n.title)).toEqual(['standup']);
    expect(res.body.notes[0].labels[0].name).toBe('Work');
  });

  test('a label belonging to someone else is silently dropped, not attached', async () => {
    const me = await signUp();
    const stranger = await signUp();
    const theirs = (await stranger.auth(api().post('/api/labels')).send({ name: 'Theirs' })).body.label;

    const res = await me.auth(api().post('/api/notes'))
      .send({ title: 'mine', labels: [theirs.id] }).expect(201);
    expect(res.body.note.labels).toHaveLength(0);
  });

  test('deleting a label detaches it but keeps the notes', async () => {
    const me = await signUp();
    const work = (await me.auth(api().post('/api/labels')).send({ name: 'Work' })).body.label;
    const note = (await me.auth(api().post('/api/notes'))
      .send({ title: 'standup', labels: [work.id] })).body.note;

    await me.auth(api().delete(`/api/labels/${work.id}`)).expect(200);

    const res = await me.auth(api().get(`/api/notes/${note.id}`)).expect(200);
    expect(res.body.note.title).toBe('standup');
    expect(res.body.note.labels).toHaveLength(0);
  });

  test('renaming a label keeps it attached to its notes', async () => {
    const me = await signUp();
    const work = (await me.auth(api().post('/api/labels')).send({ name: 'Work' })).body.label;
    await me.auth(api().post('/api/notes')).send({ title: 'standup', labels: [work.id] }).expect(201);

    await me.auth(api().patch(`/api/labels/${work.id}`)).send({ name: 'Job' }).expect(200);

    const res = await me.auth(api().get(`/api/notes?label=${work.id}`)).expect(200);
    expect(res.body.notes[0].labels[0].name).toBe('Job');
  });
});
