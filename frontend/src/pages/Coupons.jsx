import { useState } from 'react';
import { coupons as api, products as productApi } from '../api/index.js';
import { useApi, usePatch, usePageTitle } from '../lib/useApi.js';
import { money, num, dateOnly, dayLabel, toInputDate, fromInputDate } from '../lib/format.js';
import { couponStatus, describeOffer } from '../lib/status.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Badge, Switch, Field, Segmented, SearchInput, Modal, useConfirm, Loading, ErrorState, EmptyState, Meter } from '../components/ui.jsx';
import { Plus, Pencil, Trash, Ticket, Copy } from '../components/Icons.jsx';

const DAY = 86400000;

const TYPES = [
  { value: 'percent', label: 'Percentage' },
  { value: 'flat', label: 'Flat amount' },
  { value: 'free_delivery', label: 'Free delivery' },
  { value: 'free_item', label: 'Free product' },
  { value: 'cashback', label: 'Wallet cashback' },
];

function whenText(c, now = Date.now()) {
  const start = Date.parse(c.startsAt);
  const end = Date.parse(c.expiresAt);
  const days = ms => Math.max(1, Math.round(ms / DAY));
  if (start > now) return `Starts in ${days(start - now)} day${days(start - now) > 1 ? 's' : ''}`;
  if (end < now) return `Ended ${days(now - end)} day${days(now - end) > 1 ? 's' : ''} ago`;
  const left = days(end - now);
  return left <= 7 ? `Ends in ${left} day${left > 1 ? 's' : ''}` : `${left} days left`;
}

function blankCoupon() {
  const now = Date.now();
  return {
    code: '', description: '', discountType: 'percent', discountValue: 10, maxDiscount: 100, minOrderValue: 199,
    startsAt: new Date(now).toISOString(), expiresAt: new Date(now + 30 * DAY).toISOString(),
    usageLimit: '', perUserLimit: 1, firstOrderOnly: false, isActive: true,
    freeItem: null, cashbackUnit: 'percent',
  };
}

function validate(f) {
  const e = {};
  if (!/^[A-Z0-9]{3,20}$/.test(f.code)) e.code = 'Use 3–20 capital letters or digits, no spaces.';
  if (f.discountType === 'percent' && !(Number(f.discountValue) > 0 && Number(f.discountValue) <= 100)) e.discountValue = 'Enter a percentage from 1 to 100.';
  if (f.discountType === 'flat' && !(Number(f.discountValue) > 0)) e.discountValue = 'Enter an amount above ₹0.';
  if (f.discountType === 'free_item') {
    if (!f.freeProductId) e.freeProductId = 'Pick the product customers get for free.';
    if (!(Number(f.freeQty) >= 1 && Number(f.freeQty) <= 10)) e.freeQty = 'Enter 1 to 10.';
  }
  if (f.discountType === 'cashback') {
    const v = Number(f.discountValue);
    if (f.cashbackUnit === 'percent' ? !(v > 0 && v <= 100) : !(v > 0)) {
      e.discountValue = f.cashbackUnit === 'percent' ? 'Enter a percentage from 1 to 100.' : 'Enter an amount above ₹0.';
    }
  }
  if (f.minOrderValue === '' || Number(f.minOrderValue) < 0) e.minOrderValue = 'Enter ₹0 or more.';
  if (!f.startsAt) e.startsAt = 'Pick a start date.';
  if (!f.expiresAt) e.expiresAt = 'Pick an end date.';
  else if (f.startsAt && f.expiresAt < f.startsAt) e.expiresAt = 'The end date must be on or after the start date.';
  if (f.usageLimit !== '' && !(Number(f.usageLimit) > 0)) e.usageLimit = 'Leave empty for no limit, or enter 1 or more.';
  if (!(Number(f.perUserLimit) > 0)) e.perUserLimit = 'Enter 1 or more.';
  return e;
}

function CouponForm({ coupon, onDone }) {
  const toast = useToast();
  const { data: menu } = useApi(() => productApi.list());
  const start = coupon?._id ? coupon : blankCoupon();
  const [form, setForm] = useState(() => ({
    ...start,
    maxDiscount: start.maxDiscount ?? '',
    usageLimit: start.usageLimit ?? '',
    startsAt: toInputDate(start.startsAt),
    expiresAt: toInputDate(start.expiresAt),
    freeProductId: start.freeItem?.productId || '',
    freeQty: start.freeItem?.qty || 1,
    cashbackUnit: start.cashbackUnit || 'percent',
  }));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const type = form.discountType;
  const usesPercent = type === 'percent' || (type === 'cashback' && form.cashbackUnit === 'percent');
  const freeProduct = menu?.find(p => p._id === form.freeProductId);
  const doc = {
    code: form.code.trim().toUpperCase(),
    description: form.description.trim(),
    discountType: type,
    discountValue: type === 'free_delivery' || type === 'free_item' ? 0 : Number(form.discountValue),
    maxDiscount: usesPercent && form.maxDiscount !== '' ? Number(form.maxDiscount) : null,
    freeItem: type === 'free_item' && form.freeProductId
      ? { productId: form.freeProductId, name: freeProduct?.name || form.freeItem?.name || '', qty: Number(form.freeQty) || 1 }
      : null,
    cashbackUnit: type === 'cashback' ? form.cashbackUnit : null,
    minOrderValue: Number(form.minOrderValue) || 0,
    startsAt: fromInputDate(form.startsAt),
    expiresAt: fromInputDate(form.expiresAt, true),
    usageLimit: form.usageLimit === '' ? null : Number(form.usageLimit),
    perUserLimit: Number(form.perUserLimit),
    firstOrderOnly: form.firstOrderOnly,
    isActive: form.isActive,
  };

  const submit = async e => {
    e.preventDefault();
    const found = validate({ ...form, code: doc.code });
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    setFormError(null);
    try {
      if (coupon?._id) await api.update(coupon._id, doc);
      else await api.create(doc);
      toast(coupon?._id ? `${doc.code} updated` : `${doc.code} created`);
      onDone(true);
    } catch (err) {
      setFormError(err.message);
      setBusy(false);
    }
  };

  const valueOk = type === 'free_delivery' || (type === 'free_item' ? Boolean(doc.freeItem) : doc.discountValue > 0);

  return (
    <form onSubmit={submit} noValidate>
      <div className="modal__body">
        {formError && <div className="notice notice--error" role="alert">{formError}</div>}
        <div className="form-grid">
          <Field label="Coupon code" error={errors.code} hint="Customers type this at checkout.">
            <input className="input input--code" value={form.code} onChange={e => set('code', e.target.value.toUpperCase().replace(/\s/g, ''))} maxLength={20} data-autofocus />
          </Field>
          <Field label="Short description" hint="Shown to customers in the app.">
            <input className="input" value={form.description} onChange={e => set('description', e.target.value)} placeholder="e.g. 20% off on biryani" />
          </Field>
          <Field label="Offer type" span>
            <Segmented label="Offer type" value={type} onChange={v => set('discountType', v)} options={TYPES} />
          </Field>
          {type === 'free_item' && (
            <>
              <Field label="Free product" error={errors.freeProductId}>
                <select className="input" value={form.freeProductId} onChange={e => set('freeProductId', e.target.value)}>
                  <option value="">Choose from the menu…</option>
                  {(menu || []).map(p => (
                    <option key={p._id} value={p._id}>{p.name} ({money(p.price)}){p.isAvailable ? '' : ' · out of stock'}</option>
                  ))}
                </select>
              </Field>
              <Field label="Quantity" error={errors.freeQty}>
                <input className="input" type="number" min="1" max="10" inputMode="numeric" value={form.freeQty} onChange={e => set('freeQty', e.target.value)} />
              </Field>
            </>
          )}
          {type === 'cashback' && (
            <Field label="Cashback in" span>
              <Segmented label="Cashback in" value={form.cashbackUnit} onChange={v => set('cashbackUnit', v)}
                options={[{ value: 'percent', label: 'Percent of order' }, { value: 'flat', label: 'Fixed amount' }]} />
            </Field>
          )}
          {(type === 'percent' || type === 'flat' || type === 'cashback') && (
            <Field label={`${type === 'cashback' ? 'Cashback' : 'Discount'} (${usesPercent ? '%' : '₹'})`} error={errors.discountValue}
              hint={type === 'cashback' ? 'Added to the customer’s BiteVo wallet after delivery.' : undefined}>
              <input className="input" type="number" min="1" inputMode="numeric" value={form.discountValue} onChange={e => set('discountValue', e.target.value)} />
            </Field>
          )}
          {usesPercent && (
            <Field label={`Maximum ${type === 'cashback' ? 'cashback' : 'discount'} (₹)`} hint="Optional cap.">
              <input className="input" type="number" min="1" inputMode="numeric" value={form.maxDiscount} onChange={e => set('maxDiscount', e.target.value)} />
            </Field>
          )}
          <Field label="Minimum order (₹)" error={errors.minOrderValue}>
            <input className="input" type="number" min="0" inputMode="numeric" value={form.minOrderValue} onChange={e => set('minOrderValue', e.target.value)} />
          </Field>
          <Field label="Starts on" error={errors.startsAt}>
            <input className="input" type="date" value={form.startsAt} onChange={e => set('startsAt', e.target.value)} />
          </Field>
          <Field label="Ends on" error={errors.expiresAt}>
            <input className="input" type="date" value={form.expiresAt} onChange={e => set('expiresAt', e.target.value)} />
          </Field>
          <Field label="Total uses allowed" error={errors.usageLimit} hint="Leave empty for no limit.">
            <input className="input" type="number" min="1" inputMode="numeric" value={form.usageLimit} onChange={e => set('usageLimit', e.target.value)} />
          </Field>
          <Field label="Uses per customer" error={errors.perUserLimit}>
            <input className="input" type="number" min="1" inputMode="numeric" value={form.perUserLimit} onChange={e => set('perUserLimit', e.target.value)} />
          </Field>
          <div className="field field--span switch-row">
            <Switch checked={form.firstOrderOnly} onChange={v => set('firstOrderOnly', v)} label="First order only" hideLabel={false} />
            <Switch checked={form.isActive} onChange={v => set('isActive', v)} label="Coupon is live" hideLabel={false} />
          </div>
        </div>
        {valueOk && (
          <p className="preview">
            <Ticket size={18} />
            <span>
              Customers get <strong>{describeOffer(doc)}</strong>
              {type === 'free_item' && freeProduct ? ` (worth ${money(freeProduct.price * doc.freeItem.qty)})` : ''}
              {doc.minOrderValue > 0 ? ` on orders of ${money(doc.minOrderValue)} or more` : ' on any order'}
              {doc.firstOrderOnly ? ', on their first order only' : ''}.
            </span>
          </p>
        )}
      </div>
      <div className="modal__foot">
        <button type="button" className="btn btn--ghost" onClick={() => onDone(false)}>Cancel</button>
        <button className="btn btn--primary" disabled={busy}>{busy ? 'Saving…' : coupon?._id ? 'Save changes' : 'Create coupon'}</button>
      </div>
    </form>
  );
}

const FILTERS = [
  { value: 'all', label: 'All', match: () => true },
  { value: 'active', label: 'Active', match: s => s === 'active' },
  { value: 'scheduled', label: 'Scheduled', match: s => s === 'scheduled' },
  { value: 'paused', label: 'Paused', match: s => s === 'paused' },
  { value: 'ended', label: 'Ended', match: s => s === 'expired' || s === 'used_up' },
];

export default function Coupons() {
  usePageTitle('Coupons');
  const toast = useToast();
  const { data, loading, refreshing, error, reload } = useApi(() => api.list());
  const [view, patch] = usePatch(reload);
  const [confirm, confirmDialog] = useConfirm();
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null);

  const all = (data || []).map(view).map(c => ({ ...c, status: couponStatus(c) }));
  const searched = all.filter(c => !query || `${c.code} ${c.description}`.toLowerCase().includes(query.trim().toLowerCase()));
  const rows = searched.filter(c => FILTERS.find(f => f.value === filter).match(c.status.key));

  const toggle = (c, value) =>
    patch(c._id, { isActive: value }, api.update)
      .then(() => toast(value ? `${c.code} is live` : `${c.code} paused`))
      .catch(err => toast(err.message, 'critical'));

  const copyCode = code =>
    navigator.clipboard?.writeText(code).then(() => toast(`Copied ${code}`), () => toast('Couldn’t copy the code', 'critical'));

  const remove = async c => {
    const ok = await confirm({
      title: `Delete ${c.code}?`,
      message: c.usedCount ? `It has been used ${num(c.usedCount)} times. Customers won’t be able to use it any more. Pausing keeps its history instead.` : 'Customers won’t be able to use it any more.',
      confirmLabel: 'Delete coupon',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.remove(c._id);
      await reload();
      toast(`${c.code} deleted`);
    } catch (err) {
      toast(err.message, 'critical');
    }
  };

  const activeCount = all.filter(c => c.status.key === 'active').length;

  return (
    <>
      <PageHeader eyebrow="Offers" title="Coupons" subtitle={data ? `${activeCount} live now · ${all.length} in total` : 'Discount codes for the BiteVo app'}>
        <button className="btn btn--primary" onClick={() => setEditing({})}><Plus size={18} />Create coupon</button>
      </PageHeader>

      <div className="toolbar">
        <SearchInput value={query} onChange={setQuery} placeholder="Search codes" />
        <Segmented label="Status" value={filter} onChange={setFilter}
          options={FILTERS.map(f => ({ value: f.value, label: f.label, count: searched.filter(c => f.match(c.status.key)).length }))} />
      </div>

      <section className={`card${refreshing ? ' is-refreshing' : ''}`}>
        {loading ? <Loading /> : error && !data ? <ErrorState error={error} onRetry={reload} /> : rows.length === 0 ? (
          <EmptyState icon={<Ticket />} title="No coupons here" text={all.length ? 'Try a different search or filter.' : 'Create a coupon to run your first offer.'}
            action={!all.length && <button className="btn btn--primary" onClick={() => setEditing({})}><Plus size={18} />Create coupon</button>} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Offer</th>
                  <th>Valid</th>
                  <th>Usage</th>
                  <th>Status</th>
                  <th>Live</th>
                  <th className="actions-col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(c => (
                  <tr key={c._id}>
                    <td>
                      <div className="cell-code">
                        <code className="code">{c.code}</code>
                        <button className="icon-btn icon-btn--sm" onClick={() => copyCode(c.code)} aria-label={`Copy ${c.code}`} title="Copy code"><Copy size={15} /></button>
                      </div>
                      <div className="cell-sub clamp">{c.description}</div>
                    </td>
                    <td>
                      <div className="cell-title">{describeOffer(c)}</div>
                      <div className="cell-sub">
                        {c.minOrderValue ? `Min. order ${money(c.minOrderValue)}` : 'No minimum'}
                        {c.firstOrderOnly && ' · First order'}
                      </div>
                    </td>
                    <td className="nowrap">
                      <div>{dayLabel(c.startsAt)} – {dateOnly(c.expiresAt)}</div>
                      <div className="cell-sub">{whenText(c)}</div>
                    </td>
                    <td className="usage-cell">
                      <div className="nowrap"><strong>{num(c.usedCount)}</strong>{c.usageLimit ? <span className="muted"> / {num(c.usageLimit)}</span> : <span className="muted"> used · no limit</span>}</div>
                      {c.usageLimit && <Meter value={c.usedCount} max={c.usageLimit} label={`${c.code} usage`} />}
                    </td>
                    <td><Badge tone={c.status.tone}>{c.status.label}</Badge></td>
                    <td>
                      <Switch checked={c.isActive} onChange={v => toggle(c, v)} label={`${c.code} live`} disabled={c.status.key === 'expired'} />
                    </td>
                    <td className="actions-col">
                      <button className="icon-btn" onClick={() => setEditing(c)} aria-label={`Edit ${c.code}`} title="Edit"><Pencil size={18} /></button>
                      <button className="icon-btn icon-btn--danger" onClick={() => remove(c)} aria-label={`Delete ${c.code}`} title="Delete"><Trash size={18} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?._id ? `Edit ${editing.code}` : 'Create coupon'} wide>
        {editing && <CouponForm coupon={editing} onDone={saved => { setEditing(null); if (saved) reload(); }} />}
      </Modal>
      {confirmDialog}
    </>
  );
}
