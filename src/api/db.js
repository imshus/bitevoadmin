// In-browser stand-in for the database: collections live in localStorage so edits
// survive a reload. Only api/index.js talks to this file.
import { createSeedData } from './seed.js';

const KEY = 'bitevo-admin-db';
const VERSION = 1;

let state = null;

function fresh() {
  return { version: VERSION, seededAt: Date.now(), ...createSeedData() };
}

function load() {
  if (state) return state;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && saved.version === VERSION) state = saved;
  } catch { /* storage blocked or corrupt: fall back to fresh data */ }
  if (!state) {
    state = fresh();
    persist();
  }
  return state;
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch { /* storage blocked: changes last until the tab closes */ }
}

export const db = {
  all: name => load()[name],
  replace(name, docs) {
    load()[name] = docs;
    persist();
  },
  seededAt: () => load().seededAt,
  reset() {
    state = fresh();
    persist();
  },
};
