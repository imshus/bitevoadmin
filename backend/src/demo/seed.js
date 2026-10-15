// Seeding rules: demo data only ever goes into an empty database, or replaces earlier demo data on request.
import { store, COLLECTIONS, ensureIndexes } from '../db/index.js';
import { buildDemoData } from './seedData.js';
import { demoCombos } from './catalog.js';

// True when the admin panel has no data yet.
export async function isEmpty() {
  return (await store.count('admins')) === 0;
}

// True when the current data was created by the demo seeder (so it is safe to replace).
export async function isDemoData() {
  return Boolean(await store.findById('meta', 'demo'));
}

async function writeDemoData() {
  const data = await buildDemoData();
  for (const [name, docs] of Object.entries(data)) await store.insertMany(name, docs);
  return Object.fromEntries(Object.entries(data).map(([name, docs]) => [name, docs.length]));
}

export async function seedIfEmpty() {
  if (!(await isEmpty())) return null;
  return writeDemoData();
}

// Demo databases created before combos existed get the Combos category and two demo combos (once).
export async function addDemoCombos() {
  const meta = await store.findById('meta', 'demo');
  if (!meta || meta.combosAdded) return 0;
  if (!(await store.findOne('categories', { key: 'combos' }))) {
    const order = Math.max(0, ...(await store.find('categories')).map(c => c.order || 0)) + 1;
    await store.insert('categories', { key: 'combos', label: 'Combos', order });
  }
  let added = 0;
  for (const combo of demoCombos()) {
    if (!(await store.findById('products', combo._id))) {
      await store.insert('products', combo);
      added++;
    }
  }
  await store.updateMany('products', { type: { $nin: ['single', 'combo'] } }, { type: 'single' });
  await store.update('meta', 'demo', { combosAdded: true });
  return added;
}

// Drops the admin panel's collections (only these; anything else in the database is untouched) and reseeds.
export async function resetDemoData() {
  for (const name of COLLECTIONS) await store.drop(name);
  await ensureIndexes();
  return writeDemoData();
}
