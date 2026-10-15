import { Router } from 'express';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { store } from '../db/index.js';
import { config } from '../config.js';
import { objectId } from '../lib/ids.js';
import { badRequest, conflict, notFound, pick, nowIso } from '../lib/http.js';

// ---- Products ------------------------------------------------------------------------

export const products = Router();

const PRODUCT_FIELDS = ['type', 'name', 'heading', 'category', 'price', 'mrp', 'isVeg', 'description', 'prepTimeMins', 'isAvailable', 'isBestseller', 'image', 'comboItems'];
const IMAGE_URL = /^(https?:\/\/|\/uploads\/)/;

const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : v);

function normalizeProduct(body) {
  const p = pick(body, PRODUCT_FIELDS);
  for (const [field, max] of [['name', 80], ['heading', 30], ['description', 500], ['image', 1000]]) {
    if (field in p) p[field] = text(p[field] ?? '', max);
  }
  for (const field of ['price', 'prepTimeMins']) if (field in p) p[field] = Number(p[field]);
  if ('mrp' in p) p.mrp = p.mrp === null || p.mrp === '' ? null : Number(p.mrp);
  for (const field of ['isVeg', 'isAvailable', 'isBestseller']) if (field in p) p[field] = Boolean(p[field]);
  if ('type' in p) p.type = p.type === 'combo' ? 'combo' : 'single';
  if ('comboItems' in p) {
    // One line per dish (repeats are merged), at most 10 lines.
    const lines = new Map();
    for (const item of Array.isArray(p.comboItems) ? p.comboItems.slice(0, 10) : []) {
      const id = String(item?.productId || '');
      if (id) lines.set(id, (lines.get(id) || 0) + Math.round(Number(item.qty) || 0));
    }
    p.comboItems = [...lines].map(([productId, qty]) => ({ productId, qty }));
  }
  return p;
}

// Fills in each combo item's name from the menu and works out whether the combo is veg.
async function resolveCombo(items) {
  const resolved = [];
  let veg = true;
  for (const { productId, qty } of items) {
    const product = await store.findById('products', productId);
    if (!product) throw badRequest('One of the combo items is no longer on the menu.');
    if (product.type === 'combo') throw badRequest('A combo can’t contain another combo.');
    resolved.push({ productId: product._id, name: product.name, qty });
    veg = veg && product.isVeg;
  }
  return { comboItems: resolved, isVeg: veg };
}

async function validateProduct(p) {
  if (!p.name) throw badRequest('Product name is required.');
  if (!(await store.findOne('categories', { key: p.category }))) throw badRequest('Pick a valid category.');
  if (!(p.price > 0)) throw badRequest('Price must be more than ₹0.');
  if (p.mrp != null && !(p.mrp >= p.price)) throw badRequest('MRP can’t be lower than the price.');
  if (!(Number.isInteger(p.prepTimeMins) && p.prepTimeMins > 0 && p.prepTimeMins <= 240)) throw badRequest('Prep time must be 1–240 minutes.');
  if (p.image && !IMAGE_URL.test(p.image)) throw badRequest('Use an https:// image link or upload a photo.');
  if (p.type === 'combo') {
    const items = p.comboItems || [];
    if (!items.length || items.some(i => !(i.qty >= 1 && i.qty <= 10))) throw badRequest('Add the dishes in this combo, each 1–10 times.');
    if (items.reduce((s, i) => s + i.qty, 0) < 2) throw badRequest('A combo needs at least 2 items.');
  }
}

products.get('/', async (req, res) => {
  res.json(await store.find('products', {}, { sort: { createdAt: -1 } }));
});

products.post('/', async (req, res) => {
  const doc = { type: 'single', heading: '', description: '', image: '', mrp: null, isVeg: true, isAvailable: true, isBestseller: false, ...normalizeProduct(req.body) };
  if (doc.type === 'combo') Object.assign(doc, await resolveCombo(doc.comboItems || []));
  else delete doc.comboItems;
  await validateProduct(doc);
  const now = nowIso();
  res.status(201).json(await store.insert('products', { ...doc, createdAt: now, updatedAt: now }));
});

products.patch('/:id', async (req, res) => {
  const current = await store.findById('products', req.params.id);
  if (!current) throw notFound();
  const changes = normalizeProduct(req.body);
  const next = { ...current, ...changes };
  if (next.type === 'combo' && ('comboItems' in changes || 'type' in changes)) Object.assign(changes, await resolveCombo(next.comboItems || []));
  await validateProduct({ ...current, ...changes });
  const saved = await store.update('products', current._id, { ...changes, updatedAt: nowIso() });

  // Keep combos that include this dish in step with its name.
  if (saved.type !== 'combo' && changes.name && changes.name !== current.name) {
    for (const combo of await store.find('products', { type: 'combo' })) {
      if (!combo.comboItems?.some(i => i.productId === saved._id)) continue;
      await store.update('products', combo._id, { comboItems: combo.comboItems.map(i => (i.productId === saved._id ? { ...i, name: saved.name } : i)) });
    }
  }
  res.json(saved);
});

products.delete('/:id', async (req, res) => {
  const inCombos = (await store.find('products', { type: 'combo' }))
    .filter(c => c.comboItems?.some(i => i.productId === req.params.id))
    .map(c => c.name);
  if (inCombos.length) throw conflict(`It’s part of ${inCombos.join(', ')}. Remove it from ${inCombos.length > 1 ? 'those combos' : 'that combo'} first.`);
  if (!(await store.remove('products', req.params.id))) throw notFound();
  res.status(204).end();
});

// ---- Categories ----------------------------------------------------------------------

export const categories = Router();

// Each category comes with `productCount`, the number of menu items in it.
categories.get('/', async (req, res) => {
  const [list, items] = await Promise.all([
    store.find('categories', {}, { sort: { order: 1 } }),
    store.find('products', {}, { projection: { category: 1 } }),
  ]);
  const counts = {};
  for (const p of items) counts[p.category] = (counts[p.category] || 0) + 1;
  res.json(list.map(c => ({ ...c, productCount: counts[c.key] || 0 })));
});

// Only empty categories can be deleted, so no product is left without one.
categories.delete('/:id', async (req, res) => {
  const category = await store.findById('categories', req.params.id);
  if (!category) throw notFound('This category no longer exists.');
  const used = await store.count('products', { category: category.key });
  if (used) {
    throw conflict(`“${category.label}” still has ${used} product${used > 1 ? 's' : ''}. Move ${used > 1 ? 'them' : 'it'} to another category or delete ${used > 1 ? 'them' : 'it'} first.`);
  }
  await store.remove('categories', category._id);
  res.status(204).end();
});

categories.post('/', async (req, res) => {
  const name = String(req.body?.label || '').trim().replace(/\s+/g, ' ');
  if (!name) throw badRequest('Enter a category name.');
  if (name.length > 40) throw badRequest('Keep the category name under 40 characters.');
  const all = await store.find('categories');
  if (all.some(c => c.label.toLowerCase() === name.toLowerCase())) throw conflict(`“${name}” already exists. Pick it from the list.`);
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'category';
  let key = base;
  for (let n = 2; all.some(c => c.key === key); n++) key = `${base}-${n}`;
  const order = Math.max(0, ...all.map(c => c.order || 0)) + 1;
  res.status(201).json(await store.insert('categories', { key, label: name, order, createdAt: nowIso() }));
});

// ---- Photo uploads -------------------------------------------------------------------
// The panel shrinks photos before sending them, so 5 MB is plenty.

export const uploads = Router();

const SIGNATURES = [
  { ext: 'jpg', test: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', test: b => b.subarray(0, 4).toString('hex') === '89504e47' },
  { ext: 'webp', test: b => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
  { ext: 'gif', test: b => b.subarray(0, 4).toString() === 'GIF8' },
];

uploads.post('/', express.raw({ type: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], limit: '5mb' }), async (req, res) => {
  const body = req.body;
  if (!Buffer.isBuffer(body) || body.length < 12) throw badRequest('Send a JPG, PNG, WebP or GIF image.');
  const kind = SIGNATURES.find(s => s.test(body));
  if (!kind) throw badRequest('That file isn’t a supported image.');
  await fs.mkdir(config.uploadDir, { recursive: true });
  const name = `${objectId()}.${kind.ext}`;
  await fs.writeFile(path.join(config.uploadDir, name), body);
  res.status(201).json({ url: `${config.publicUrl}/uploads/${name}` });
});
