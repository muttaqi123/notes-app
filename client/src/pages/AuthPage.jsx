import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { NoteIcon, ShieldIcon, CheckIcon } from '../components/Icons.jsx';

/**
 * Sign in, sign up, and the password-reset pair — one component, because they
 * are the same form with different fields. Two nearly identical files drift;
 * one does not.
 *
 * The two-factor step is a *mode*, not a second page: the server answers a
 * correct password with `two_factor_required`, and the form swaps the password
 * field for a code field without losing what was already typed.
 */
export default function AuthPage({ mode = 'login' }) {
  const isRegister = mode === 'register';
  const isForgot = mode === 'forgot';
  const isReset = mode === 'reset';

  const { user, loading, login, register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: '', email: '', password: '', code: '', token: '' });
  const [needsCode, setNeedsCode] = useState(false);
  const [sent, setSent] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (loading) {
    return <div className="grid min-h-screen place-items-center bg-subtle text-sm text-muted">Loading…</div>;
  }
  if (user && !isForgot && !isReset) return <Navigate to="/" replace />;

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (isRegister) {
        await register({ name: form.name, email: form.email, password: form.password });
        navigate('/');
      } else if (isForgot) {
        const res = await api.forgotPassword(form.email);
        // No mail provider is wired up, so in development the token comes back
        // in the response and the link is shown here rather than emailed.
        setSent(res.devToken || true);
      } else if (isReset) {
        await api.resetPassword({ token: form.token, newPassword: form.password });
        setSent('done');
      } else {
        await login({
          email: form.email,
          password: form.password,
          ...(needsCode ? { twoFactorCode: form.code } : {}),
        });
        navigate('/');
      }
    } catch (err) {
      if (err.code === 'two_factor_required') {
        setNeedsCode(true);
        setError(null);
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const title = isRegister ? 'Create your account'
    : isForgot ? 'Reset your password'
    : isReset ? 'Choose a new password'
    : needsCode ? 'Two-factor authentication'
    : 'Sign in to your notes';

  return (
    <div className="grid min-h-screen place-items-center bg-subtle px-4">
      {/* Deliberately not animated. An entrance that starts at opacity 0 makes
          the element invisible until the animation runs, and this is the first
          screen of the app — the one place where "invisible until some
          animation finishes" is a real failure rather than a missed flourish.
          Animation is for things that appear after a click, where the tab is
          certainly awake. */}
      <div className="w-full max-w-sm rounded-xl border border-line bg-raised p-8 shadow-card">
        <div className="mb-6 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#fbbc04] text-[#3c4043]">
            {needsCode ? <ShieldIcon width={20} height={20} /> : <NoteIcon width={20} height={20} />}
          </span>
          <div>
            <h1 className="text-lg font-medium leading-tight">Keep Notes</h1>
            <p className="text-xs text-muted">{title}</p>
          </div>
        </div>

        {sent === 'done' ? (
          <div className="text-center">
            <CheckIcon width={32} height={32} className="mx-auto text-emerald-600" />
            <p className="mt-3 text-sm">Your password has been changed.</p>
            <Link to="/login" className="btn-primary mt-4 w-full">Sign in</Link>
          </div>
        ) : sent ? (
          <div>
            <p className="text-sm text-muted">
              If that address has an account, a reset link is on its way.
            </p>
            {typeof sent === 'string' && (
              <div className="mt-4 rounded-lg bg-subtle p-3">
                <p className="text-xs font-medium">Development mode</p>
                <p className="mt-1 text-xs text-muted">
                  No mail provider is configured, so here is the link directly:
                </p>
                <Link
                  to={`/reset-password?token=${sent}`}
                  className="mt-2 block break-all text-xs text-accent underline"
                >
                  Reset your password
                </Link>
              </div>
            )}
            <Link to="/login" className="btn-ghost mt-4 w-full">Back to sign in</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            {isRegister && (
              <input
                className="field"
                placeholder="Your name"
                autoComplete="name"
                required
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
              />
            )}

            {!isReset && !needsCode && (
              <input
                className="field"
                type="email"
                placeholder="Email"
                autoComplete="email"
                required
                value={form.email}
                onChange={(e) => set({ email: e.target.value })}
              />
            )}

            {isReset && (
              <input
                className="field font-mono text-xs"
                placeholder="Reset token"
                required
                value={form.token || new URLSearchParams(window.location.search).get('token') || ''}
                onChange={(e) => set({ token: e.target.value })}
              />
            )}

            {!isForgot && !needsCode && (
              <input
                className="field"
                type="password"
                placeholder={isRegister || isReset ? 'Password (at least 8 characters)' : 'Password'}
                autoComplete={isRegister || isReset ? 'new-password' : 'current-password'}
                required
                minLength={isRegister || isReset ? 8 : undefined}
                value={form.password}
                onChange={(e) => set({ password: e.target.value })}
              />
            )}

            {needsCode && (
              <>
                <p className="text-sm text-muted">
                  Enter the six-digit code from your authenticator app, or one of your
                  recovery codes.
                </p>
                <input
                  className="field text-center font-mono tracking-[0.3em]"
                  placeholder="123456"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  required
                  value={form.code}
                  onChange={(e) => set({ code: e.target.value })}
                />
              </>
            )}

            {error && (
              <p role="alert" className="rounded bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
                {error}
              </p>
            )}

            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? 'Please wait…'
                : isRegister ? 'Create account'
                : isForgot ? 'Send a reset link'
                : isReset ? 'Set the new password'
                : needsCode ? 'Verify'
                : 'Sign in'}
            </button>

            {needsCode && (
              <button
                type="button"
                onClick={() => {
                  setNeedsCode(false);
                  set({ code: '' });
                }}
                className="w-full text-center text-xs text-muted hover:underline"
              >
                Use a different account
              </button>
            )}
          </form>
        )}

        {!sent && !needsCode && (
          <div className="mt-4 space-y-1 text-center text-xs text-muted">
            {!isForgot && !isReset && (
              <p>
                {isRegister ? 'Already have an account? ' : 'No account yet? '}
                <Link to={isRegister ? '/login' : '/register'} className="font-medium text-accent hover:underline">
                  {isRegister ? 'Sign in' : 'Create one'}
                </Link>
              </p>
            )}
            {mode === 'login' && (
              <p>
                <Link to="/forgot-password" className="hover:underline">Forgot your password?</Link>
              </p>
            )}
            {(isForgot || isReset) && (
              <p><Link to="/login" className="hover:underline">Back to sign in</Link></p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
