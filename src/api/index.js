// The admin panel's single data API. Every page goes through these async functions.
//
// Right now they run against dummy data kept in localStorage (db.js) plus a simulated
// order history (orders.js). To connect MongoDB, keep these function names and return
// shapes and swap each body for a call to the BiteVo backend, e.g.
//   products.list()        ->  GET    /api/products
//   products.create(data)  ->  POST   /api/products
//   products.update(id, p) ->  PATCH  /api/products/:id
//   products.remove(id)    ->  DELETE /api/products/:id
// The pages won't need to change.
import { db } from './db.js';
import { ADMINS, CATEGORIES, ZONES, VEHICLES } from './seed.js';
import { getOrders } from './orders.js';
import { computeAnalytics, agentStats, couponUsage } from './analytics.js';
import { objectId } from '../lib/random.js';
import { couponStatus } from '../lib/status.js';

export { CATEGORIES, ZONES, VEHICLES };

const DAY = 86400000;
const LATENCY = 120; // pretend network delay, so loading states are exercised
const wait = () => new Promise(resolve => setTimeout(resolve, LATENCY));
const copy = value => structuredClone(value);
const nowIso = () => new Date().toISOString();

export class ApiError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function collection(name, validate) {
  const docs = () => db.all(name);
  const find = id => {
    const doc = docs().find(d => d._id === id);
    if (!doc) throw new ApiError('This record no longer exists.', 404);
    return doc;
  };
  return {
    async list() {
      await wait();
      return copy(docs());
    },
    async create(data) {
      await wait();
      validate(data, null, docs());
      const now = nowIso();
      const doc = { ...data, _id: objectId(), createdAt: now, updatedAt: now };
      db.replace(name, [doc, ...docs()]);
      return copy(doc);
    },
    async update(id, patch) {
      await wait();
      const next = { ...find(id), ...patch, _id: id, updatedAt: nowIso() };
      validate(next, id, docs());
      db.replace(name, docs().map(d => (d._id === id ? next : d)));
      return copy(next);
    },
    async remove(id) {
      await wait();
      find(id);
      db.replace(name, docs().filter(d => d._id !== id));
    },
  };
}

// Server-side style checks (the forms also validate, but the API has the final say).
function validateProduct(p) {
  if (!p.name?.trim()) throw new ApiError('Product name is required.');
  if (!CATEGORIES.some(c => c.key === p.category)) throw new ApiError('Pick a valid category.');
  if (!(p.price > 0)) throw new ApiError('Price must be more than ₹0.');
}

function validateCoupon(c, id, all) {
  if (!/^[A-Z0-9]{3,20}$/.test(c.code || '')) throw new ApiError('Code must be 3–20 capital letters or digits.');
  if (all.some(x => x._id !== id && x.code === c.code)) throw new ApiError(`A coupon with code ${c.code} already exists.`, 409);
  if (c.discountType === 'percent' && !(c.discountValue > 0 && c.discountValue <= 100)) throw new ApiError('Percentage must be between 1 and 100.');
  if (c.discountType === 'flat' && !(c.discountValue > 0)) throw new ApiError('Discount amount must be more than ₹0.');
  if (c.startsAt && c.expiresAt && c.expiresAt <= c.startsAt) throw new ApiError('Expiry must be after the start date.');
}

function validateAgent(a, id, all) {
  if (!a.name?.trim()) throw new ApiError('Name is required.');
  const digits = (a.phone || '').replace(/\D/g, '');
  if (digits.length < 10) throw new ApiError('Enter a valid 10-digit phone number.');
  if (all.some(x => x._id !== id && x.phone.replace(/\D/g, '').slice(-10) === digits.slice(-10))) {
    throw new ApiError('Another agent already uses this phone number.', 409);
  }
}

export const products = collection('products', validateProduct);

const couponBase = collection('coupons', validateCoupon);
export const coupons = {
  ...couponBase,
  // Adds `usedCount` (how many orders used each code).
  async list() {
    const list = await couponBase.list();
    const usage = couponUsage(getOrders());
    return list.map(c => ({ ...c, usedCount: usage[c.code] || 0 }));
  },
};

// Signs a user out of every device (used when an agent is suspended or removed).
function revokeSessionsOf(userId) {
  const at = nowIso();
  db.replace('sessions', db.all('sessions').map(s => (s.userId === userId && !s.revokedAt ? { ...live(s), revokedAt: at } : s)));
}

const agentBase = collection('agents', validateAgent);
export const agents = {
  ...agentBase,
  async update(id, patch) {
    const doc = await agentBase.update(id, patch);
    if (!doc.isActive) revokeSessionsOf(id);
    return doc;
  },
  async remove(id) {
    await agentBase.remove(id);
    revokeSessionsOf(id);
  },
  // Adds `stats` for the last 30 days: deliveries, average time, on-time rate, rating.
  async list() {
    const list = await agentBase.list();
    const since = Date.now() - 30 * DAY;
    const stats = new Map(agentStats(getOrders().filter(o => Date.parse(o.placedAt) >= since)).map(s => [s.agentId, s]));
    return list.map(a => ({ ...a, stats: stats.get(a._id) || null }));
  },
};

// Seed sessions and login events are stored relative to when the demo data was created;
// shifting them by the time since then keeps "last active" values current.
const TIME_FIELDS = ['loginAt', 'lastActiveAt', 'revokedAt', 'at'];
function live(doc) {
  if (!doc.seed) return doc;
  const drift = Date.now() - db.seededAt();
  const out = { ...doc };
  for (const f of TIME_FIELDS) if (out[f]) out[f] = new Date(Date.parse(out[f]) + drift).toISOString();
  delete out.seed;
  return out;
}
const byNewest = field => (a, b) => b[field].localeCompare(a[field]);

export const sessions = {
  async list() {
    await wait();
    return copy(db.all('sessions').map(live).sort(byNewest('lastActiveAt')));
  },
  async revoke(id) {
    await wait();
    const found = db.all('sessions').find(s => s._id === id);
    if (!found) throw new ApiError('This session no longer exists.', 404);
    const next = { ...live(found), revokedAt: nowIso() };
    db.replace('sessions', db.all('sessions').map(s => (s._id === id ? next : s)));
    return copy(next);
  },
};

export const loginEvents = {
  async list() {
    await wait();
    return copy(db.all('loginEvents').map(live).sort(byNewest('at')));
  },
};

// ---- Admin sign-in -------------------------------------------------------------
// Demo only: the real check must happen on the server (hashed passwords, httpOnly cookie).
const AUTH_KEY = 'bitevo-admin-auth';

function readAuth() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY)); } catch { return null; }
}
function writeAuth(value) {
  try {
    if (value) localStorage.setItem(AUTH_KEY, JSON.stringify(value));
    else localStorage.removeItem(AUTH_KEY);
  } catch { /* storage blocked */ }
}

function browserName() {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'unknown OS';
  return `${browser} on ${os}`;
}

const publicAdmin = (admin, sessionId) => ({ _id: admin._id, name: admin.name, email: admin.email, role: admin.role, sessionId });

function currentSession() {
  const auth = readAuth();
  if (!auth) return null;
  const session = db.all('sessions').find(s => s._id === auth.sessionId);
  const admin = session && ADMINS.find(a => a._id === session.userId);
  if (!session || session.revokedAt || !admin) {
    writeAuth(null);
    return null;
  }
  return { session, admin };
}

export const auth = {
  async login(email, password) {
    await wait();
    const typed = email.trim().toLowerCase();
    const admin = ADMINS.find(a => a.email === typed);
    const ok = Boolean(admin && admin.password === password);
    const at = nowIso();
    const device = browserName();
    db.replace('loginEvents', [{
      _id: objectId(), userId: admin?._id ?? null, userName: admin?.name ?? 'Unknown', role: 'admin',
      identifier: typed, platform: 'web', device, ip: null,
      success: ok, reason: ok ? null : admin ? 'Wrong password' : 'Unknown email', at,
    }, ...db.all('loginEvents')]);
    if (!ok) throw new ApiError('Incorrect email or password.', 401);

    const session = {
      _id: objectId(), userId: admin._id, userName: admin.name, role: 'admin', identifier: admin.email,
      platform: 'web', device, ip: null, loginAt: at, lastActiveAt: at, revokedAt: null,
    };
    db.replace('sessions', [session, ...db.all('sessions')]);
    writeAuth({ sessionId: session._id });
    return publicAdmin(admin, session._id);
  },

  // Returns the signed-in admin, or null if signed out or the session was revoked.
  me() {
    const current = currentSession();
    return current ? publicAdmin(current.admin, current.session._id) : null;
  },

  // Marks the current session as active now. Returns false if it has been revoked.
  heartbeat() {
    const current = currentSession();
    if (!current) return false;
    const id = current.session._id;
    db.replace('sessions', db.all('sessions').map(s => (s._id === id ? { ...s, lastActiveAt: nowIso() } : s)));
    return true;
  },

  async logout() {
    const current = currentSession();
    if (current) {
      const id = current.session._id;
      db.replace('sessions', db.all('sessions').map(s => (s._id === id ? { ...s, revokedAt: nowIso() } : s)));
    }
    writeAuth(null);
  },
};

// ---- Reports -----------------------------------------------------------------------

export const analytics = {
  async get(days) {
    await wait();
    return computeAnalytics(getOrders(), days);
  },
};

export const dashboard = {
  async summary() {
    await wait();
    const now = Date.now();
    const orders = getOrders(now);
    const today = computeAnalytics(orders, 1, now);
    const week = computeAnalytics(orders, 7, now);
    const agentList = db.all('agents');
    const couponList = db.all('coupons');
    const failedLogins = db.all('loginEvents').map(live).filter(e => !e.success && now - Date.parse(e.at) < DAY);

    return copy({
      today: today.current,
      yesterday: today.previous,
      week: week.daily,
      liveOrders: orders.filter(o => o.status === 'preparing' || o.status === 'out_for_delivery').length,
      recentOrders: orders.slice(-6).reverse(),
      agents: {
        online: agentList.filter(a => a.isActive && a.status === 'online').length,
        busy: agentList.filter(a => a.isActive && a.status === 'busy').length,
        total: agentList.filter(a => a.isActive && a.kycStatus === 'verified').length,
      },
      activeCoupons: couponList.filter(c => couponStatus(c, now).key === 'active').length,
      attention: {
        outOfStock: db.all('products').filter(p => !p.isAvailable).map(p => p.name),
        pendingKyc: agentList.filter(a => a.kycStatus === 'pending').map(a => a.name),
        expiringCoupons: couponList
          .filter(c => couponStatus(c, now).key === 'active' && Date.parse(c.expiresAt) - now < 7 * DAY)
          .map(c => c.code),
        failedLogins: failedLogins.length,
      },
    });
  },
};

export function resetDemoData() {
  db.reset();
  writeAuth(null);
}
