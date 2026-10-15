import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { auth } from './api/index.js';

const AuthContext = createContext(null);
const HEARTBEAT_MS = 60000;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => auth.me());
  // Set when the session ends without the admin pressing "Sign out" (e.g. revoked on Login status).
  const [notice, setNotice] = useState(null);

  // Keeps "last active" fresh, and signs out here if the session was revoked elsewhere.
  const check = useCallback(() => {
    if (auth.heartbeat()) return;
    setUser(null);
    setNotice('Your session was signed out. Please sign in again.');
  }, []);

  const sessionId = user?.sessionId;
  useEffect(() => {
    if (!sessionId) return undefined;
    check();
    const timer = setInterval(check, HEARTBEAT_MS);
    window.addEventListener('focus', check);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', check);
    };
  }, [sessionId, check]);

  const value = {
    user,
    notice,
    async login(email, password) {
      const admin = await auth.login(email, password);
      setNotice(null);
      setUser(admin);
      return admin;
    },
    async logout() {
      await auth.logout();
      setUser(null);
    },
    // Re-reads the session, e.g. after revoking sessions on the Login status page.
    refresh: check,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export function RequireAuth({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}
