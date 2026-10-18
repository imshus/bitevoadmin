// Refer & earn runs on the customer website: it records each use of a referral code in "referrals" and
// pays the inviter's reward (wallet cashback) once the friend's orders are delivered. The panel lists
// the referrals and can void a pending one, which stops its reward from being paid.
import { Router } from 'express';
import { store } from '../db/index.js';
import { badRequest, conflict, notFound, nowIso } from '../lib/http.js';

export const router = Router();

const sum = list => list.reduce((s, r) => s + (r.reward || 0), 0);

const NOT_PENDING = {
  rewarded: 'This referral has already been rewarded, so it can’t be voided.',
  void: 'This referral is already void.',
};

router.get('/', async (req, res) => {
  const referrals = await store.find('referrals', {}, { sort: { createdAt: -1 } });
  const inviterIds = [...new Set(referrals.map(r => String(r.referrerId)))];
  const inviters = await store.find('customers', { _id: { $in: inviterIds } }, { projection: { phone: 1 } });
  const phoneOf = new Map(inviters.map(c => [c._id, c.phone]));
  const withStatus = status => referrals.filter(r => r.status === status);
  res.json({
    referrals: referrals.map(r => ({ ...r, referrerPhone: phoneOf.get(String(r.referrerId)) || null })),
    totals: {
      referrals: referrals.length,
      pending: withStatus('pending').length,
      rewarded: withStatus('rewarded').length,
      void: withStatus('void').length,
      paidOut: sum(withStatus('rewarded')),
      // Still to pay if every pending friend completes their orders.
      due: sum(withStatus('pending')),
    },
  });
});

// For referrals that look like abuse, e.g. a friend who is really the inviter's second account.
router.post('/:id/void', async (req, res) => {
  const reason = String(req.body?.reason || '').trim().slice(0, 120);
  if (!reason) throw badRequest('Add a reason, so the team knows why.');
  const referral = await store.findById('referrals', req.params.id);
  if (!referral) throw notFound('This referral no longer exists.');
  if (referral.status !== 'pending') throw conflict(NOT_PENDING[referral.status] || 'Only pending referrals can be voided.');
  // Only while it is still pending: the website may be paying the reward at this very moment.
  const changed = await store.updateMany('referrals', { _id: referral._id, status: 'pending' }, {
    status: 'void', voidReason: reason, voidedBy: req.admin.name, voidedAt: nowIso(),
  });
  if (!changed) throw conflict('This referral was rewarded a moment ago, so it can’t be voided.');
  res.json(await store.findById('referrals', referral._id));
});
