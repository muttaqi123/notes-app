import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { NoteIcon } from '../components/Icons.jsx';

/** Sign in and sign up are the same form with one extra field, so they are one
 *  component. Two nearly identical files drift; one does not. */
export default function AuthPage({ mode = 'login' }) {
  const isRegister = mode === 'register';
  const { user, loading, login, register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (loading) {
    return <div className="grid min-h-screen place-items-center text-sm text-[#5f6368]">Loading…</div>;
  }
  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (isRegister) await register(form);
      else await login({ email: form.email, password: form.password });
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const field = 'w-full rounded border border-black/20 px-3 py-2.5 text-sm outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]';

  return (
    <div className="grid min-h-screen place-items-center bg-[#f1f3f4] px-4">
      <div className="w-full max-w-sm rounded-lg border border-black/10 bg-white p-8 shadow-card">
        <div className="mb-6 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#fbbc04] text-[#3c4043]">
            <NoteIcon width={20} height={20} />
          </span>
          <div>
            <h1 className="text-lg font-medium leading-tight">Keep Notes</h1>
            <p className="text-xs text-[#5f6368]">
              {isRegister ? 'Create your account' : 'Sign in to your notes'}
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {isRegister && (
            <input
              className={field}
              placeholder="Your name"
              autoComplete="name"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          )}
          <input
            className={field}
            type="email"
            placeholder="Email"
            autoComplete="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <input
            className={field}
            type="password"
            placeholder={isRegister ? 'Password (at least 8 characters)' : 'Password'}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            required
            minLength={isRegister ? 8 : undefined}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />

          {error && (
            <p role="alert" className="rounded bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded bg-[#1a73e8] py-2.5 text-sm font-medium text-white transition hover:bg-[#1765cc] disabled:opacity-60"
          >
            {busy ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-[#5f6368]">
          {isRegister ? 'Already have an account? ' : 'No account yet? '}
          <Link
            to={isRegister ? '/login' : '/register'}
            className="font-medium text-[#1a73e8] hover:underline"
          >
            {isRegister ? 'Sign in' : 'Create one'}
          </Link>
        </p>
      </div>
    </div>
  );
}
