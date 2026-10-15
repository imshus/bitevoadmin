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

const PRODUCT_FIELDS = ['name', 'heading', 'category', 'price', 'mrp', 'isVeg', 'description', 'prepTimeMins', 'isAvailable', 'isBestseller', 'image'];
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
  return p;
}

async function validateProduct(p) {
  if (!p.name) throw badRequest('Product name is required.');
  if (!(await store.findOne('categories', { key: p.category }))) throw badRequest('Pick a valid category.');
  if (!(p.price > 0)) throw badRequest('Price must be more than ₹0.');
  if (p.mrp != null && !(p.mrp >= p.price)) throw badRequest('MRP can’t be lower than the price.');
  if (!(Number.isInteger(p.prepTimeMins) && p.prepTimeMins > 0 && p.prepTimeMins <= 240)) throw badRequest('Prep time must be 1–240 minutes.');
  if (p.image && !IMAGE_URL.test(p.image)) throw badRequest('Use an https:// image link or upload a photo.');
}

products.get('/', async (req, res) => {
  res.json(await store.find('products', {}, { sort: { createdAt: -1 } }));
});

products.post('/', async (req, res) => {
  const doc = { heading: '', description: '', image: '', mrp: null, isVeg: true, isAvailable: true, isBestseller: false, ...normalizeProduct(req.body) };
  await validateProduct(doc);
  const now = nowIso();
  res.status(201).json(await store.insert('products', { ...doc, createdAt: now, updatedAt: now }));
});

products.patch('/:id', async (req, res) => {
  const current = await store.findById('products', req.params.id);
  if (!current) throw notFound();
  const changes = normalizeProduct(req.body);
  await validateProduct({ ...current, ...changes });
  res.json(await store.update('products', current._id, { ...changes, updatedAt: nowIso() }));
});

products.delete('/:id', async (req, res) => {
  if (!(await store.remove('products', req.params.id))) throw notFound();
  res.status(204).end();
});

// ---- Categories ----------------------------------------------------------------------

export const categories = Router();

categories.get('/', async (req, res) => {
  res.json(await store.find('categories', {}, { sort: { order: 1 } }));
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
