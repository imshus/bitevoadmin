// Login status: who is signed in across the apps, and the sign-in history.
import { Router } from 'express';
import { store } from '../db/index.js';
import { notFound, nowIso } from '../lib/http.js';
import { publicSession } from '../auth.js';

export const sessions = Router();

sessions.get('/', async (req, res) => {
  const list = await store.find('sessions', {}, { sort: { lastActiveAt: -1 }, limit: 500 });
  res.json(list.map(publicSession));
});

sessions.post('/:id/revoke', async (req, res) => {
  const session = await store.findById('sessions', req.params.id);
  if (!session) throw notFound('This session no longer exists.');
  const saved = session.revokedAt ? session : await store.update('sessions', session._id, { revokedAt: nowIso() });
  res.json(publicSession(saved));
});

export const loginEvents = Router();

loginEvents.get('/', async (req, res) => {
  res.json(await store.find('loginEvents', {}, { sort: { at: -1 }, limit: 500 }));
});
