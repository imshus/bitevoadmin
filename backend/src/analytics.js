// Turns a list of orders into the numbers shown on the Dashboard and Analytics pages.

const DAY = 86400000;
export const ON_TIME_MINS = 35;
const sum = (list, f) => list.reduce((s, x) => s + f(x), 0);
const avg = (list, f) => (list.length ? sum(list, f) / list.length : 0);
const isPaid = o => o.status !== 'cancelled';

export function summarize(list) {
  const valid = list.filter(isPaid);
  const delivered = valid.filter(o => o.status === 'delivered');
  const revenue = sum(valid, o => o.total);
  return {
    revenue,
    orders: valid.length,
    placed: list.length,
    cancelled: list.length - valid.length,
    aov: valid.length ? revenue / valid.length : 0,
    customers: new Set(valid.map(o => o.customerId)).size,
    newCustomers: valid.filter(o => o.isFirstOrder).length,
    discounts: sum(valid, o => o.discount + (o.cashback || 0)),
    couponOrders: valid.filter(o => o.couponCode).length,
    avgDeliveryMins: avg(delivered, o => o.deliveryMins),
    onTimeRate: delivered.length ? delivered.filter(o => o.deliveryMins <= ON_TIME_MINS).length / delivered.length : 0,
    cancelRate: list.length ? (list.length - valid.length) / list.length : 0,
  };
}

const startOfDay = t => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const between = (orders, from, to) =>
  orders.filter(o => {
    const t = Date.parse(o.placedAt);
    return t >= from && t <= to;
  });

// `days` = 1 means today so far, 7 = the last 7 days including today, and so on.
// The previous period covers the same span of time just before, cut at the same time of day.
export function computeAnalytics(orders, days, now, categories) {
  const start = startOfDay(now) - (days - 1) * DAY;
  const current = between(orders, start, now);
  const previous = between(orders, start - days * DAY, now - days * DAY);
  const valid = current.filter(isPaid);

  const daily = [];
  for (let i = 0; i < days; i++) {
    const from = start + i * DAY;
    const dayOrders = valid.filter(o => {
      const t = Date.parse(o.placedAt);
      return t >= from && t < from + DAY;
    });
    daily.push({ date: new Date(from).toISOString(), revenue: sum(dayOrders, o => o.total), orders: dayOrders.length });
  }

  const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0 }));
  for (const o of valid) byHour[new Date(o.placedAt).getHours()].orders++;

  const categoryRevenue = new Map(categories.map(c => [c.key, 0]));
  const products = new Map();
  for (const o of valid) {
    for (const it of o.items) {
      categoryRevenue.set(it.category, (categoryRevenue.get(it.category) || 0) + it.price * it.qty);
      const p = products.get(it.productId) || { productId: it.productId, name: it.name, qty: 0, revenue: 0 };
      p.qty += it.qty;
      p.revenue += it.price * it.qty;
      products.set(it.productId, p);
    }
  }
  const byCategory = categories.map(c => ({ key: c.key, label: c.label, revenue: categoryRevenue.get(c.key) || 0 }));
  const known = new Set(categories.map(c => c.key));
  const other = [...categoryRevenue].filter(([key]) => !known.has(key)).reduce((s, [, revenue]) => s + revenue, 0);
  if (other > 0) byCategory.push({ key: 'other', label: 'Other (deleted categories)', revenue: other });
  byCategory.sort((a, b) => b.revenue - a.revenue);
  const topProducts = [...products.values()].sort((a, b) => b.qty - a.qty).slice(0, 8);

  const coupons = new Map();
  for (const o of valid) {
    if (!o.couponCode) continue;
    const c = coupons.get(o.couponCode) || { code: o.couponCode, uses: 0, discount: 0, revenue: 0 };
    c.uses++;
    c.discount += o.discount + (o.cashback || 0);
    c.revenue += o.total;
    coupons.set(o.couponCode, c);
  }

  const payments = new Map();
  for (const o of valid) payments.set(o.paymentMethod, (payments.get(o.paymentMethod) || 0) + 1);

  return {
    days,
    start: new Date(start).toISOString(),
    current: summarize(current),
    previous: summarize(previous),
    daily,
    byHour: byHour.filter(h => h.hour >= 8),
    byCategory,
    topProducts,
    coupons: [...coupons.values()].sort((a, b) => b.uses - a.uses),
    agents: agentStats(current),
    payments: [...payments.entries()].map(([method, count]) => ({ method, count, share: count / valid.length }))
      .sort((a, b) => b.count - a.count),
  };
}

export function agentStats(orders) {
  const map = new Map();
  for (const o of orders) {
    if (o.status !== 'delivered' || !o.agentId) continue;
    const a = map.get(o.agentId) || { agentId: o.agentId, name: o.agentName, deliveries: 0, totalMins: 0, onTime: 0, ratingSum: 0, ratings: 0 };
    a.deliveries++;
    a.totalMins += o.deliveryMins;
    if (o.deliveryMins <= ON_TIME_MINS) a.onTime++;
    if (o.rating) {
      a.ratingSum += o.rating;
      a.ratings++;
    }
    map.set(o.agentId, a);
  }
  return [...map.values()]
    .map(a => ({
      agentId: a.agentId,
      name: a.name,
      deliveries: a.deliveries,
      avgMins: a.totalMins / a.deliveries,
      onTimeRate: a.onTime / a.deliveries,
      rating: a.ratings ? a.ratingSum / a.ratings : null,
      ratings: a.ratings,
    }))
    .sort((a, b) => b.deliveries - a.deliveries);
}

// Lifetime number of (non-cancelled) orders per coupon code.
export function couponUsage(orders) {
  const usage = {};
  for (const o of orders) if (o.couponCode && isPaid(o)) usage[o.couponCode] = (usage[o.couponCode] || 0) + 1;
  return usage;
}
