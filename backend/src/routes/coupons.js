import { Router } from 'express';
import { store } from '../db/index.js';
import { badRequest, conflict, notFound, pick, nowIso } from '../lib/http.js';

export const router = Router();

const FIELDS = ['code', 'description', 'discountType', 'discountValue', 'maxDiscount', 'freeItem', 'cashbackUnit', 'minOrderValue',
  'startsAt', 'expiresAt', 'usageLimit', 'perUserLimit', 'firstOrderOnly', 'isActive'];
const TYPES = ['percent', 'flat', 'free_delivery', 'free_item', 'cashback'];

const numOrNull = v => (v === null || v === '' || v === undefined ? null : Number(v));
const isoOrNull = v => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);

async function normalize(body) {
  const c = pick(body, FIELDS);
  if ('code' in c) c.code = String(c.code || '').trim().toUpperCase();
  if ('description' in c) c.description = String(c.description || '').trim().slice(0, 120);
  for (const f of ['discountValue', 'minOrderValue', 'perUserLimit']) if (f in c) c[f] = Number(c[f]) || 0;
  for (const f of ['maxDiscount', 'usageLimit']) if (f in c) c[f] = numOrNull(c[f]);
  for (const f of ['startsAt', 'expiresAt']) if (f in c) c[f] = isoOrNull(c[f]);
  for (const f of ['firstOrderOnly', 'isActive']) if (f in c) c[f] = Boolean(c[f]);
  if ('freeItem' in c) {
    if (c.freeItem?.productId) {
      // The product name comes from the menu, not from the client.
      const product = await store.findById('products', String(c.freeItem.productId));
      if (!product) throw badRequest('That free product is no longer on the menu.');
      c.freeItem = { productId: product._id, name: product.name, qty: Math.round(Number(c.freeItem.qty) || 1) };
    } else c.freeItem = null;
  }
  return c;
}

async function validate(c, id) {
  if (!/^[A-Z0-9]{3,20}$/.test(c.code || '')) throw badRequest('Code must be 3–20 capital letters or digits.');
  const clash = await store.findOne('coupons', { code: c.code });
  if (clash && clash._id !== id) throw conflict(`A coupon with code ${c.code} already exists.`);
  if (!TYPES.includes(c.discountType)) throw badRequest('Pick an offer type.');
  if (c.discountType === 'percent' && !(c.discountValue > 0 && c.discountValue <= 100)) throw badRequest('Percentage must be between 1 and 100.');
  if (c.discountType === 'flat' && !(c.discountValue > 0)) throw badRequest('Discount amount must be more than ₹0.');
  if (c.discountType === 'free_item' && !(c.freeItem?.productId && c.freeItem.qty >= 1 && c.freeItem.qty <= 10)) {
    throw badRequest('Pick the free product and a quantity from 1 to 10.');
  }
  if (c.discountType === 'cashback') {
    if (!(c.discountValue > 0)) throw badRequest('Cashback must be more than 0.');
    if (c.cashbackUnit !== 'flat' && c.discountValue > 100) throw badRequest('Cashback percentage must be between 1 and 100.');
  }
  if (c.minOrderValue < 0) throw badRequest('Minimum order can’t be negative.');
  if (!c.startsAt || !c.expiresAt) throw badRequest('Pick start and end dates.');
  if (c.expiresAt <= c.startsAt) throw badRequest('Expiry must be after the start date.');
  if (c.usageLimit !== null && !(c.usageLimit >= 1)) throw badRequest('Total uses must be 1 or more, or empty for no limit.');
  if (!(c.perUserLimit >= 1)) throw badRequest('Uses per customer must be 1 or more.');
}

// How many (non-cancelled) orders used each code.
async function usageByCode() {
  const used = await store.find('orders', { couponCode: { $ne: null }, status: { $ne: 'cancelled' } }, { projection: { couponCode: 1 } });
  const counts = {};
  for (const o of used) counts[o.couponCode] = (counts[o.couponCode] || 0) + 1;
  return counts;
}

router.get('/', async (req, res) => {
  const [list, usage] = await Promise.all([store.find('coupons', {}, { sort: { createdAt: -1 } }), usageByCode()]);
  res.json(list.map(c => ({ ...c, usedCount: usage[c.code] || 0 })));
});

router.post('/', async (req, res) => {
  const doc = { description: '', maxDiscount: null, freeItem: null, cashbackUnit: null, usageLimit: null, perUserLimit: 1, firstOrderOnly: false, isActive: true, ...(await normalize(req.body)) };
  await validate(doc, null);
  const now = nowIso();
  res.status(201).json(await store.insert('coupons', { ...doc, createdAt: now, updatedAt: now }));
});

router.patch('/:id', async (req, res) => {
  const current = await store.findById('coupons', req.params.id);
  if (!current) throw notFound();
  const changes = await normalize(req.body);
  await validate({ ...current, ...changes }, current._id);
  res.json(await store.update('coupons', current._id, { ...changes, updatedAt: nowIso() }));
});

router.delete('/:id', async (req, res) => {
  if (!(await store.remove('coupons', req.params.id))) throw notFound();
  res.status(204).end();
});
