// Saves uploaded photos. With Supabase configured (SUPABASE_URL + SUPABASE_SECRET_KEY) they go to a public
// Supabase Storage bucket, so the same link works in the panel, on the website and in the apps.
// Without it they are written to the local uploads/ folder and served at /uploads/<file>.
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

const { url: SUPABASE_URL, key: SUPABASE_KEY, bucket: BUCKET } = config.supabase;

export const usesSupabase = Boolean(SUPABASE_URL && SUPABASE_KEY);
export const storageLabel = usesSupabase ? `Supabase Storage (bucket "${BUCKET}")` : `local folder ${config.uploadDir}`;

export const IMAGE_TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };

// Recognises an image by its first bytes (never trusts the file name or Content-Type). Returns the extension.
const SIGNATURES = [
  { ext: 'jpg', test: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', test: b => b.subarray(0, 4).toString('hex') === '89504e47' },
  { ext: 'webp', test: b => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
  { ext: 'gif', test: b => b.subarray(0, 4).toString() === 'GIF8' },
];
export const imageKind = body => (Buffer.isBuffer(body) && body.length >= 12 ? SIGNATURES.find(s => s.test(body))?.ext : undefined);

// New sb_secret_ keys go in the apikey header only; a legacy service_role JWT also as the bearer token.
const authHeaders = () => ({ apikey: SUPABASE_KEY, ...(SUPABASE_KEY.startsWith('eyJ') ? { Authorization: `Bearer ${SUPABASE_KEY}` } : {}) });

async function supabase(method, route, { body, headers } = {}) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/${route}`, { method, body, headers: { ...authHeaders(), ...headers } });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(`Supabase Storage: ${data?.message || data?.error || `HTTP ${res.status}`}`);
    // Storage answers some "not found" and "already exists" cases with HTTP 400 and the real code in the body.
    err.status = Number(data?.statusCode) || res.status;
    throw err;
  }
  return data;
}

// The bucket is created (public) the first time a photo is saved.
let bucketReady = null;
function ensureBucket() {
  bucketReady ??= (async () => {
    let bucket = null;
    try {
      bucket = await supabase('GET', `bucket/${BUCKET}`);
    } catch (err) {
      if (err.status !== 404) throw err;
    }
    if (!bucket) {
      try {
        await supabase('POST', 'bucket', {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true, file_size_limit: 5 * 1024 * 1024, allowed_mime_types: Object.values(IMAGE_TYPES) }),
        });
        console.log(`Created the public Supabase Storage bucket "${BUCKET}".`);
      } catch (err) {
        if (err.status !== 409) throw err; // created a moment ago by another request
      }
    } else if (!bucket.public) {
      throw new Error(`Supabase bucket "${BUCKET}" is private, so its photos can't be shown. Make it public in Supabase (Storage → bucket settings).`);
    }
  })().catch(err => {
    bucketReady = null; // try again on the next upload
    throw err;
  });
  return bucketReady;
}

// The public link of a file in the bucket.
export const supabaseUrl = name => `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${name}`;

// Stores one image under `name` (e.g. "6adc….jpg") and returns its public link.
// `overwrite` replaces a file of the same name (used when moving old uploads, so it can be re-run).
export async function saveImage(name, body, { overwrite = false } = {}) {
  const ext = path.extname(name).slice(1);
  if (!usesSupabase) {
    await fs.mkdir(config.uploadDir, { recursive: true });
    await fs.writeFile(path.join(config.uploadDir, name), body);
    return `${config.publicUrl}/uploads/${name}`;
  }
  await ensureBucket();
  await supabase('POST', `object/${BUCKET}/${encodeURIComponent(name)}`, {
    body,
    headers: { 'Content-Type': IMAGE_TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'max-age=31536000', 'x-upsert': String(overwrite) },
  });
  return supabaseUrl(name);
}

// Removes a file from the bucket (only used to clean up tests).
export async function deleteSupabaseImage(name) {
  await supabase('DELETE', `object/${BUCKET}/${encodeURIComponent(name)}`);
}
