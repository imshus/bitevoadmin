// Simulated order history (dummy data) that powers Analytics, coupon usage and agent stats.
// Each calendar day is generated from its own seed, so past days never change between reloads.
// Once the backend is connected, this whole file is replaced by real orders from MongoDB.
import { SEED_PRODUCTS, SEED_COUPONS, SEED_AGENTS, customerId, customerName } from './seed.js';
import { rng, hashString, between, intBetween, weighted, wobble } from '../lib/random.js';

export const HISTORY_DAYS = 180;
export const ON_TIME_MINS = 35;
const FREE_DELIVERY_ABOVE = 499;
const DELIVERY_FEE = 30;
const PREP_MINS = 15;
const EXISTING_CUSTOMERS = 220; // customers who had already ordered before the history starts

const HOURS = [[8, 2], [9, 3], [10, 3], [11, 5], [12, 10], [13, 12], [14, 9], [15, 4], [16, 3], [17, 4], [18, 6], [19, 10], [20, 13], [21, 12], [22, 7], [23, 3]];
const ITEM_COUNTS = [[1, 55], [2, 32], [3, 13]];
const PAYMENTS = [['UPI', 58], ['Card', 16], ['Cash on delivery', 26]];

const startOfDay = t => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d;
};
const dateKey = d => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const hex = (n, len) => (n >>> 0).toString(16).padStart(len, '0').slice(-len);

export function discountFor(coupon, subtotal, deliveryFee) {
  if (coupon.discountType === 'percent') {
    return Math.min(Math.round((subtotal * coupon.discountValue) / 100), coupon.maxDiscount ?? Infinity);
  }
  if (coupon.discountType === 'flat') return Math.min(coupon.discountValue, subtotal);
  return deliveryFee; // free_delivery
}

function generateDay(dayStart, daysAgo) {
  const key = dateKey(dayStart);
  const r = rng(hashString(`bitevo-orders-${key}`));
  const dow = dayStart.getDay();
  const growth = 0.6 + 0.4 * (1 - daysAgo / HISTORY_DAYS);
  const weekday = dow === 0 || dow === 6 ? 1.3 : dow === 5 ? 1.12 : 1;
  const count = Math.round(62 * growth * weekday * between(r, 0.85, 1.15));
  const customerPool = Math.floor(EXISTING_CUSTOMERS + 980 * (1 - daysAgo / HISTORY_DAYS));

  const agents = SEED_AGENTS.filter(a => a.kycStatus === 'verified' && a.joined > daysAgo && (a.isActive || daysAgo > 10));
  const coupons = SEED_COUPONS.filter(c => c.share > 0 && c.from <= -daysAgo && -daysAgo <= c.to);

  const orders = [];
  for (let i = 0; i < count; i++) {
    const hour = weighted(r, HOURS, h => h[1])[0];
    const placedAt = new Date(dayStart.getTime() + hour * 3600000 + intBetween(r, 0, 3599) * 1000);

    const itemCount = weighted(r, ITEM_COUNTS, x => x[1])[0];
    const items = [];
    while (items.length < itemCount) {
      const p = weighted(r, SEED_PRODUCTS, x => x.popularity);
      if (items.some(it => it.productId === p._id)) continue;
      items.push({ productId: p._id, name: p.name, category: p.category, price: p.price, qty: r() < 0.82 ? 1 : 2 });
    }
    const subtotal = items.reduce((s, it) => s + it.price * it.qty, 0);
    const deliveryFee = subtotal >= FREE_DELIVERY_ABOVE ? 0 : DELIVERY_FEE;

    let couponCode = null;
    let discount = 0;
    if (coupons.length && r() < 0.34) {
      const c = weighted(r, coupons, x => x.share);
      if (subtotal >= c.minOrderValue) {
        couponCode = c.code;
        discount = discountFor(c, subtotal, deliveryFee);
      }
    }

    const agent = agents[Math.floor(r() * agents.length)];
    const cancelled = r() < 0.065;
    const rush = hour >= 19 && hour <= 21 ? 4 : 0;
    const deliveryMins = Math.max(14, Math.round(agent.speed + rush + wobble(r) * 9));
    const rated = r() < 0.55;
    const rating = Math.min(5, Math.max(1, Math.round(4.7 - (agent.speed - 25) / 10 + wobble(r) * 1.3)));
    const c = Math.floor(Math.pow(r(), 1.5) * customerPool);

    orders.push({
      placedAt: placedAt.toISOString(),
      customerId: customerId(c),
      customerName: customerName(c),
      customerIndex: c,
      items,
      subtotal,
      deliveryFee,
      discount,
      couponCode,
      total: subtotal + deliveryFee - discount,
      paymentMethod: weighted(r, PAYMENTS, x => x[1])[0],
      status: cancelled ? 'cancelled' : 'delivered',
      agentId: cancelled ? null : agent._id,
      agentName: cancelled ? null : agent.name,
      zone: agent.zone,
      deliveryMins: cancelled ? null : deliveryMins,
      rating: !cancelled && rated ? rating : null,
    });
  }

  orders.sort((a, b) => a.placedAt.localeCompare(b.placedAt));
  const mmdd = `${String(dayStart.getMonth() + 1).padStart(2, '0')}${String(dayStart.getDate()).padStart(2, '0')}`;
  orders.forEach((o, i) => {
    o._id = hex(Date.parse(o.placedAt) / 1000, 8) + hex(hashString(key), 8) + hex(i, 8);
    o.orderNo = `BV${mmdd}-${String(i + 1).padStart(3, '0')}`;
  });
  return orders;
}

let cache = { key: null, all: [] };

function buildHistory(today) {
  const all = [];
  for (let d = HISTORY_DAYS - 1; d >= 0; d--) {
    const dayStart = new Date(today);
    dayStart.setDate(today.getDate() - d);
    all.push(...generateDay(dayStart, d));
  }
  // Flag each customer's first (non-cancelled) order so analytics can count new customers.
  const seen = new Set();
  for (const o of all) {
    o.isFirstOrder = false;
    if (o.status === 'cancelled' || o.customerIndex < EXISTING_CUSTOMERS || seen.has(o.customerId)) continue;
    seen.add(o.customerId);
    o.isFirstOrder = true;
  }
  return all;
}

// All orders placed up to `now`, oldest first. Today's most recent orders are still in progress.
export function getOrders(now = Date.now()) {
  const today = startOfDay(now);
  const key = dateKey(today);
  if (cache.key !== key) cache = { key, all: buildHistory(today) };

  const result = [];
  for (const o of cache.all) {
    const t = Date.parse(o.placedAt);
    if (t > now) break;
    const age = (now - t) / 60000;
    if (o.status === 'delivered' && age < o.deliveryMins) {
      result.push({ ...o, status: age < PREP_MINS ? 'preparing' : 'out_for_delivery', deliveryMins: null, rating: null });
    } else {
      result.push(o);
    }
  }
  return result;
}
