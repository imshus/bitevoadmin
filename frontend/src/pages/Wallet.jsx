import { useEffect, useState } from 'react';
import { wallets as api, customers as customerApi, settings as settingsApi } from '../api/index.js';
import { useApi, usePageTitle } from '../lib/useApi.js';
import { money, num, timeAgo, dateTime } from '../lib/format.js';
import { WALLET_TXN } from '../lib/status.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Badge, Segmented, SearchInput, Modal, Field, Loading, ErrorState, EmptyState, StatTile, Pagination, Avatar } from '../components/ui.jsx';
import { Wallet as WalletIcon, Gift, Refresh, Bag, Plus, X } from '../components/Icons.jsx';

const PAGE_SIZE = 20;

const TYPE_FILTERS = [
  { value: 'all', label: 'All', match: () => true },
  { value: 'cashback', label: 'Cashback', match: t => t.type === 'cashback' },
  { value: 'refund', label: 'Refunds', match: t => t.type === 'refund' },
  { value: 'payment', label: 'Spent on orders', match: t => t.type === 'payment' },
  { value: 'admin', label: 'By admins', match: t => t.type.startsWith('admin') },
];

const signed = n => `${n > 0 ? '+' : '−'} ${money(Math.abs(n))}`;

function CustomerPicker({ onPick }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => customerApi.search(query).then(r => { if (live) setResults(r); }), 200);
    return () => { live = false; clearTimeout(timer); };
  }, [query]);

  return (
    <div className="picker">
      <SearchInput value={query} onChange={setQuery} placeholder="Search customer by name or phone digits" />
      {query.trim() && (
        <ul className="picker__list">
          {results.length === 0 && <li className="muted picker__empty">No customers match.</li>}
          {results.map(c => (
            <li key={c.customerId}>
              <button type="button" onClick={() => onPick(c)}>
                <Avatar name={c.customerName} size={32} />
                <span><strong>{c.customerName}</strong><span className="muted">{c.customerPhone}</span></span>
                <span className="picker__balance">{money(c.balance)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AdjustForm({ customer: fixed, reasons, onDone }) {
  const toast = useToast();
  const [customer, setCustomer] = useState(fixed || null);
  const [mode, setMode] = useState('add');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState(reasons[0] || '');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const value = Math.round(Number(amount) || 0);
  const balance = customer?.balance ?? 0;
  const after = balance + (mode === 'add' ? value : -value);

  const submit = async e => {
    e.preventDefault();
    if (!customer) return setError('Pick a customer.');
    if (!(value > 0)) return setError('Enter an amount above ₹0.');
    setBusy(true);
    setError(null);
    try {
      await api.adjust({ customer, amount: mode === 'add' ? value : -value, note });
      toast(`${mode === 'add' ? 'Added' : 'Deducted'} ${money(value)} ${mode === 'add' ? 'to' : 'from'} ${customer.customerName}’s wallet`);
      onDone(true);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <div className="modal__body">
        {error && <div className="notice notice--error" role="alert">{error}</div>}
        <div className="form-grid">
          <div className="field field--span">
            <span className="field__label">Customer</span>
            {customer ? (
              <div className="picked">
                <Avatar name={customer.customerName} size={40} />
                <span><strong>{customer.customerName}</strong><span className="muted">{customer.customerPhone} · balance {money(balance)}</span></span>
                {!fixed && <button type="button" className="icon-btn icon-btn--sm" onClick={() => setCustomer(null)} aria-label="Choose another customer"><X size={16} /></button>}
              </div>
            ) : <CustomerPicker onPick={setCustomer} />}
          </div>
          <Field label="Action" span>
            <Segmented label="Action" value={mode} onChange={setMode} options={[{ value: 'add', label: 'Add money' }, { value: 'deduct', label: 'Deduct money' }]} />
          </Field>
          <Field label="Amount (₹)" hint="Up to ₹10,000 at a time.">
            <input className="input" type="number" min="1" max="10000" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} data-autofocus={fixed ? true : undefined} />
          </Field>
          <Field label="Reason" hint="Saved with the transaction.">
            <input className="input" list="wallet-reasons" value={note} onChange={e => setNote(e.target.value)} maxLength={80} />
            <datalist id="wallet-reasons">{reasons.map(r => <option key={r} value={r} />)}</datalist>
          </Field>
        </div>
        {customer && value > 0 && (
          <p className={`preview${after < 0 ? ' preview--bad' : ''}`}>
            <WalletIcon size={18} />
            <span>
              Balance goes from <strong>{money(balance)}</strong> to <strong>{money(after)}</strong>
              {after < 0 ? '. That’s below zero, so lower the amount.' : '.'}
            </span>
          </p>
        )}
      </div>
      <div className="modal__foot">
        <button type="button" className="btn btn--ghost" onClick={() => onDone(false)}>Cancel</button>
        <button className="btn btn--primary" disabled={busy || after < 0}>{busy ? 'Saving…' : mode === 'add' ? 'Add money' : 'Deduct money'}</button>
      </div>
    </form>
  );
}

export default function Wallet() {
  usePageTitle('Wallet');
  const { data, loading, refreshing, error, reload } = useApi(() => api.overview());
  const { data: settings } = useApi(() => settingsApi.get());
  const [tab, setTab] = useState('wallets');
  const [query, setQuery] = useState('');
  const [onlyFunded, setOnlyFunded] = useState('funded');
  const [type, setType] = useState('all');
  const [customerFilter, setCustomerFilter] = useState(null);
  const [page, setPage] = useState(1);
  const [adjusting, setAdjusting] = useState(null); // {} for a new adjustment, or a wallet row

  useEffect(() => setPage(1), [tab, query, onlyFunded, type, customerFilter]);

  const q = query.trim().toLowerCase();
  const matches = x => !q || `${x.customerName} ${x.customerPhone} ${x.note || ''}`.toLowerCase().includes(q);
  const walletRows = (data?.wallets || []).filter(w => (onlyFunded === 'all' || w.balance > 0) && matches(w));
  const txnBase = (data?.transactions || []).filter(t => (!customerFilter || t.customerId === customerFilter.customerId) && matches(t));
  const txnRows = txnBase.filter(TYPE_FILTERS.find(f => f.value === type).match);
  const rows = tab === 'wallets' ? walletRows : txnRows;
  const shown = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totals = data?.totals;

  const showHistory = w => {
    setCustomerFilter(w);
    setQuery('');
    setType('all');
    setTab('transactions');
  };

  return (
    <>
      <PageHeader eyebrow="Wallet" title="Customer wallets" subtitle="Money customers hold in their BiteVo wallet from cashback, refunds and credits.">
        <button className="btn btn--primary" onClick={() => setAdjusting({})}><Plus size={18} />Add or deduct money</button>
      </PageHeader>

      <div className="stats">
        <StatTile icon={<WalletIcon size={18} />} label="Total in wallets" value={totals ? money(totals.balance) : '—'} hint={totals ? `${num(totals.holders)} customers have a balance` : ''} />
        <StatTile icon={<Gift size={18} />} label="Cashback given" value={totals ? money(totals.cashback) : '—'} hint="Last 30 days" />
        <StatTile icon={<Refresh size={18} />} label="Refunded to wallets" value={totals ? money(totals.refunds) : '—'} hint="Last 30 days" />
        <StatTile icon={<Bag size={18} />} label="Spent on orders" value={totals ? money(totals.spent) : '—'} hint="Last 30 days" />
      </div>

      <div className="tabs" role="tablist" aria-label="Wallet views">
        <button role="tab" aria-selected={tab === 'wallets'} className={tab === 'wallets' ? 'is-on' : undefined} onClick={() => setTab('wallets')}>Wallets</button>
        <button role="tab" aria-selected={tab === 'transactions'} className={tab === 'transactions' ? 'is-on' : undefined} onClick={() => setTab('transactions')}>Transactions</button>
      </div>

      <div className="toolbar">
        <SearchInput value={query} onChange={setQuery} placeholder={tab === 'wallets' ? 'Search customers' : 'Search customer or details'} />
        {tab === 'wallets' ? (
          <Segmented label="Show" value={onlyFunded} onChange={setOnlyFunded} options={[{ value: 'funded', label: 'With balance' }, { value: 'all', label: 'All wallets' }]} />
        ) : (
          <>
            <Segmented label="Type" value={type} onChange={setType} options={TYPE_FILTERS.map(f => ({ value: f.value, label: f.label, count: txnBase.filter(f.match).length }))} />
            {customerFilter && (
              <span className="filter-chip">
                {customerFilter.customerName}
                <button type="button" onClick={() => setCustomerFilter(null)} aria-label="Show all customers"><X size={14} /></button>
              </span>
            )}
          </>
        )}
      </div>

      <section className={`card${refreshing ? ' is-refreshing' : ''}`} role="tabpanel">
        {loading ? <Loading /> : error && !data ? <ErrorState error={error} onRetry={reload} /> : rows.length === 0 ? (
          <EmptyState icon={<WalletIcon />} title="Nothing here" text="Try a different search or filter." />
        ) : (
          <>
            <div className="table-wrap">
              {tab === 'wallets' ? (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th className="num">Balance</th>
                      <th className="num">Total added</th>
                      <th className="num">Total used</th>
                      <th>Last activity</th>
                      <th className="actions-col"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map(w => (
                      <tr key={w.customerId}>
                        <td>
                          <div className="cell-person">
                            <Avatar name={w.customerName} />
                            <div>
                              <div className="cell-title">{w.customerName}</div>
                              <div className="cell-sub">{w.customerPhone} · {w.count} transaction{w.count > 1 ? 's' : ''}</div>
                            </div>
                          </div>
                        </td>
                        <td className="num"><strong className="balance">{money(w.balance)}</strong></td>
                        <td className="num">{money(w.added)}</td>
                        <td className="num">{money(w.used)}</td>
                        <td className="nowrap" title={dateTime(w.lastActivity)}>{timeAgo(w.lastActivity)}</td>
                        <td className="actions-col">
                          <div className="row-actions">
                            <button type="button" className="btn btn--ghost btn--sm" onClick={() => showHistory(w)}>History</button>
                            <button type="button" className="btn btn--outline btn--sm" onClick={() => setAdjusting(w)} aria-label={`Adjust ${w.customerName}’s wallet`}>Adjust</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Customer</th>
                      <th>Type</th>
                      <th>Details</th>
                      <th className="num">Amount</th>
                      <th className="num">Balance after</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map(t => (
                      <tr key={t._id}>
                        <td className="nowrap">
                          <div>{dateTime(t.at)}</div>
                          <div className="cell-sub">{timeAgo(t.at)}</div>
                        </td>
                        <td className="nowrap">
                          <div className="cell-title">{t.customerName}</div>
                          <div className="cell-sub">{t.customerPhone}</div>
                        </td>
                        <td className="nowrap"><Badge tone={WALLET_TXN[t.type].tone}>{WALLET_TXN[t.type].label}</Badge></td>
                        <td>
                          <div>{t.note}</div>
                          {t.by && <div className="cell-sub">by {t.by}</div>}
                        </td>
                        <td className={`num nowrap amount ${t.amount > 0 ? 'amount--in' : 'amount--out'}`}>{signed(t.amount)}</td>
                        <td className="num">{money(t.balanceAfter)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={rows.length} onChange={setPage} />
          </>
        )}
      </section>
      <p className="footnote">Cashback is added after an order is delivered. Refunds land here when a cancelled order is refunded to the wallet.</p>

      <Modal open={Boolean(adjusting)} onClose={() => setAdjusting(null)} title={adjusting?.customerId ? `Adjust ${adjusting.customerName}’s wallet` : 'Add or deduct money'}>
        {adjusting && <AdjustForm customer={adjusting.customerId ? adjusting : null} reasons={settings?.walletReasons || []} onDone={saved => { setAdjusting(null); if (saved) reload(); }} />}
      </Modal>
    </>
  );
}
