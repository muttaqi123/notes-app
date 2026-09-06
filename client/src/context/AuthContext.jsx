import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, setAccessToken } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // `loading` starts true so the app never flashes the login screen before it
  // has had a chance to restore an existing session from the refresh cookie.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { user: restored } = await api.restoreSession();
        if (!cancelled) setUser(restored);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      async login(credentials) {
        const res = await api.login(credentials);
        setAccessToken(res.accessToken);
        setUser(res.user);
        return res.user;
      },
      async register(details) {
        const res = await api.register(details);
        setAccessToken(res.accessToken);
        setUser(res.user);
        return res.user;
      },
      async logout() {
        try {
          await api.logout();
        } finally {
          setAccessToken(null);
          setUser(null);
        }
      },
      /** Settings live on the account, so the change is reflected everywhere
       *  the user is signed in rather than only in this browser. */
      async updateSettings(patch) {
        const { user: updated } = await api.updateSettings(patch);
        setUser(updated);
        return updated;
      },
      setUser,
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside an AuthProvider');
  return ctx;
}
