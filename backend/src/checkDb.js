// Read-only look at the MongoDB cluster: which databases and collections exist, and how big they are.
// Run with: npm run check-db -w backend
import { MongoClient } from 'mongodb';
import { config } from './config.js';

if (!config.mongoUri) {
  console.log('No MongoDB connection string found (set MONGO_DB_URL or MONGODB_URI in .env).');
  process.exit(1);
}

const client = new MongoClient(config.mongoUri, { serverSelectionTimeoutMS: 15000 });
try {
  await client.connect();
  const { databases } = await client.db().admin().listDatabases({ nameOnly: true });
  console.log(`Connected. The admin panel will use the "${config.mongoDbName}" database.\n`);
  for (const { name } of databases) {
    if (['admin', 'local', 'config'].includes(name)) continue;
    const cols = await client.db(name).listCollections({}, { nameOnly: true }).toArray();
    console.log(`Database "${name}"${name === config.mongoDbName ? '  <- admin panel' : ''}`);
    for (const { name: col } of cols) {
      const count = await client.db(name).collection(col).estimatedDocumentCount();
      console.log(`  ${col}: ${count} documents`);
    }
    if (!cols.length) console.log('  (no collections)');
  }
} catch (err) {
  console.error(`Could not connect: ${err.message}`);
  process.exitCode = 1;
} finally {
  await client.close();
}
