// Admin sessions: a random token in an httpOnly cookie; only its SHA-256 hash is stored.
import { store } from './db/index.js';
import { config } from './config.js';
import { sha256 } from './lib/ids.js';
import { unauthorized, nowIso, DAY } from './lib/http.js';

const TOUCH_EVERY_MS = 60000; // how often "last active" is written while an admin uses the panel

export async function findSession(req) {
  const token = req.cookies?.[config.cookie.name];
  if (!token) return null;
  const session = await store.findOne('sessions', { tokenHash: sha256(token) });
  if (!session || session.revokedAt) return null;
  if (session.expiresAt && Date.parse(session.expiresAt) < Date.now()) return null;
  const admin = await store.findById('admins', session.userId);
  if (!admin || admin.disabled) return null;
  return { session, admin };
}

export const publicAdmin = (admin, session) => ({
  _id: admin._id,
  name: admin.name,
  email: admin.email,
  role: admin.role,
  sessionId: session._id,
  demoMode: config.demoMode,
});

// Guards every /api route except sign-in.
export async function requireAdmin(req, res, next) {
  const found = await findSession(req);
  if (!found) throw unauthorized();
  req.admin = found.admin;
  req.session = found.session;
  if (Date.now() - Date.parse(found.session.lastActiveAt) > TOUCH_EVERY_MS) {
    await store.update('sessions', found.session._id, { lastActiveAt: nowIso() });
  }
  next();
}

const cookieOptions = () => ({
  httpOnly: true,
  secure: config.cookie.secure,
  sameSite: config.cookie.sameSite,
  path: '/',
});

export function setSessionCookie(res, token) {
  res.cookie(config.cookie.name, token, { ...cookieOptions(), maxAge: config.sessionDays * DAY });
}

export function clearSessionCookie(res) {
  res.clearCookie(config.cookie.name, cookieOptions());
}

// Removes secrets before a session leaves the server.
export const publicSession = ({ tokenHash, ...session }) => session;
