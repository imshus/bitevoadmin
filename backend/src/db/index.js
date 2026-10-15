// Opens the data store: MongoDB when a connection string is configured, otherwise a local JSON file.
// Everything else imports `store` from here and never talks to MongoDB directly.
import { config } from '../config.js';
import { createMongoStore } from './mongoStore.js';
import { createFileStore } from './fileStore.js';

export let store = null;

// The collections the admin panel owns (used when seeding / resetting demo data).
export const COLLECTIONS = [
  'meta', 'admins', 'categories', 'products', 'coupons', 'agents', 'customers',
  'orders', 'walletTxns', 'sessions', 'loginEvents', 'settings',
];

const INDEXES = [
  ['admins', { email: 1 }, { unique: true }],
  ['categories', { key: 1 }, { unique: true }],
  ['coupons', { code: 1 }, { unique: true }],
  ['orders', { placedAt: -1 }],
  ['orders', { status: 1, placedAt: -1 }],
  ['orders', { customerId: 1 }],
  ['orders', { couponCode: 1 }],
  ['walletTxns', { customerId: 1, at: 1 }],
  ['sessions', { tokenHash: 1 }, { unique: true, partialFilterExpression: { tokenHash: { $type: 'string' } } }],
  ['sessions', { lastActiveAt: -1 }],
  ['loginEvents', { at: -1 }],
  ['customers', { name: 1 }],
];

export const ensureIndexes = () => store.ensureIndexes(INDEXES);

export async function connectStore() {
  store = config.mongoUri
    ? await createMongoStore(config.mongoUri, config.mongoDbName)
    : await createFileStore(config.dataFile);
  await ensureIndexes();
  return store;
}
