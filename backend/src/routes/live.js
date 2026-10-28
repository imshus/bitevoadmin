// Live map: the riders who are online with their latest position and the orders they carry, plus
// today's orders still waiting for a rider. Positions come from the delivery partner app
// (../DeliveryBoyApplication), which writes `agents.location` every few seconds while a rider is online,
// `orders.riderLocation` while an order is out for delivery, and each point of that route into `riderTrack`.
import { Router } from 'express';
import { store } from '../db/index.js';
import { config } from '../config.js';
import { LIVE_STATUSES } from '../lib/rules.js';
import { notFound, startOfToday, DAY } from '../lib/http.js';

export const router = Router();

// The delivery app keeps each rider's distance for the day in India time (its UTC_OFFSET_MINS).
const IST_MS = 330 * 60000;
const istDay = (ms = Date.now()) => new Date(ms + IST_MS).toISOString().slice(0, 10);

const cashToCollect = o => (o.paymentMethod === 'Cash on delivery' ? Math.max(0, (o.total || 0) - (o.walletUsed || 0)) : 0);

const liveOrder = o => ({
  _id: o._id,
  orderNo: o.orderNo,
  status: o.status,
  placedAt: o.placedAt,
  dispatchedAt: o.dispatchedAt || null,
  customerName: o.customerName,
  customerPhone: o.customerPhone,
  zone: o.zone,
  itemCount: (o.items || []).reduce((s, it) => s + (it.qty || 1), 0),
  total: o.total,
  paymentMethod: o.paymentMethod,
  cashToCollect: cashToCollect(o),
  agentId: o.agentId || null,
  agentName: o.agentName || null,
  // The customer's map pin, when they picked the address on the map.
  drop: o.address?.lat != null ? { lat: o.address.lat, lng: o.address.lng } : null,
  area: o.address?.area || o.address?.line2 || '',
  address: o.address ? [o.address.line1, o.address.line2].filter(Boolean).join(', ') : '',
});

router.get('/', async (req, res) => {
  const since = new Date(Date.now() - DAY).toISOString();
  const today = new Date(startOfToday()).toISOString();
  const [agents, live, deliveredToday] = await Promise.all([
    store.find('agents', { isActive: true }, { sort: { name: 1 } }),
    store.find('orders', { status: { $in: LIVE_STATUSES }, placedAt: { $gte: since } }, { sort: { placedAt: 1 } }),
    store.find('orders', { status: 'delivered', placedAt: { $gte: today } }, { projection: { agentId: 1, cashCollected: 1 } }),
  ]);

  const day = istDay();
  const riders = agents
    .filter(a => a.status === 'online' || a.status === 'busy')
    .map(a => {
      const done = deliveredToday.filter(o => o.agentId === a._id);
      return {
        _id: a._id,
        name: a.name,
        phone: a.phone,
        zone: a.zone,
        vehicleType: a.vehicleType,
        vehicleNumber: a.vehicleNumber || '',
        kycStatus: a.kycStatus,
        status: a.status,
        // Set online in the panel by hand rather than through the rider app: no position to show.
        usesApp: Boolean(a.location),
        location: a.location || null,
        onlineAt: a.onlineAt || null,
        kmToday: a.odometer?.day === day ? Math.round(a.odometer.km * 10) / 10 : 0,
        deliveredToday: done.length,
        cashToday: done.reduce((s, o) => s + (o.cashCollected || 0), 0),
        orders: live.filter(o => o.agentId === a._id).map(liveOrder),
      };
    });

  res.json({
    at: new Date().toISOString(),
    kitchen: config.kitchen,
    riders,
    waiting: live.filter(o => !o.agentId).map(liveOrder),
    // Orders with a rider who isn't online (assigned in the panel, or the rider went offline).
    withOfflineRider: live.filter(o => o.agentId && !riders.some(r => r._id === o.agentId)).map(liveOrder),
  });
});

// The route driven so far for an order out for delivery (at most ~400 points).
router.get('/orders/:id/track', async (req, res) => {
  const order = await store.findById('orders', req.params.id);
  if (!order) throw notFound('This order no longer exists.');
  const points = await store.find('riderTrack', { orderId: order._id }, { sort: { at: 1 }, limit: 5000 });
  const every = Math.max(1, Math.ceil(points.length / 400));
  res.json({ points: points.filter((p, i) => i % every === 0 || i === points.length - 1).map(p => ({ lat: p.lat, lng: p.lng, at: p.at })) });
});
