// Moves photos saved the old way (/uploads/<file> on the admin API) to Supabase Storage and points the
// products and categories that use them at the new public links:
//   npm run move-uploads                                   dry run: lists what would move
//   npm run move-uploads -- --apply                        moves the photos found in this machine's uploads/
//   npm run move-uploads -- --from https://adminapi.bitevo.in --apply
//                                                          also fetches photos that only exist on that server
// Old files are left in place, and every changed link is saved in data/backups/ first. Safe to run again.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { connectStore, store } from './db/index.js';
import { usesSupabase, saveImage, imageKind } from './lib/storage.js';

const arg = name => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const apply = process.argv.includes('--apply');
const from = (arg('from') || '').replace(/\/+$/, '');

if (!usesSupabase) {
  console.log('Set SUPABASE_URL and SUPABASE_SECRET_KEY in backend/.env first.');
  process.exit(1);
}

// "/uploads/x.jpg" (or "<PUBLIC_URL>/uploads/x.jpg") → "x.jpg"; anything else → null.
function uploadName(src) {
  if (typeof src !== 'string') return null;
  const prefix = ['/uploads/', config.publicUrl && `${config.publicUrl}/uploads/`].find(p => p && src.startsWith(p));
  const name = prefix && src.slice(prefix.length);
  return name && /^[\w-]+\.(jpg|png|webp|gif)$/.test(name) ? name : null;
}

async function readPhoto(name) {
  const local = path.join(config.uploadDir, name);
  if (fs.existsSync(local)) return { body: fs.readFileSync(local), source: 'uploads/' };
  if (!from) return null;
  const res = await fetch(`${from}/uploads/${name}`).catch(() => null);
  return res?.ok ? { body: Buffer.from(await res.arrayBuffer()), source: from } : null;
}

await connectStore();
try {
  const plan = [];
  let missing = 0;
  for (const collection of ['products', 'categories']) {
    for (const doc of await store.find(collection)) {
      const name = uploadName(doc.image);
      if (!name) continue;
      const label = `${collection === 'products' ? 'product' : 'category'} “${doc.name || doc.label}”`;
      const photo = await readPhoto(name);
      if (!photo || !imageKind(photo.body)) {
        missing++;
        console.log(`  not found  ${label}: ${doc.image}`);
        continue;
      }
      plan.push({ collection, _id: doc._id, label, name, from: doc.image, body: photo.body, source: photo.source });
    }
  }

  console.log(`\n${plan.length} photo(s) to move, ${missing} not found${missing && !from ? ' (add --from <admin API address> to fetch them from the server)' : ''}.`);
  if (!apply) {
    for (const p of plan) console.log(`  would move ${p.label}  (${p.name} from ${p.source})`);
    console.log('Dry run: nothing changed. Add --apply to move them.');
  } else if (plan.length) {
    const dir = path.resolve('data', 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const backup = path.join(dir, `move-uploads-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(backup, JSON.stringify(plan.map(({ collection, _id, from: old }) => ({ collection, _id, image: old })), null, 1));
    console.log(`Old links saved in ${backup}`);

    let moved = 0;
    for (const p of plan) {
      const url = await saveImage(p.name, p.body, { overwrite: true });
      // Only if the photo wasn't changed in the panel in the meantime.
      const changed = await store.updateMany(p.collection, { _id: p._id, image: p.from }, { image: url });
      if (changed) moved++;
      console.log(`  ${changed ? 'moved' : 'skipped (changed meanwhile)'}  ${p.label} → ${url}`);
    }
    console.log(`Done: ${moved} of ${plan.length} now use Supabase Storage.`);
  }
} finally {
  await store.close();
}
