import { Router } from 'express';
import express from 'express';
import { store } from '../db/index.js';
import { objectId } from '../lib/ids.js';
import { saveImage, imageKind, IMAGE_TYPES } from '../lib/storage.js';
import { HttpError, badRequest, conflict, notFound, pick, nowIso } from '../lib/http.js';

// ---- Products ------------------------------------------------------------------------

export const products = Router();

// `halfPrice`: optional. When set, the website offers the dish as a half plate (this price) or a full plate (`price`).
const PRODUCT_FIELDS = ['type', 'name', 'heading', 'category', 'price', 'mrp', 'halfPrice', 'isVeg', 'description', 'prepTimeMins', 'isAvailable', 'isBestseller', 'image', 'comboItems'];
const IMAGE_URL = /^(https?:\/\/|\/uploads\/)/;

const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : v);

function normalizeProduct(body) {
  const p = pick(body, PRODUCT_FIELDS);
  for (const [field, max] of [['name', 80], ['heading', 30], ['description', 500], ['image', 1000]]) {
    if (field in p) p[field] = text(p[field] ?? '', max);
  }
  for (const field of ['price', 'prepTimeMins']) if (field in p) p[field] = Number(p[field]);
  if ('mrp' in p) p.mrp = p.mrp === null || p.mrp === '' ? null : Number(p.mrp);
  if ('halfPrice' in p) p.halfPrice = p.halfPrice === null || p.halfPrice === '' || Number(p.halfPrice) === 0 ? null : Number(p.halfPrice);
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
  if (p.halfPrice != null) {
    if (p.type === 'combo') throw badRequest('Combos don’t come as a half plate.');
    if (!(p.halfPrice > 0)) throw badRequest('Half plate price must be more than ₹0, or leave it empty.');
    if (!(p.halfPrice < p.price)) throw badRequest('The half plate should cost less than the full plate.');
  }
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
  const doc = { type: 'single', heading: '', description: '', image: '', mrp: null, halfPrice: null, isVeg: true, isAvailable: true, isBestseller: false, ...normalizeProduct(req.body) };
  if (doc.type === 'combo') Object.assign(doc, await resolveCombo(doc.comboItems || []), { halfPrice: null });
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

// Deletes a category. If it still has products, `?moveTo=<category key>` says where they go first,
// so no product is ever left without a category.
categories.delete('/:id', async (req, res) => {
  const category = await store.findById('categories', req.params.id);
  if (!category) throw notFound('This category no longer exists.');
  const used = await store.count('products', { category: category.key });
  if (used) {
    const moveTo = String(req.query.moveTo || '');
    const plural = used > 1;
    if (!moveTo) throw conflict(`“${category.label}” has ${used} product${plural ? 's' : ''}. Choose a category to move ${plural ? 'them' : 'it'} to.`);
    if (moveTo === category.key) throw badRequest('Pick a different category to move the products to.');
    if (!(await store.findOne('categories', { key: moveTo }))) throw badRequest('The category to move them to no longer exists.');
    await store.updateMany('products', { category: category.key }, { category: moveTo, updatedAt: nowIso() });
  }
  await store.remove('categories', category._id);
  res.json({ deleted: category.key, moved: used, movedTo: used ? String(req.query.moveTo) : null });
});

categories.post('/', async (req, res) => {
  const name = String(req.body?.label || '').trim().replace(/\s+/g, ' ');
  const image = text(String(req.body?.image || ''), 1000);
  if (!name) throw badRequest('Enter a category name.');
  if (name.length > 40) throw badRequest('Keep the category name under 40 characters.');
  if (image && !IMAGE_URL.test(image)) throw badRequest('Use an https:// image link or upload a photo.');
  const all = await store.find('categories');
  if (all.some(c => c.label.toLowerCase() === name.toLowerCase())) throw conflict(`“${name}” already exists. Pick it from the list.`);
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'category';
  let key = base;
  for (let n = 2; all.some(c => c.key === key); n++) key = `${base}-${n}`;
  const order = Math.max(0, ...all.map(c => c.order || 0)) + 1;
  res.status(201).json(await store.insert('categories', { key, label: name, image, order, createdAt: nowIso() }));
});

// ---- Photo uploads -------------------------------------------------------------------
// POST /api/uploads with the image as the raw body (Content-Type image/jpeg, png, webp or gif) → { url }.
// The panel shrinks photos before sending them, so 5 MB is plenty. With Supabase set up, `url` is a public
// Supabase Storage link that the website and apps can show directly.

export const uploads = Router();

uploads.post('/', express.raw({ type: Object.values(IMAGE_TYPES), limit: '5mb' }), async (req, res) => {
  if (!Buffer.isBuffer(req.body) || req.body.length < 12) throw badRequest('Send a JPG, PNG, WebP or GIF image.');
  const ext = imageKind(req.body);
  if (!ext) throw badRequest('That file isn’t a supported image.');
  let url;
  try {
    url = await saveImage(`${objectId()}.${ext}`, req.body);
  } catch (err) {
    console.error(`Photo upload failed: ${err.message}`);
    throw new HttpError(502, 'Couldn’t save the photo right now. Please try again.');
  }
  res.status(201).json({ url });
});
