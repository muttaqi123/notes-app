import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useNotes } from '../hooks/useNotes.js';
import { useNotifications } from '../hooks/useNotifications.js';
import Shell from '../components/Shell.jsx';
import Avatar from '../components/Avatar.jsx';
import Modal from '../components/Modal.jsx';
import { ShieldIcon, DownloadIcon, SunIcon, MoonIcon, SparkIcon, CheckIcon } from '../components/Icons.jsx';

function Section({ title, description, children }) {
  return (
    <section className="card mb-4 p-5">
      <h2 className="text-base font-medium">{title}</h2>
      {description && <p className="mb-4 mt-0.5 text-sm text-muted">{description}</p>}
      {children}
    </section>
  );
}

function Row({ label, hint, children }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-line py-3 first:border-0 first:pt-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm">{label}</p>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

/** Turning on two-factor: a QR code, then a code typed back to prove it works,
 *  then the backup codes shown exactly once. */
function TwoFactorSetup({ onDone, onClose }) {
  const [step, setStep] = useState('scan');
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.twoFactorSetup().then(setSetup).catch((err) => setError(err.message));
  }, []);

  const confirm = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.twoFactorConfirm(code.trim());
      setBackupCodes(res.backupCodes);
      setStep('codes');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={step === 'codes' ? onDone : onClose} label="Set up two-factor authentication" width="max-w-md">
      <div className="p-5">
        {step === 'scan' && (
          <>
            <h2 className="text-base font-medium">Two-factor authentication</h2>
            <p className="mt-1 text-sm text-muted">
              Scan this with Google Authenticator, 1Password, or any authenticator app,
              then type the six-digit code it shows.
            </p>

            {setup ? (
              <>
                <div className="my-4 grid place-items-center">
                  <img src={setup.qr} alt="Two-factor QR code" width={200} height={200} className="rounded bg-white p-2" />
                </div>
                <details className="mb-4">
                  <summary className="cursor-pointer text-xs text-muted">Can’t scan it?</summary>
                  <p className="mt-2 break-all rounded bg-subtle p-2 font-mono text-xs">{setup.secret}</p>
                </details>
              </>
            ) : (
              <div className="skeleton my-4 h-52" />
            )}

            <form onSubmit={confirm} className="flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                inputMode="numeric"
                autoComplete="one-time-code"
                className="field flex-1 text-center font-mono tracking-[0.3em]"
              />
              <button type="submit" disabled={busy || !setup} className="btn-primary">
                {busy ? '…' : 'Turn on'}
              </button>
            </form>

            {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}

            <p className="mt-4 text-xs text-faint">
              Nothing changes until that code checks out — if you lose the phone now,
              you can still sign in with your password.
            </p>
          </>
        )}

        {step === 'codes' && (
          <>
            <div className="mb-3 flex items-center gap-2">
              <CheckIcon width={20} height={20} className="text-emerald-600" />
              <h2 className="text-base font-medium">Two-factor is on</h2>
            </div>
            <p className="text-sm text-muted">
              Save these recovery codes somewhere safe. Each one signs you in once if you
              lose your phone — and this is the only time they are shown.
            </p>
            <ul className="my-4 grid grid-cols-2 gap-2 rounded-lg bg-subtle p-3 font-mono text-sm">
              {backupCodes.map((c) => <li key={c}>{c}</li>)}
            </ul>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-ghost flex-1"
                onClick={() => navigator.clipboard?.writeText(backupCodes.join('\n'))}
              >
                Copy codes
              </button>
              <button type="button" className="btn-primary flex-1" onClick={onDone}>
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

export default function SettingsPage() {
  const { user, updateSettings, logout } = useAuth();
  const { preference, setPreference } = useTheme();
  const { toast } = useToast();
  const { labels, query, setQuery, connected } = useNotes({ view: 'active' });
  const notifications = useNotifications();

  const [twoFactor, setTwoFactor] = useState({ enabled: false, backupCodesRemaining: 0 });
  const [settingUp2fa, setSettingUp2fa] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const [error, setError] = useState(null);

  const refresh = () => {
    api.twoFactorStatus().then(setTwoFactor).catch(() => {});
    api.sessions().then((r) => setSessions(r.sessions)).catch(() => {});
  };

  useEffect(refresh, []);

  const save = async (patch) => {
    try {
      await updateSettings(patch);
      toast({ message: 'Saved' });
    } catch (err) {
      toast({ message: err.message, tone: 'danger' });
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await api.changePassword(passwords);
      toast({ message: 'Password changed — signing you out everywhere', tone: 'success' });
      setPasswords({ currentPassword: '', newPassword: '' });
      setTimeout(() => logout(), 1200);
    } catch (err) {
      setError(err.message);
    }
  };

  const disable2fa = async () => {
    const password = window.prompt('Enter your password to turn two-factor off');
    if (!password) return;
    try {
      await api.twoFactorDisable(password);
      toast({ message: 'Two-factor turned off' });
      refresh();
    } catch (err) {
      toast({ message: err.message, tone: 'danger' });
    }
  };

  const select = 'rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink';

  return (
    <Shell
      query={query}
      setQuery={setQuery}
      labels={labels}
      onManageLabels={() => {}}
      notifications={notifications}
      onOpenPalette={() => {}}
      onOpenNoteById={() => {}}
      connected={connected}
    >
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-2xl font-medium">Settings</h1>

        <Section title="Account">
          <div className="flex items-center gap-3 pb-3">
            <Avatar user={user} size={44} />
            <div>
              <p className="text-sm font-medium">{user?.name}</p>
              <p className="text-xs text-muted">{user?.email}</p>
            </div>
          </div>
          <Row label="Display name">
            <input
              defaultValue={user?.name}
              onBlur={(e) => e.target.value.trim() !== user?.name && save({ name: e.target.value.trim() })}
              className="field w-48"
            />
          </Row>
        </Section>

        <Section title="Appearance">
          <Row label="Theme" hint="“System” follows your device.">
            <div className="flex gap-1 rounded-lg bg-subtle p-1">
              {[
                { key: 'light', icon: SunIcon, label: 'Light' },
                { key: 'dark', icon: MoonIcon, label: 'Dark' },
                { key: 'system', icon: SparkIcon, label: 'System' },
              ].map(({ key, icon: Icon, label }) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={preference === key}
                  onClick={() => {
                    setPreference(key);
                    save({ theme: key });
                  }}
                  className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs transition-colors ${
                    preference === key ? 'bg-raised font-medium text-ink shadow-card' : 'text-muted'
                  }`}
                >
                  <Icon width={14} height={14} /> {label}
                </button>
              ))}
            </div>
          </Row>

          <Row label="Sort notes by" hint="“Manual” lets you drag cards into the order you want.">
            <select
              value={user?.settings?.sort || 'updated'}
              onChange={(e) => save({ sort: e.target.value })}
              className={select}
            >
              <option value="updated">Last edited</option>
              <option value="created">Date created</option>
              <option value="title">Title</option>
              <option value="manual">Manual</option>
            </select>
          </Row>
        </Section>

        <Section title="Security">
          <Row
            label={
              <span className="flex items-center gap-2">
                <ShieldIcon width={16} height={16} className="text-muted" />
                Two-factor authentication
              </span>
            }
            hint={
              twoFactor.enabled
                ? `On · ${twoFactor.backupCodesRemaining} recovery codes left`
                : 'A code from your phone, as well as your password.'
            }
          >
            {twoFactor.enabled ? (
              <button type="button" onClick={disable2fa} className="btn-ghost">Turn off</button>
            ) : (
              <button type="button" onClick={() => setSettingUp2fa(true)} className="btn-primary">
                Turn on
              </button>
            )}
          </Row>

          <form onSubmit={changePassword} className="border-t border-line pt-3">
            <p className="mb-2 text-sm">Change password</p>
            <div className="flex flex-wrap gap-2">
              <input
                type="password"
                required
                autoComplete="current-password"
                placeholder="Current password"
                value={passwords.currentPassword}
                onChange={(e) => setPasswords((p) => ({ ...p, currentPassword: e.target.value }))}
                className="field flex-1"
              />
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="New password"
                value={passwords.newPassword}
                onChange={(e) => setPasswords((p) => ({ ...p, newPassword: e.target.value }))}
                className="field flex-1"
              />
              <button type="submit" className="btn-primary">Change</button>
            </div>
            <p className="mt-1.5 text-xs text-faint">
              Changing it signs out every device, including this one.
            </p>
            {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
          </form>
        </Section>

        <Section title="Signed-in devices" description="Each one holds its own refresh token, so you can end one without ending the rest.">
          <ul>
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center gap-3 border-t border-line py-2 first:border-0">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">
                    {s.userAgent.split(')')[0].replace(/^Mozilla\/[\d.]+ \(/, '') || 'Unknown device'}
                  </span>
                  <span className="text-xs text-muted">
                    since {new Date(s.createdAt).toLocaleDateString()}
                    {s.current && ' · this device'}
                  </span>
                </span>
                {!s.current && (
                  <button
                    type="button"
                    className="btn-ghost px-3 py-1 text-xs"
                    onClick={async () => {
                      await api.revokeSession(s.id);
                      refresh();
                    }}
                  >
                    Sign out
                  </button>
                )}
              </li>
            ))}
            {sessions.length === 0 && <li className="py-2 text-sm text-muted">No other devices.</li>}
          </ul>
        </Section>

        <Section
          title="Your data"
          description="A notes app that cannot hand back what you wrote is a place your writing is trapped."
        >
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost" onClick={() => api.download('json')}>
              <DownloadIcon width={16} height={16} /> Export as JSON
            </button>
            <button type="button" className="btn-ghost" onClick={() => api.download('markdown')}>
              <DownloadIcon width={16} height={16} /> Export as Markdown
            </button>
          </div>
          <p className="mt-2 text-xs text-faint">
            JSON is the faithful copy. Markdown is the readable one — it works because
            your notes were stored as markdown all along.
          </p>
        </Section>
      </div>

      {settingUp2fa && (
        <TwoFactorSetup
          onClose={() => setSettingUp2fa(false)}
          onDone={() => {
            setSettingUp2fa(false);
            refresh();
          }}
        />
      )}
    </Shell>
  );
}
