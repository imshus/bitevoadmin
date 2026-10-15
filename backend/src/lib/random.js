// Small deterministic random helpers, so the demo data is identical on every reload.

export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// mulberry32: a tiny seeded PRNG returning floats in [0, 1)
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const between = (r, min, max) => min + r() * (max - min);
export const intBetween = (r, min, max) => Math.floor(between(r, min, max + 1));
export const pick = (r, list) => list[Math.floor(r() * list.length)];

// Picks from `items` where `weightOf(item)` gives each item's relative chance.
export function weighted(r, items, weightOf) {
  let total = 0;
  for (const item of items) total += weightOf(item);
  let roll = r() * total;
  for (const item of items) {
    roll -= weightOf(item);
    if (roll < 0) return item;
  }
  return items[items.length - 1];
}

// Rough bell curve around 0 (sum of uniforms), handy for delivery times.
export const wobble = r => (r() + r() + r() - 1.5) / 1.5;

// MongoDB-style 24-hex ObjectId: 4-byte timestamp + 8 random bytes.
export function objectId(date = new Date()) {
  const ts = Math.floor(date.getTime() / 1000).toString(16).padStart(8, '0');
  let rest = '';
  for (let i = 0; i < 16; i++) rest += Math.floor(Math.random() * 16).toString(16);
  return ts + rest;
}
