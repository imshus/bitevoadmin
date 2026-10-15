import { useState } from 'react';
import { products as api, CATEGORIES } from '../api/index.js';
import { useApi, usePatch, usePageTitle } from '../lib/useApi.js';
import { money } from '../lib/format.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Badge, Switch, Field, Segmented, SearchInput, Modal, useConfirm, Loading, ErrorState, EmptyState, VegMark } from '../components/ui.jsx';
import { Plus, Pencil, Trash, Box, Star } from '../components/Icons.jsx';

const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map(c => [c.key, c.label]));

const EMPTY = {
  name: '', category: CATEGORIES[0].key, price: '', mrp: '', prepTimeMins: 20, description: '',
  image: '', isVeg: true, isAvailable: true, isBestseller: false,
};

function Thumb({ src, alt }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return <span className="thumb thumb--empty"><Box size={18} /></span>;
  return <img className="thumb" src={src} alt={alt} loading="lazy" onError={() => setBroken(true)} />;
}

function validate(f) {
  const e = {};
  if (!f.name.trim()) e.name = 'Enter a product name.';
  if (!(Number(f.price) > 0)) e.price = 'Enter a price above ₹0.';
  if (f.mrp !== '' && f.mrp != null && Number(f.mrp) < Number(f.price)) e.mrp = 'MRP can’t be lower than the price.';
  if (!(Number(f.prepTimeMins) > 0)) e.prepTimeMins = 'Enter the prep time in minutes.';
  if (f.image && !/^https?:\/\//.test(f.image)) e.image = 'Use a full image link starting with https://';
  return e;
}

function ProductForm({ product, onDone }) {
  const toast = useToast();
  const [form, setForm] = useState(() => ({ ...EMPTY, ...product, mrp: product?.mrp ?? '' }));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const submit = async e => {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    setFormError(null);
    const doc = {
      name: form.name.trim(),
      category: form.category,
      price: Number(form.price),
      mrp: form.mrp === '' ? null : Number(form.mrp),
      prepTimeMins: Number(form.prepTimeMins),
      description: form.description.trim(),
      image: form.image.trim(),
      isVeg: form.isVeg,
      isAvailable: form.isAvailable,
      isBestseller: form.isBestseller,
    };
    try {
      if (product?._id) await api.update(product._id, doc);
      else await api.create(doc);
      toast(product?._id ? `${doc.name} updated` : `${doc.name} added to the menu`);
      onDone(true);
    } catch (err) {
      setFormError(err.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <div className="modal__body">
        {formError && <div className="notice notice--error" role="alert">{formError}</div>}
        <div className="form-grid">
          <Field label="Product name" error={errors.name} span>
            <input className="input" value={form.name} onChange={e => set('name', e.target.value)} data-autofocus />
          </Field>
          <Field label="Category">
            <select className="input" value={form.category} onChange={e => set('category', e.target.value)}>
              {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="Food type">
            <Segmented label="Food type" value={form.isVeg} onChange={v => set('isVeg', v)} options={[{ value: true, label: 'Veg' }, { value: false, label: 'Non-veg' }]} />
          </Field>
          <Field label="Price (₹)" error={errors.price}>
            <input className="input" type="number" min="1" inputMode="numeric" value={form.price} onChange={e => set('price', e.target.value)} />
          </Field>
          <Field label="MRP (₹)" error={errors.mrp} hint="Optional. Shown struck through when higher than the price.">
            <input className="input" type="number" min="1" inputMode="numeric" value={form.mrp} onChange={e => set('mrp', e.target.value)} />
          </Field>
          <Field label="Prep time (minutes)" error={errors.prepTimeMins}>
            <input className="input" type="number" min="1" inputMode="numeric" value={form.prepTimeMins} onChange={e => set('prepTimeMins', e.target.value)} />
          </Field>
          <Field label="Image link" error={errors.image} hint="Paste a link to the dish photo.">
            <input className="input" type="url" value={form.image} onChange={e => set('image', e.target.value)} placeholder="https://" />
          </Field>
          <Field label="Description" span>
            <textarea className="input" rows="3" value={form.description} onChange={e => set('description', e.target.value)} />
          </Field>
          <div className="field field--span switch-row">
            <Switch checked={form.isAvailable} onChange={v => set('isAvailable', v)} label="Available to order" hideLabel={false} />
            <Switch checked={form.isBestseller} onChange={v => set('isBestseller', v)} label="Mark as bestseller" hideLabel={false} />
          </div>
        </div>
      </div>
      <div className="modal__foot">
        <button type="button" className="btn btn--ghost" onClick={() => onDone(false)}>Cancel</button>
        <button className="btn btn--primary" disabled={busy}>{busy ? 'Saving…' : product?._id ? 'Save changes' : 'Add product'}</button>
      </div>
    </form>
  );
}

export default function Products() {
  usePageTitle('Products');
  const toast = useToast();
  const { data, loading, refreshing, error, reload } = useApi(() => api.list());
  const [view, patch] = usePatch(reload);
  const [confirm, confirmDialog] = useConfirm();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [stock, setStock] = useState('all');
  const [editing, setEditing] = useState(null);

  const all = (data || []).map(view);
  const inCategory = all.filter(p => category === 'all' || p.category === category);
  const rows = inCategory
    .filter(p => stock === 'all' || (stock === 'available' ? p.isAvailable : !p.isAvailable))
    .filter(p => !query || `${p.name} ${p.description}`.toLowerCase().includes(query.trim().toLowerCase()));

  const toggleAvailable = (p, value) =>
    patch(p._id, { isAvailable: value }, api.update)
      .then(() => toast(value ? `${p.name} is back on the menu` : `${p.name} marked out of stock`))
      .catch(err => toast(err.message, 'critical'));

  const remove = async p => {
    const ok = await confirm({ title: `Delete ${p.name}?`, message: 'It will be removed from the menu straight away. This can’t be undone.', confirmLabel: 'Delete product', danger: true });
    if (!ok) return;
    try {
      await api.remove(p._id);
      await reload();
      toast(`${p.name} deleted`);
    } catch (err) {
      toast(err.message, 'critical');
    }
  };

  const outCount = all.filter(p => !p.isAvailable).length;

  return (
    <>
      <PageHeader title="Products" subtitle={data ? `${all.length} items on the menu · ${outCount} out of stock` : 'Your menu items'}>
        <button className="btn btn--primary" onClick={() => setEditing({})}><Plus size={18} />Add product</button>
      </PageHeader>

      <div className="toolbar">
        <SearchInput value={query} onChange={setQuery} placeholder="Search products" />
        <select className="input input--auto" value={category} onChange={e => setCategory(e.target.value)} aria-label="Category">
          <option value="all">All categories</option>
          {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <Segmented
          label="Stock"
          value={stock}
          onChange={setStock}
          options={[
            { value: 'all', label: 'All', count: inCategory.length },
            { value: 'available', label: 'Available', count: inCategory.filter(p => p.isAvailable).length },
            { value: 'out', label: 'Out of stock', count: inCategory.filter(p => !p.isAvailable).length },
          ]}
        />
      </div>

      <section className={`card${refreshing ? ' is-refreshing' : ''}`}>
        {loading ? <Loading /> : error && !data ? <ErrorState error={error} onRetry={reload} /> : rows.length === 0 ? (
          <EmptyState icon={<Box />} title="No products found" text={all.length ? 'Try a different search or filter.' : 'Add your first menu item to get started.'}
            action={!all.length && <button className="btn btn--primary" onClick={() => setEditing({})}><Plus size={18} />Add product</button>} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th className="num">Price</th>
                  <th className="num">Prep time</th>
                  <th>Available</th>
                  <th className="actions-col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(p => (
                  <tr key={p._id} className={p.isAvailable ? undefined : 'is-muted'}>
                    <td>
                      <div className="cell-product">
                        <Thumb src={p.image} alt={p.name} />
                        <div>
                          <div className="cell-title">
                            <VegMark veg={p.isVeg} />
                            {p.name}
                            {p.isBestseller && <span className="tag"><Star size={12} />Bestseller</span>}
                          </div>
                          <div className="cell-sub clamp">{p.description}</div>
                        </div>
                      </div>
                    </td>
                    <td className="nowrap">{CATEGORY_LABEL[p.category] || p.category}</td>
                    <td className="num">
                      <strong>{money(p.price)}</strong>
                      {p.mrp > p.price && <div className="cell-sub"><s>{money(p.mrp)}</s></div>}
                    </td>
                    <td className="num">{p.prepTimeMins} min</td>
                    <td>
                      <div className="switch-cell">
                        <Switch checked={p.isAvailable} onChange={v => toggleAvailable(p, v)} label={`${p.name} available`} />
                        {!p.isAvailable && <Badge tone="warning">Out of stock</Badge>}
                      </div>
                    </td>
                    <td className="actions-col">
                      <button className="icon-btn" onClick={() => setEditing(p)} aria-label={`Edit ${p.name}`} title="Edit"><Pencil size={18} /></button>
                      <button className="icon-btn icon-btn--danger" onClick={() => remove(p)} aria-label={`Delete ${p.name}`} title="Delete"><Trash size={18} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?._id ? `Edit ${editing.name}` : 'Add product'} wide>
        {editing && <ProductForm product={editing} onDone={saved => { setEditing(null); if (saved) reload(); }} />}
      </Modal>
      {confirmDialog}
    </>
  );
}
