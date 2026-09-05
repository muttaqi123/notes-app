import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import AuthPage from './pages/AuthPage.jsx';
import NotesPage from './pages/NotesPage.jsx';

/**
 * The route gate. It waits for the session-restore attempt before deciding,
 * so a signed-in user reloading the page does not get bounced to the login
 * screen for the half second it takes the refresh cookie to answer.
 */
function Private({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="grid min-h-screen place-items-center text-sm text-[#5f6368]">Loading…</div>;
  }
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />

      <Route path="/" element={<Private><NotesPage view="active" /></Private>} />
      <Route path="/archive" element={<Private><NotesPage view="archive" /></Private>} />
      <Route path="/trash" element={<Private><NotesPage view="trash" /></Private>} />
      <Route path="/label/:labelId" element={<Private><NotesPage view="active" /></Private>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
