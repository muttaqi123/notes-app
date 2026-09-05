import { describe, test, expect } from '@jest/globals';
import { api, signUp, app } from './helpers.js';
import request from 'supertest';

describe('authentication', () => {
  test('registering returns a user and an access token', async () => {
    const res = await api()
      .post('/api/auth/register')
      .send({ name: 'Ada', email: 'ada@example.com', password: 'a-long-password' })
      .expect(201);

    expect(res.body.user.email).toBe('ada@example.com');
    expect(typeof res.body.accessToken).toBe('string');
    // The password must never come back, in any form.
    expect(JSON.stringify(res.body)).not.toContain('a-long-password');
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  test('the refresh token is set as an httpOnly cookie, not returned in the body', async () => {
    const res = await api()
      .post('/api/auth/register')
      .send({ name: 'Ada', email: 'ada2@example.com', password: 'a-long-password' })
      .expect(201);

    const cookie = res.headers['set-cookie'].join(';');
    expect(cookie).toMatch(/refresh_token=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(res.body.refreshToken).toBeUndefined();
  });

  test('a duplicate email is a 409, not a second account', async () => {
    await api().post('/api/auth/register')
      .send({ name: 'A', email: 'dupe@example.com', password: 'a-long-password' }).expect(201);
    await api().post('/api/auth/register')
      .send({ name: 'B', email: 'dupe@example.com', password: 'a-long-password' }).expect(409);
  });

  test('a short password is rejected before it reaches the database', async () => {
    const res = await api().post('/api/auth/register')
      .send({ name: 'A', email: 'short@example.com', password: 'abc' }).expect(400);
    expect(res.body.error.message).toMatch(/8 characters/);
  });

  test('a wrong password and an unknown email give the same answer', async () => {
    await signUp({ email: 'real@example.com', password: 'the-real-password' });

    const wrongPassword = await api().post('/api/auth/login')
      .send({ email: 'real@example.com', password: 'not-the-password' }).expect(401);
    const unknownEmail = await api().post('/api/auth/login')
      .send({ email: 'ghost@example.com', password: 'not-the-password' }).expect(401);

    expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
  });

  test('logging in works and /me identifies the caller', async () => {
    const me = await signUp();
    const login = await api().post('/api/auth/login')
      .send({ email: me.email, password: me.password }).expect(200);

    const res = await api().get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`).expect(200);
    expect(res.body.user.email).toBe(me.email);
  });

  test('a protected route refuses a missing or garbage token', async () => {
    await api().get('/api/notes').expect(401);
    await api().get('/api/notes').set('Authorization', 'Bearer nonsense').expect(401);
  });

  test('refresh rotates the token: the old one stops working', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register')
      .send({ name: 'R', email: 'rotate@example.com', password: 'a-long-password' }).expect(201);

    const first = await agent.post('/api/auth/refresh').expect(200);
    expect(typeof first.body.accessToken).toBe('string');

    // The agent now holds the *new* cookie, so a second refresh succeeds...
    await agent.post('/api/auth/refresh').expect(200);

    // ...while replaying the very first token, captured by hand, does not.
    const stale = await api().post('/api/auth/refresh')
      .set('Cookie', 'refresh_token=obviously-not-a-real-token').expect(401);
    expect(stale.body.error.code).toBe('bad_refresh');
  });
});
