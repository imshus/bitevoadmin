import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { store } from '../db/index.js';
import { config } from '../config.js';
import { randomToken, sha256 } from '../lib/ids.js';
import { unauthorized, nowIso, DAY } from '../lib/http.js';
import { deviceName, clientIp } from '../lib/rules.js';
import { findSession, requireAdmin, publicAdmin, setSessionCookie, clearSessionCookie } from '../auth.js';

export const router = Router();

// Compared against when the email is unknown, so both cases take the same time.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Please wait 15 minutes and try again.' },
});

router.post('/login', loginLimiter, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const admin = email ? await store.findOne('admins', { email }) : null;
  const passwordOk = await bcrypt.compare(password, admin?.passwordHash || DUMMY_HASH);
  const ok = Boolean(admin && !admin.disabled && passwordOk);

  const at = nowIso();
  const device = deviceName(req.get('user-agent'));
  const ip = clientIp(req);
  await store.insert('loginEvents', {
    userId: admin?._id ?? null, userName: admin?.name ?? 'Unknown', role: 'admin', identifier: email,
    platform: 'web', device, ip, success: ok, reason: ok ? null : admin ? 'Wrong password' : 'Unknown email', at,
  });
  if (!ok) throw unauthorized('Incorrect email or password.');

  const token = randomToken();
  const session = await store.insert('sessions', {
    userId: admin._id, userName: admin.name, role: 'admin', identifier: admin.email,
    platform: 'web', device, ip, loginAt: at, lastActiveAt: at, revokedAt: null,
    expiresAt: new Date(Date.now() + config.sessionDays * DAY).toISOString(),
    tokenHash: sha256(token),
  });
  setSessionCookie(res, token);
  res.json(publicAdmin(admin, session));
});

router.get('/me', async (req, res) => {
  const found = await findSession(req);
  if (!found) throw unauthorized('Not signed in.');
  res.json(publicAdmin(found.admin, found.session));
});

router.post('/heartbeat', requireAdmin, async (req, res) => {
  await store.update('sessions', req.session._id, { lastActiveAt: nowIso() });
  res.json({ ok: true });
});

router.post('/logout', async (req, res) => {
  const found = await findSession(req);
  if (found) await store.update('sessions', found.session._id, { revokedAt: nowIso() });
  clearSessionCookie(res);
  res.status(204).end();
});
