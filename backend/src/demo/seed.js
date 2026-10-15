// Seeding rules: demo data only ever goes into an empty database, or replaces earlier demo data on request.
import { store, COLLECTIONS, ensureIndexes } from '../db/index.js';
import { buildDemoData } from './seedData.js';

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

// Drops the admin panel's collections (only these; anything else in the database is untouched) and reseeds.
export async function resetDemoData() {
  for (const name of COLLECTIONS) await store.drop(name);
  await ensureIndexes();
  return writeDemoData();
}
