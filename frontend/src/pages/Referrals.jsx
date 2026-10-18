import { useEffect, useState } from 'react';
import { referrals as api } from '../api/index.js';
import { useApi, usePageTitle } from '../lib/useApi.js';
import { money, num, pct, dateOnly, dateTime, dayLabel } from '../lib/format.js';
import { REFERRAL_STATUS } from '../lib/status.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Badge, Segmented, SearchInput, Modal, Field, Loading, ErrorState, EmptyState, StatTile, Pagination } from '../components/ui.jsx';
import { UserPlus, Clock, Gift, Wallet as WalletIcon, Refresh } from '../components/Icons.jsx';

const PAGE_SIZE = 20;

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'rewarded', label: 'Rewarded' },
  { value: 'void', label: 'Voided' },
];

const VOID_REASONS = ['Same person as the inviter', 'Fake or duplicate account', 'Orders look staged', 'Inviter asked to cancel'];

// Referrals are written by the website, so an unexpected status still gets a badge.
const statusOf = r => REFERRAL_STATUS[r.status] || { label: r.status || 'Unknown', tone: 'neutral' };
const digits = value => String(value || '').replace(/\D/g, '');
// "18 Oct" this year, "18 Oct 2025" before that (keeps the wide table narrower).
const shortDate = v => (new Date(v).getFullYear() === new Date().getFullYear() ? dayLabel(v) : dateOnly(v));

function VoidForm({ referral: r, onDone, onStale }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async e => {
    e.preventDefault();
    if (!reason.trim()) return setError('Add a reason, so the team knows why.');
    setBusy(true);
    setError(null);
    try {
      await api.void(r._id, reason.trim());
      toast(`Referral voided. ${r.referrerName} won’t get the ${money(r.reward)}.`);
      onDone(true);
    } catch (err) {
      setError(err.message);
      setBusy(false);
      if (err.status === 409) onStale(); // rewarded or voided since the list loaded
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <div className="modal__body">
        {error && <div className="notice notice--error" role="alert">{error}</div>}
        <p className="confirm-text">
          {r.friendName} joined with {r.referrerName}’s code <strong>{r.code}</strong> and has {num(r.ordersDelivered)} of {num(r.ordersNeeded)} orders
          delivered. Voiding stops the {money(r.reward)} reward, and it can’t be undone.
        </p>
        <Field label="Reason" hint="Saved with the referral. On the website, the inviter sees this friend as “Not eligible”.">
          <input className="input" list="void-reasons" value={reason} onChange={e => setReason(e.target.value)} maxLength={120} data-autofocus />
          <datalist id="void-reasons">{VOID_REASONS.map(v => <option key={v} value={v} />)}</datalist>
        </Field>
      </div>
      <div className="modal__foot">
        <button type="button" className="btn btn--ghost" onClick={() => onDone(false)}>Cancel</button>
        <button className="btn btn--danger" disabled={busy}>{busy ? 'Voiding…' : 'Void referral'}</button>
      </div>
    </form>
  );
}

export default function Referrals() {
  usePageTitle('Referrals');
  const { data, loading, refreshing, error, reload } = useApi(() => api.list());
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [voiding, setVoiding] = useState(null);

  useEffect(() => setPage(1), [status, query]);

  const q = query.trim().toLowerCase();
  // Phones are saved as "+91 98765 43210", so a number search compares digits only.
  const qDigits = /^[\d\s()+-]+$/.test(q) ? digits(q) : '';
  const matches = r => !q
    || `${r.referrerName} ${r.friendName} ${r.code}`.toLowerCase().includes(q)
    || (qDigits && [r.referrerPhone, r.friendPhone].some(p => digits(p).includes(qDigits)));
  const all = data?.referrals || [];
  const searched = all.filter(matches);
  const rows = status === 'all' ? searched : searched.filter(r => r.status === status);
  const shown = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totals = data?.totals;

  return (
    <>
      <PageHeader eyebrow="Refer & earn" title="Referrals" subtitle="Friends who joined BiteVo with a customer’s referral code. Once a friend’s orders are delivered, the inviter gets the reward in their wallet.">
        <button className="btn btn--outline" onClick={reload} disabled={refreshing}><Refresh size={18} />{refreshing ? 'Refreshing…' : 'Refresh'}</button>
      </PageHeader>

      <div className="stats">
        <StatTile icon={<UserPlus size={18} />} label="Referrals" value={totals ? num(totals.referrals) : '—'} hint="Friends who joined with a code" />
        <StatTile icon={<Clock size={18} />} label="Waiting for orders" value={totals ? num(totals.pending) : '—'} hint={totals ? `Up to ${money(totals.due)} more to pay` : ''} />
        <StatTile icon={<Gift size={18} />} label="Rewarded" value={totals ? num(totals.rewarded) : '—'} hint={totals?.referrals ? `${pct(totals.rewarded / totals.referrals)} of referrals` : ''} />
        <StatTile icon={<WalletIcon size={18} />} label="Paid out" value={totals ? money(totals.paidOut) : '—'} hint="As wallet cashback, all time" />
      </div>

      <div className="toolbar">
        <SearchInput value={query} onChange={setQuery} placeholder="Search name, phone or code" />
        <Segmented label="Status" value={status} onChange={setStatus}
          options={STATUS_FILTERS.map(f => ({ value: f.value, label: f.label, count: f.value === 'all' ? searched.length : searched.filter(r => r.status === f.value).length }))} />
      </div>

      <section className={`card${refreshing ? ' is-refreshing' : ''}`}>
        {loading ? <Loading /> : error && !data ? <ErrorState error={error} onRetry={reload} /> : rows.length === 0 ? (
          all.length === 0
            ? <EmptyState icon={<UserPlus />} title="No referrals yet" text="When a friend signs up with a customer’s referral code, it shows up here." />
            : <EmptyState icon={<UserPlus />} title="Nothing here" text="Try a different search or filter." />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Inviter</th>
                    <th>Friend</th>
                    <th>Code</th>
                    <th>Status</th>
                    <th className="num">Orders delivered</th>
                    <th className="num">Reward</th>
                    <th>Joined</th>
                    <th>Rewarded</th>
                    <th className="actions-col"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map(r => {
                    const s = statusOf(r);
                    return (
                      <tr key={r._id} className={r.status === 'void' ? 'is-muted' : undefined}>
                        <td className="nowrap">
                          <div className="cell-title">{r.referrerName}</div>
                          <div className="cell-sub">{r.referrerPhone || 'Account not found'}</div>
                        </td>
                        <td className="nowrap">
                          <div className="cell-title">{r.friendName}</div>
                          <div className="cell-sub">{r.friendPhone}</div>
                        </td>
                        <td><code className="code">{r.code}</code></td>
                        <td>
                          <Badge tone={s.tone}>{s.label}</Badge>
                          {r.status === 'void' && r.voidReason && <div className="cell-sub">{r.voidReason}</div>}
                          {r.status === 'void' && r.voidedBy && <div className="cell-sub nowrap">by {r.voidedBy}{r.voidedAt ? `, ${shortDate(r.voidedAt)}` : ''}</div>}
                        </td>
                        <td className="num nowrap">{num(Math.min(r.ordersDelivered || 0, r.ordersNeeded))} of {num(r.ordersNeeded)}</td>
                        <td className="num">{money(r.reward)}</td>
                        <td className="nowrap" title={dateTime(r.createdAt)}>{shortDate(r.createdAt)}</td>
                        <td className="nowrap" title={r.rewardedAt ? dateTime(r.rewardedAt) : undefined}>{r.rewardedAt ? shortDate(r.rewardedAt) : '—'}</td>
                        <td className="actions-col">
                          {r.status === 'pending' && (
                            <button type="button" className="btn btn--sm btn--ghost btn--ghost-danger" onClick={() => setVoiding(r)} aria-label={`Void ${r.friendName}’s referral`}>Void</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={rows.length} onChange={setPage} />
          </>
        )}
      </section>
      <p className="footnote">The website checks for delivered orders every few minutes and pays the reward itself, as wallet cashback. Void a pending referral to stop its reward.</p>

      <Modal open={Boolean(voiding)} onClose={() => setVoiding(null)} title={voiding ? `Void ${voiding.friendName}’s referral?` : ''}>
        {voiding && <VoidForm referral={voiding} onStale={reload} onDone={saved => { setVoiding(null); if (saved) reload(); }} />}
      </Modal>
    </>
  );
}
