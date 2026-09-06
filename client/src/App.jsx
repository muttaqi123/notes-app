import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import AuthPage from './pages/AuthPage.jsx';
import NotesPage from './pages/NotesPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import Toaster from './components/Toaster.jsx';

// Insights pulls in the charting library, which is a third of the bundle and
// is needed by exactly one screen. Loading it on demand keeps it off the
// critical path for everyone who never opens it.
const InsightsPage = lazy(() => import('./pages/InsightsPage.jsx'));

/**
 * The route gate. It waits for the session-restore attempt before deciding, so
 * a signed-in user reloading the page is not bounced to the login screen for
 * the half second it takes the refresh cookie to answer.
 */
function Private({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="grid min-h-screen place-items-center bg-app text-sm text-muted">Loading…</div>;
  }
  return user ? children : <Navigate to="/login" replace />;
}

const guard = (element) => <Private>{element}</Private>;

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route path="/forgot-password" element={<AuthPage mode="forgot" />} />
        <Route path="/reset-password" element={<AuthPage mode="reset" />} />

        <Route path="/" element={guard(<NotesPage view="active" />)} />
        <Route path="/reminders" element={guard(<NotesPage view="reminders" />)} />
        <Route path="/shared" element={guard(<NotesPage view="shared" />)} />
        <Route path="/archive" element={guard(<NotesPage view="archive" />)} />
        <Route path="/trash" element={guard(<NotesPage view="trash" />)} />
        <Route path="/label/:labelId" element={guard(<NotesPage view="active" />)} />
        <Route
          path="/insights"
          element={guard(
            <Suspense
              fallback={
                <div className="grid min-h-screen place-items-center bg-app text-sm text-muted">
                  Loading insights…
                </div>
              }
            >
              <InsightsPage />
            </Suspense>
          )}
        />
        <Route path="/settings" element={guard(<SettingsPage />)} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </>
  );
}
