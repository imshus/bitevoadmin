// Builds the full demo database: catalogue, team, 180 days of orders, wallets, sessions and admins.
import bcrypt from 'bcryptjs';
import { ADMINS, createSeedData } from './catalog.js';
import { generateOrders } from './orderHistory.js';
import { objectId } from '../lib/ids.js';
import { DEFAULT_SETTINGS } from '../settings.js';

const DAY = 86400000;
const MIN = 60000;

export async function buildDemoData(now = Date.now()) {
  const base = createSeedData(now);

  // Orders: in-progress ones get a `dueAt` so the demo simulator can deliver them later.
  const orders = generateOrders(now).map(({ customerIndex, etaMins, ...o }) => ({
    ...o,
    ...(o.status === 'out_for_delivery' ? { dueAt: new Date(Date.parse(o.placedAt) + etaMins * MIN).toISOString() } : {}),
    history: [],
  }));

  // Customers: everyone who ordered, plus people who only appear in sessions or wallet credits.
  const customers = new Map();
  const addCustomer = (_id, name, phone, createdAt) => {
    if (!customers.has(_id)) customers.set(_id, { _id, name, phone, createdAt });
  };
  for (const o of orders) addCustomer(o.customerId, o.customerName, o.customerPhone, o.placedAt);
  for (const s of base.sessions) if (s.role === 'customer') addCustomer(s.userId, s.userName, s.identifier, s.loginAt);
  for (const t of base.walletTxns) addCustomer(t.customerId, t.customerName, t.customerPhone, t.at);

  // Wallet transactions: payments, cashback and refunds from orders, plus the admin changes.
  const walletTxns = [...base.walletTxns];
  for (const o of orders) {
    const who = { customerId: o.customerId, customerName: o.customerName, customerPhone: o.customerPhone, orderId: o._id };
    const placed = Date.parse(o.placedAt);
    const add = (type, amount, note, atMs) => {
      if (atMs <= now) walletTxns.push({ _id: objectId(new Date(atMs)), ...who, type, amount, note, at: new Date(atMs).toISOString() });
    };
    if (o.walletUsed) add('payment', -o.walletUsed, `Order ${o.orderNo}`, placed);
    if (o.cashback && o.status === 'delivered') add('cashback', o.cashback, `${o.couponCode} on order ${o.orderNo}`, placed + o.deliveryMins * MIN);
    if (o.refund?.to === 'wallet') add('refund', o.refund.amount, `Cancelled order ${o.orderNo}`, placed + 12 * MIN);
  }

  const admins = await Promise.all(ADMINS.map(async ({ password, ...admin }) => ({
    ...admin,
    passwordHash: await bcrypt.hash(password, 10),
    createdAt: new Date(now - 200 * DAY).toISOString(),
  })));

  return {
    meta: [{ _id: 'demo', seededAt: new Date(now).toISOString(), combosAdded: true }],
    admins,
    categories: base.categories,
    products: base.products,
    coupons: base.coupons,
    agents: base.agents,
    customers: [...customers.values()],
    orders,
    walletTxns,
    sessions: base.sessions,
    loginEvents: base.loginEvents,
    settings: [{ _id: 'app', ...DEFAULT_SETTINGS, updatedAt: new Date(now).toISOString() }],
  };
}
