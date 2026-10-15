import { Router } from 'express';
import { store } from '../db/index.js';
import { badRequest, notFound, nowIso, DAY } from '../lib/http.js';
import { money } from '../lib/rules.js';

// Running balance per customer; adds `balanceAfter` to each transaction. `txns` must be oldest first.
function summarize(txns) {
  const wallets = new Map();
  const withBalance = txns.map(t => {
    const w = wallets.get(t.customerId) || { customerId: t.customerId, customerName: t.customerName, customerPhone: t.customerPhone, balance: 0, added: 0, used: 0, count: 0 };
    w.balance += t.amount;
    if (t.amount > 0) w.added += t.amount;
    else w.used -= t.amount;
    w.count++;
    w.lastActivity = t.at;
    wallets.set(t.customerId, w);
    return { ...t, balanceAfter: w.balance };
  });
  return { wallets: [...wallets.values()], txns: withBalance.reverse() };
}

async function balanceOf(customerId) {
  const txns = await store.find('walletTxns', { customerId });
  return txns.reduce((s, t) => s + t.amount, 0);
}

export const wallets = Router();

wallets.get('/', async (req, res) => {
  const now = Date.now();
  const { wallets: list, txns } = summarize(await store.find('walletTxns', {}, { sort: { at: 1 } }));
  const recent = txns.filter(t => now - Date.parse(t.at) < 30 * DAY);
  const total = type => recent.filter(t => t.type === type).reduce((s, t) => s + Math.abs(t.amount), 0);
  res.json({
    wallets: list.sort((a, b) => b.balance - a.balance || b.lastActivity.localeCompare(a.lastActivity)),
    transactions: txns,
    totals: {
      balance: list.reduce((s, w) => s + w.balance, 0),
      holders: list.filter(w => w.balance > 0).length,
      cashback: total('cashback'),
      refunds: total('refund'),
      spent: total('payment'),
    },
  });
});

// amount > 0 adds money, amount < 0 deducts it.
wallets.post('/:customerId/adjustments', async (req, res) => {
  const customer = await store.findById('customers', req.params.customerId);
  if (!customer) throw notFound('Customer not found.');
  const amount = Math.round(Number(req.body?.amount));
  const note = String(req.body?.note || '').trim().slice(0, 80);
  if (!Number.isFinite(amount) || amount === 0) throw badRequest('Enter an amount.');
  if (Math.abs(amount) > 10000) throw badRequest('Adjust at most ₹10,000 at a time.');
  if (!note) throw badRequest('Add a reason, so the team knows why.');
  const balance = await balanceOf(customer._id);
  if (amount < 0 && balance + amount < 0) throw badRequest(`You can deduct at most ${money(balance)}, the current balance.`);
  res.status(201).json(await store.insert('walletTxns', {
    customerId: customer._id, customerName: customer.name, customerPhone: customer.phone,
    type: amount > 0 ? 'admin_credit' : 'admin_debit', amount, note, by: req.admin.name, at: nowIso(),
  }));
});

// ---- Customer search (for the wallet "Add or deduct money" picker) ---------------------

export const customers = Router();

customers.get('/', async (req, res) => {
  const q = String(req.query.search || '').trim().toLowerCase();
  if (!q) return res.json([]);
  const qDigits = q.replace(/\D/g, '');
  const found = (await store.find('customers', {}, { projection: { name: 1, phone: 1 } }))
    .filter(c => c.name.toLowerCase().includes(q) || (qDigits && c.phone.replace(/\D/g, '').includes(qDigits)))
    .slice(0, 8);
  res.json(await Promise.all(found.map(async c => ({
    customerId: c._id, customerName: c.name, customerPhone: c.phone, balance: await balanceOf(c._id),
  }))));
});
