// App-wide lists kept in MongoDB (collection "settings", document "app"): delivery zones, vehicle types,
// cancel reasons and wallet adjustment reasons. Read by the panel and used to validate input.
import { Router } from 'express';
import { store } from './db/index.js';
import { badRequest, nowIso } from './lib/http.js';

export const DEFAULT_SETTINGS = {
  zones: ['North Zone', 'South Zone', 'East Zone', 'West Zone', 'Central'],
  vehicleTypes: ['Bike', 'Scooter', 'E-bike', 'Bicycle'],
  cancelReasons: ['Customer asked to cancel', 'Item not available', 'Kitchen too busy', 'Address outside delivery area', 'No delivery agent available', 'Suspected fraud'],
  walletReasons: ['Goodwill credit', 'Compensation for an order issue', 'Referral bonus', 'Promotional credit', 'Correction of a wrong credit'],
};
const LISTS = Object.keys(DEFAULT_SETTINGS);

// The settings document, created with the defaults the first time it's needed.
export async function getSettings() {
  const saved = await store.findById('settings', 'app');
  if (saved) return { ...DEFAULT_SETTINGS, ...saved };
  return store.insert('settings', { _id: 'app', ...DEFAULT_SETTINGS, updatedAt: nowIso() });
}

export const router = Router();

router.get('/', async (req, res) => {
  res.json(await getSettings());
});

// Replaces one or more lists, e.g. { zones: ['North Zone', 'Airport'] }.
router.patch('/', async (req, res) => {
  await getSettings();
  const changes = {};
  for (const key of LISTS) {
    if (!(key in (req.body || {}))) continue;
    const list = req.body[key];
    if (!Array.isArray(list)) throw badRequest(`${key} must be a list.`);
    const clean = [...new Set(list.map(v => String(v).trim().slice(0, 60)).filter(Boolean))].slice(0, 50);
    if (!clean.length) throw badRequest(`${key} can’t be empty.`);
    changes[key] = clean;
  }
  res.json(await store.update('settings', 'app', { ...changes, updatedAt: nowIso() }));
});
