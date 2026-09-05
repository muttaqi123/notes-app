import request from 'supertest';
import { createApp } from '../src/app.js';

export const app = createApp();

let counter = 0;

/** Register a fresh user and return an agent already carrying its token. */
export async function signUp(overrides = {}) {
  counter += 1;
  const payload = {
    name: `User ${counter}`,
    email: `user${counter}@example.com`,
    password: 'correct horse battery',
    ...overrides,
  };
  const res = await request(app).post('/api/auth/register').send(payload).expect(201);
  return {
    ...payload,
    user: res.body.user,
    token: res.body.accessToken,
    auth: (req) => req.set('Authorization', `Bearer ${res.body.accessToken}`),
  };
}

export function api() {
  return request(app);
}
