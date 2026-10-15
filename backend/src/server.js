// Starts the BiteVo admin API.
import { config } from './config.js';
import { connectStore, store } from './db/index.js';
import { createApp } from './app.js';
import { seedIfEmpty } from './demo/seed.js';
import { startSimulator } from './demo/simulator.js';

try {
  await connectStore();
} catch (err) {
  console.error(`Could not open the database: ${err.message}`);
  process.exit(1);
}
console.log(`Data store: ${store.label}`);

let stopSimulator = () => {};
if (config.demoMode) {
  const seeded = await seedIfEmpty();
  if (seeded) console.log(`Empty database, so loaded demo data (${seeded.orders} orders, ${seeded.products} products).`);
  stopSimulator = startSimulator();
  console.log('Demo mode: new demo orders will keep arriving. Set DEMO_MODE=false for real use.');
}

const server = createApp().listen(config.port, () => {
  console.log(`BiteVo admin API listening on http://localhost:${config.port}`);
});

async function shutdown() {
  stopSimulator();
  server.close();
  await store.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
