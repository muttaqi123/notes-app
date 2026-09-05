import { describe, test, expect } from '@jest/globals';
import otplib from 'otplib';
import { api, signUp } from './helpers.js';

const { authenticator } = otplib;

/** Enrol a signed-up user in 2FA and hand back their secret and backup codes. */
async function enable(me) {
  const setup = await me.auth(api().post('/api/auth/2fa/setup')).expect(200);
  const code = authenticator.generate(setup.body.secret);
  const confirmed = await me.auth(api().post('/api/auth/2fa/confirm')).send({ code }).expect(200);
  return { secret: setup.body.secret, backupCodes: confirmed.body.backupCodes };
}

describe('two-factor authentication', () => {
  test('setup returns a QR code but does NOT switch 2FA on', async () => {
    const me = await signUp();
    const res = await me.auth(api().post('/api/auth/2fa/setup')).expect(200);

    expect(res.body.qr).toMatch(/^data:image\/png;base64,/);
    expect(res.body.secret).toEqual(expect.any(String));

    const status = await me.auth(api().get('/api/auth/2fa')).expect(200);
    // The crucial property: scanning the code and then losing the phone must
    // not lock you out, so the secret is not trusted until it is confirmed.
    expect(status.body.enabled).toBe(false);

    await api().post('/api/auth/login')
      .send({ email: me.email, password: me.password }).expect(200);
  });

  test('confirming with a real code enables it and returns backup codes once', async () => {
    const me = await signUp();
    const { backupCodes } = await enable(me);

    expect(backupCodes).toHaveLength(10);
    const status = await me.auth(api().get('/api/auth/2fa')).expect(200);
    expect(status.body).toMatchObject({ enabled: true, backupCodesRemaining: 10 });
  });

  test('confirming with a wrong code does not enable it', async () => {
    const me = await signUp();
    await me.auth(api().post('/api/auth/2fa/setup')).expect(200);
    await me.auth(api().post('/api/auth/2fa/confirm')).send({ code: '000000' }).expect(400);

    const status = await me.auth(api().get('/api/auth/2fa')).expect(200);
    expect(status.body.enabled).toBe(false);
  });

  test('with 2FA on, the password alone is not enough — and the error says why', async () => {
    const me = await signUp();
    await enable(me);

    const res = await api().post('/api/auth/login')
      .send({ email: me.email, password: me.password }).expect(401);

    // A distinct code, so the client asks for a code rather than telling the
    // user their password is wrong.
    expect(res.body.error.code).toBe('two_factor_required');
  });

  test('a valid code completes the sign-in', async () => {
    const me = await signUp();
    const { secret } = await enable(me);

    const res = await api().post('/api/auth/login').send({
      email: me.email,
      password: me.password,
      twoFactorCode: authenticator.generate(secret),
    }).expect(200);

    expect(res.body.accessToken).toEqual(expect.any(String));
  });

  test('a wrong code is refused even with the right password', async () => {
    const me = await signUp();
    await enable(me);
    const res = await api().post('/api/auth/login')
      .send({ email: me.email, password: me.password, twoFactorCode: '123456' })
      .expect(401);
    expect(res.body.error.code).toBe('bad_two_factor');
  });

  test('a backup code works once and is then spent', async () => {
    const me = await signUp();
    const { backupCodes } = await enable(me);
    const [code] = backupCodes;

    await api().post('/api/auth/login')
      .send({ email: me.email, password: me.password, twoFactorCode: code }).expect(200);

    // The same code a second time is no longer a code.
    await api().post('/api/auth/login')
      .send({ email: me.email, password: me.password, twoFactorCode: code }).expect(401);

    const status = await me.auth(api().get('/api/auth/2fa')).expect(200);
    expect(status.body.backupCodesRemaining).toBe(9);
  });

  test('turning 2FA off requires the password', async () => {
    const me = await signUp();
    await enable(me);

    await me.auth(api().post('/api/auth/2fa/disable')).send({ password: 'wrong-password' }).expect(401);
    await me.auth(api().post('/api/auth/2fa/disable')).send({ password: me.password }).expect(200);

    // And afterwards the password alone signs you in again.
    await api().post('/api/auth/login')
      .send({ email: me.email, password: me.password }).expect(200);
  });

  test('setting it up twice is refused while it is already on', async () => {
    const me = await signUp();
    await enable(me);
    await me.auth(api().post('/api/auth/2fa/setup')).expect(409);
  });
});

describe('password reset', () => {
  test('a reset token changes the password and the old one stops working', async () => {
    const me = await signUp();

    const request = await api().post('/api/auth/forgot-password')
      .send({ email: me.email }).expect(200);
    expect(request.body.devToken).toEqual(expect.any(String));

    await api().post('/api/auth/reset-password')
      .send({ token: request.body.devToken, newPassword: 'a-brand-new-password' })
      .expect(200);

    await api().post('/api/auth/login')
      .send({ email: me.email, password: me.password }).expect(401);
    await api().post('/api/auth/login')
      .send({ email: me.email, password: 'a-brand-new-password' }).expect(200);
  });

  test('an unknown address gets the same answer as a known one', async () => {
    const me = await signUp();
    const known = await api().post('/api/auth/forgot-password').send({ email: me.email }).expect(200);
    const unknown = await api().post('/api/auth/forgot-password')
      .send({ email: 'nobody@example.com' }).expect(200);

    expect(unknown.body.sent).toBe(true);
    expect(known.body.sent).toBe(true);
    // The token is the only difference, and it is development-only.
    expect(unknown.body.devToken).toBeUndefined();
  });

  test('a token cannot be used twice', async () => {
    const me = await signUp();
    const { body } = await api().post('/api/auth/forgot-password').send({ email: me.email });

    await api().post('/api/auth/reset-password')
      .send({ token: body.devToken, newPassword: 'first-new-password' }).expect(200);
    await api().post('/api/auth/reset-password')
      .send({ token: body.devToken, newPassword: 'second-new-password' }).expect(400);
  });

  test('a garbage token is refused', async () => {
    await api().post('/api/auth/reset-password')
      .send({ token: 'a'.repeat(64), newPassword: 'does-not-matter-here' }).expect(400);
  });
});

describe('sessions', () => {
  test('signing in twice makes two sessions, and one can be revoked', async () => {
    const me = await signUp();
    await api().post('/api/auth/login').send({ email: me.email, password: me.password }).expect(200);

    const list = await me.auth(api().get('/api/auth/sessions')).expect(200);
    expect(list.body.sessions.length).toBeGreaterThanOrEqual(2);

    const victim = list.body.sessions[list.body.sessions.length - 1];
    await me.auth(api().delete(`/api/auth/sessions/${victim.id}`)).expect(200);

    const after = await me.auth(api().get('/api/auth/sessions')).expect(200);
    expect(after.body.sessions.map((s) => s.id)).not.toContain(victim.id);
  });

  test('changing the password revokes every session', async () => {
    const me = await signUp();
    await api().post('/api/auth/login').send({ email: me.email, password: me.password }).expect(200);

    await me.auth(api().post('/api/auth/change-password'))
      .send({ currentPassword: me.password, newPassword: 'another-good-password' })
      .expect(200);

    const after = await me.auth(api().get('/api/auth/sessions')).expect(200);
    expect(after.body.sessions).toHaveLength(0);
  });
});
