// npm run seed            → load demo data into an empty database
// npm run seed -- --reset → replace existing *demo* data with fresh demo data
// It never overwrites real data: if the database holds data that didn't come from the demo seeder, it stops.
import { connectStore, store } from './db/index.js';
import { isEmpty, isDemoData, seedIfEmpty, resetDemoData } from './demo/seed.js';

const reset = process.argv.includes('--reset');

await connectStore();
console.log(`Data store: ${store.label}`);
try {
  if (await isEmpty()) {
    const counts = await seedIfEmpty();
    console.log('Loaded demo data:', counts);
  } else if (!reset) {
    console.log('The database already has data, so nothing was changed. Use "npm run seed -- --reset" to replace demo data.');
  } else if (!(await isDemoData())) {
    console.log('The database holds data that was not created by the demo seeder. Refusing to replace it.');
    process.exitCode = 1;
  } else {
    const counts = await resetDemoData();
    console.log('Replaced the demo data:', counts);
  }
} finally {
  await store.close();
}
