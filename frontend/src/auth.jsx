import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { auth, setUnauthorizedHandler } from './api/index.js';
import { Loading } from './components/ui.jsx';

const AuthContext = createContext(null);
const HEARTBEAT_MS = 60000;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Set when the session ends without the admin pressing "Sign out" (e.g. revoked on Login status).
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    auth.me()
      .then(setUser, () => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  // Any API call that comes back "not signed in" ends the session here too.
  const userRef = useRef(null);
  userRef.current = user;
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (userRef.current) setNotice('Your session was signed out. Please sign in again.');
      setUser(null);
    });
  }, []);

  // Keeps "last active" fresh; a revoked session answers 401, which signs out via the handler above.
  const check = useCallback(() => {
    auth.heartbeat().catch(() => {});
  }, []);

  const sessionId = user?.sessionId;
  useEffect(() => {
    if (!sessionId) return undefined;
    const timer = setInterval(check, HEARTBEAT_MS);
    window.addEventListener('focus', check);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', check);
    };
  }, [sessionId, check]);

  const value = {
    user,
    loading,
    notice,
    async login(email, password) {
      const admin = await auth.login(email, password);
      setNotice(null);
      setUser(admin);
      return admin;
    },
    async logout() {
      await auth.logout().catch(() => {});
      setUser(null);
    },
    // Re-checks the session, e.g. after revoking sessions on the Login status page.
    refresh: check,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="boot"><Loading label="Loading BiteVo Admin…" /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}
