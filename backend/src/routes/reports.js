// Analytics and the dashboard summary, computed from the orders collection.
import { Router } from 'express';
import { store } from '../db/index.js';
import { computeAnalytics } from '../analytics.js';
import { badRequest, startOfToday, DAY } from '../lib/http.js';
import { couponStatus, LIVE_STATUSES } from '../lib/rules.js';

// Orders from the start of the previous period up to now (enough for "vs previous period").
async function ordersForRange(days, now) {
  const since = new Date(startOfToday(now) - (2 * days - 1) * DAY).toISOString();
  return store.find('orders', { placedAt: { $gte: since } }, { sort: { placedAt: 1 } });
}

export const analytics = Router();

analytics.get('/', async (req, res) => {
  const days = Number(req.query.days) || 30;
  if (!(Number.isInteger(days) && days >= 1 && days <= 365)) throw badRequest('Pick a range between 1 and 365 days.');
  const now = Date.now();
  const [orders, categories] = await Promise.all([ordersForRange(days, now), store.find('categories', {}, { sort: { order: 1 } })]);
  res.json(computeAnalytics(orders, days, now, categories));
});

export const dashboard = Router();

dashboard.get('/', async (req, res) => {
  const now = Date.now();
  const [orders, categories, agents, coupons, products, failed] = await Promise.all([
    ordersForRange(7, now),
    store.find('categories'),
    store.find('agents'),
    store.find('coupons'),
    store.find('products', { isAvailable: false }),
    store.count('loginEvents', { success: false, at: { $gte: new Date(now - DAY).toISOString() } }),
  ]);
  const today = computeAnalytics(orders, 1, now, categories);
  const week = computeAnalytics(orders, 7, now, categories);
  const active = c => couponStatus(c, now) === 'active';

  res.json({
    today: today.current,
    yesterday: today.previous,
    week: week.daily,
    liveOrders: orders.filter(o => LIVE_STATUSES.includes(o.status)).length,
    recentOrders: orders.slice(-6).reverse(),
    agents: {
      online: agents.filter(a => a.isActive && a.status === 'online').length,
      busy: agents.filter(a => a.isActive && a.status === 'busy').length,
      total: agents.filter(a => a.isActive && a.kycStatus === 'verified').length,
    },
    activeCoupons: coupons.filter(active).length,
    attention: {
      newOrders: orders.filter(o => o.status === 'placed').length,
      outOfStock: products.map(p => p.name),
      pendingKyc: agents.filter(a => a.kycStatus === 'pending').map(a => a.name),
      expiringCoupons: coupons.filter(c => active(c) && Date.parse(c.expiresAt) - now < 7 * DAY).map(c => c.code),
      failedLogins: failed,
    },
  });
});
