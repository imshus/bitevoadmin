import { useState } from 'react';
import { products as api, categories as categoryApi } from '../api/index.js';
import { useApi, usePatch, usePageTitle } from '../lib/useApi.js';
import { money } from '../lib/format.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Badge, Switch, Field, Segmented, SearchInput, Modal, useConfirm, Loading, ErrorState, EmptyState, VegMark } from '../components/ui.jsx';
import ImageField from '../components/ImageField.jsx';
import { Plus, Pencil, Trash, Box, Star, Layers, X, Tag } from '../components/Icons.jsx';

const NEW_CATEGORY = '__new';

const EMPTY = {
  type: 'single', name: '', heading: '', category: '', price: '', mrp: '', halfPrice: '', prepTimeMins: 20, description: '',
  image: '', isVeg: true, isAvailable: true, isBestseller: false, comboItems: [],
};

const isCombo = p => p?.type === 'combo';

// "Chicken Biryani + 2 × Samosa + Cold Coffee"
const comboSummary = items => items.map(i => `${i.qty > 1 ? `${i.qty} × ` : ''}${i.name}`).join(' + ');

// What the combo's dishes cost if bought one by one, at today's prices.
const comboWorth = (items, menu) =>
  items.reduce((sum, i) => sum + (menu.find(p => p._id === i.productId)?.price || 0) * (Number(i.qty) || 0), 0);

function Thumb({ src, alt }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return <span className="thumb thumb--empty"><Box size={18} /></span>;
  return <img className="thumb" src={src} alt={alt} loading="lazy" onError={() => setBroken(true)} />;
}

function validate(f) {
  const e = {};
  if (!f.name.trim()) e.name = isCombo(f) ? 'Name the combo.' : 'Enter a product name.';
  if (isCombo(f)) {
    const lines = f.comboItems.filter(i => i.productId);
    if (f.comboItems.some(i => !i.productId)) e.comboItems = 'Pick a dish on every line, or remove empty lines.';
    else if (new Set(lines.map(i => i.productId)).size !== lines.length) e.comboItems = 'Each dish once: raise its quantity instead.';
    else if (lines.some(i => !(Number(i.qty) >= 1 && Number(i.qty) <= 10))) e.comboItems = 'Quantities must be 1–10.';
    else if (lines.reduce((s, i) => s + Number(i.qty), 0) < 2) e.comboItems = 'A combo needs at least 2 items.';
  }
  if ((f.heading || '').trim().length > 30) e.heading = 'Keep it to 30 characters or fewer.';
  if (!f.category) e.category = 'Pick a category.';
  if (!(Number(f.price) > 0)) e.price = 'Enter a price above ₹0.';
  if (f.mrp !== '' && f.mrp != null && Number(f.mrp) < Number(f.price)) e.mrp = 'MRP can’t be lower than the price.';
  if (!isCombo(f) && f.halfPrice !== '' && f.halfPrice != null) {
    if (!(Number(f.halfPrice) > 0)) e.halfPrice = 'Enter a price above ₹0, or leave it empty.';
    else if (Number(f.price) > 0 && Number(f.halfPrice) >= Number(f.price)) e.halfPrice = 'The half plate should cost less than the full plate.';
  }
  if (!(Number(f.prepTimeMins) > 0) && !(isCombo(f) && f.prepTimeMins === '')) e.prepTimeMins = 'Enter the prep time in minutes.';
  if (f.image && !/^(https?:\/\/|\/uploads\/)/.test(f.image.trim())) e.image = 'Use a full image link starting with https://, or upload a photo.';
  return e;
}

// Lines of a combo: pick a dish and how many.
function ComboItems({ items, menu, onChange, error }) {
  const setLine = (i, changes) => onChange(items.map((line, j) => (j === i ? { ...line, ...changes } : line)));
  return (
    <div className={`field field--span${error ? ' has-error' : ''}`}>
      <span className="field__label">What’s in the combo</span>
      <div className="combo-lines">
        {items.map((line, i) => (
          <div className="combo-line" key={i}>
            <select className="input" value={line.productId} onChange={e => setLine(i, { productId: e.target.value })} aria-label={`Dish ${i + 1}`}>
              <option value="">Choose a dish…</option>
              {menu.map(p => (
                <option key={p._id} value={p._id}>{p.name} ({money(p.price)}){p.isAvailable ? '' : ' · out of stock'}</option>
              ))}
            </select>
            <input className="input" type="number" min="1" max="10" inputMode="numeric" value={line.qty} onChange={e => setLine(i, { qty: e.target.value })} aria-label={`Quantity of dish ${i + 1}`} />
            <button type="button" className="icon-btn icon-btn--danger" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={`Remove dish ${i + 1}`} disabled={items.length <= 1}>
              <X size={18} />
            </button>
          </div>
        ))}
      </div>
      {error && <span className="field__error">{error}</span>}
      {items.length < 10 && (
        <button type="button" className="btn btn--ghost btn--sm combo-add" onClick={() => onChange([...items, { productId: '', qty: 1 }])}>
          <Plus size={16} />Add a dish
        </button>
      )}
    </div>
  );
}

// Popup for a new menu category. It is saved to the database straight away.
function CategoryForm({ onSaved, onCancel }) {
  const [label, setLabel] = useState('');
  const [image, setImage] = useState('');
  const [error, setError] = useState(null);
  const [imageError, setImageError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async e => {
    e.preventDefault();
    setError(label.trim() ? null : 'Enter a category name.');
    const badImage = image.trim() && !/^(https?:\/\/|\/uploads\/)/.test(image.trim());
    setImageError(badImage ? 'Use a full image link starting with https://, or upload a photo.' : null);
    if (!label.trim() || badImage) return;
    setBusy(true);
    try {
      onSaved(await categoryApi.create(label.trim(), image.trim()));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <div className="modal__body">
        <div className="form-grid">
          <Field label="Category name" error={error} span>
            <input className="input" value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Rolls & Wraps" maxLength={40} data-autofocus />
          </Field>
          <ImageField label="Category photo (optional)" value={image} onChange={setImage} error={imageError} alt={label} />
        </div>
      </div>
      <div className="modal__foot">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn--primary" disabled={busy}>{busy ? 'Saving…' : 'Add category'}</button>
      </div>
    </form>
  );
}

function ProductForm({ product, products, categories: initialCategories, onCategoryAdded, onDone }) {
  const [categories, setCategories] = useState(initialCategories);
  const [addingCategory, setAddingCategory] = useState(false);
  const toast = useToast();
  const combo = isCombo(product);
  const [form, setForm] = useState(() => ({
    ...EMPTY,
    category: (combo && categories.find(c => c.key === 'combos')?.key) || categories[0]?.key || '',
    ...(combo && !product._id ? { prepTimeMins: '', comboItems: [{ productId: '', qty: 1 }, { productId: '', qty: 1 }] } : {}),
    ...product,
    comboItems: product?.comboItems?.length ? product.comboItems.map(({ productId, qty }) => ({ productId, qty })) : combo && !product._id ? [{ productId: '', qty: 1 }, { productId: '', qty: 1 }] : [],
    mrp: product?.mrp ?? '',
    halfPrice: product?.halfPrice ?? '',
  }));
  const menu = products.filter(p => !isCombo(p));
  const chosen = form.comboItems.filter(i => i.productId);
  const worth = comboWorth(chosen, menu);
  // The struck-out price customers see (MRP, or for a combo the dishes' total) and the saving against it.
  const price = Number(form.price) || 0;
  const struck = form.mrp !== '' ? Number(form.mrp) : worth;
  const save = struck - price;
  const mrpTooHigh = combo && form.mrp !== '' && worth > 0 && Number(form.mrp) > worth;
  const comboVeg = chosen.every(i => menu.find(p => p._id === i.productId)?.isVeg !== false);
  const comboPrep = Math.max(0, ...chosen.map(i => menu.find(p => p._id === i.productId)?.prepTimeMins || 0));
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
      type: combo ? 'combo' : 'single',
      name: form.name.trim(),
      heading: (form.heading || '').trim(),
      category: form.category,
      price: Number(form.price),
      // A combo's MRP defaults to what its dishes cost separately, so the saving shows.
      mrp: form.mrp === '' ? (combo && worth > Number(form.price) ? worth : null) : Number(form.mrp),
      halfPrice: combo || form.halfPrice === '' ? null : Number(form.halfPrice),
      prepTimeMins: form.prepTimeMins === '' && combo ? comboPrep || 20 : Number(form.prepTimeMins),
      description: form.description.trim(),
      image: form.image.trim(),
      isVeg: combo ? comboVeg : form.isVeg,
      isAvailable: form.isAvailable,
      isBestseller: form.isBestseller,
      ...(combo ? { comboItems: chosen.map(i => ({ productId: i.productId, qty: Number(i.qty) })) } : {}),
    };
    try {
      if (product?._id) await api.update(product._id, doc);
      else await api.create(doc);
      toast(product?._id ? `${doc.name} updated` : `${doc.name} ${combo ? 'combo ' : ''}added to the menu`);
      onDone(true);
    } catch (err) {
      setFormError(err.message);
      setBusy(false);
    }
  };

  const categoryAdded = category => {
    setCategories(list => [...list, category]);
    set('category', category.key);
    setAddingCategory(false);
    toast(`Category “${category.label}” added`);
    onCategoryAdded?.();
  };

  return (
    <>
    <form onSubmit={submit} noValidate>
      <div className="modal__body">
        {formError && <div className="notice notice--error" role="alert">{formError}</div>}
        <div className="form-grid">
          <Field label={combo ? 'Combo name' : 'Product name'} error={errors.name}>
            <input className="input" value={form.name} onChange={e => set('name', e.target.value)} data-autofocus />
          </Field>
          <Field label="Heading" error={errors.heading} hint="Optional. Shown above the name, e.g. Chef’s special.">
            <input className="input" value={form.heading || ''} onChange={e => set('heading', e.target.value)} maxLength={30} placeholder="e.g. New, Spicy, Chef’s special" />
          </Field>
          <Field label="Category" error={errors.category}>
            <select className="input" value={form.category} onChange={e => (e.target.value === NEW_CATEGORY ? setAddingCategory(true) : set('category', e.target.value))}>
              {/* With no categories yet, a placeholder keeps "Add a new category…" selectable (so it opens the popup). */}
              {!form.category && <option value="" disabled>Choose a category…</option>}
              {categories.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              <option value={NEW_CATEGORY}>＋ Add a new category…</option>
            </select>
          </Field>
          {combo ? (
            <Field label="Food type" hint="Worked out from the dishes in the combo.">
              <span className="readonly"><VegMark veg={comboVeg} />{chosen.length ? (comboVeg ? 'Veg' : 'Non-veg') : '—'}</span>
            </Field>
          ) : (
            <Field label="Food type">
              <Segmented label="Food type" value={form.isVeg} onChange={v => set('isVeg', v)} options={[{ value: true, label: 'Veg' }, { value: false, label: 'Non-veg' }]} />
            </Field>
          )}
          {combo && <ComboItems items={form.comboItems} menu={menu} onChange={v => set('comboItems', v)} error={errors.comboItems} />}
          {combo && chosen.length > 0 && (
            <p className={`preview field--span${(price > 0 && save <= 0) || mrpTooHigh ? ' preview--bad' : ''}`}>
              <Layers size={18} />
              <span>
                These dishes cost <strong>{money(worth)}</strong> separately.
                {price > 0 && (save > 0
                  ? <> Customers see <s>{money(struck)}</s> and save <strong>{money(save)}</strong> ({Math.round((save / struck) * 100)}%).</>
                  : <> The combo price should be lower than {money(struck)}.</>)}
                {mrpTooHigh && <> Your MRP is {money(struck - worth)} more than the dishes cost separately, so the saving looks bigger than it really is.</>}
              </span>
            </p>
          )}
          <div className="field--span form-row-3">
            <Field label={combo ? 'Combo price (₹)' : 'Price (₹)'} error={errors.price}>
              <input className="input" type="number" min="1" inputMode="numeric" value={form.price} onChange={e => set('price', e.target.value)} />
            </Field>
            <Field label="MRP (₹)" error={errors.mrp} hint={combo ? 'Empty = the dishes’ total.' : 'Optional, shown struck through.'}>
              <input className="input" type="number" min="1" inputMode="numeric" value={form.mrp} onChange={e => set('mrp', e.target.value)} placeholder={combo && worth ? String(worth) : undefined} />
            </Field>
            <Field label="Prep time (min)" error={errors.prepTimeMins} hint={combo ? 'Empty = the slowest dish.' : undefined}>
              <input className="input" type="number" min="1" inputMode="numeric" value={form.prepTimeMins} onChange={e => set('prepTimeMins', e.target.value)} placeholder={combo && comboPrep ? String(comboPrep) : undefined} />
            </Field>
          </div>
          {!combo && (
            <Field label="Half plate price (₹)" error={errors.halfPrice} hint="Optional. When set, customers choose a half or a full plate; the price above is the full plate.">
              <input className="input" type="number" min="1" inputMode="numeric" value={form.halfPrice} onChange={e => set('halfPrice', e.target.value)} placeholder="No half plate" />
            </Field>
          )}
          <ImageField value={form.image} onChange={v => set('image', v)} error={errors.image} alt={form.name} />
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
        <button className="btn btn--primary" disabled={busy}>{busy ? 'Saving…' : product?._id ? 'Save changes' : combo ? 'Add combo' : 'Add product'}</button>
      </div>
    </form>

    {/* Outside the product <form>, so the two forms don't nest. */}
    <Modal open={addingCategory} onClose={() => setAddingCategory(false)} title="Add a new category">
      {addingCategory && <CategoryForm onSaved={categoryAdded} onCancel={() => setAddingCategory(false)} />}
    </Modal>
    </>
  );
}

// Asks where a category's products should go before it is deleted.
function MoveAndDelete({ category, categories, onConfirm, onCancel }) {
  const others = categories.filter(c => c._id !== category._id);
  const [moveTo, setMoveTo] = useState(others[0]?.key || '');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const n = category.productCount;

  const submit = async e => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onConfirm(moveTo);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <div className="modal__body">
        {error && <div className="notice notice--error" role="alert">{error}</div>}
        {others.length ? (
          <>
            <p className="confirm-text">“{category.label}” has <strong>{n} product{n === 1 ? '' : 's'}</strong>. Choose where {n === 1 ? 'it goes' : 'they go'}, then the category is deleted.</p>
            <Field label={`Move ${n === 1 ? 'its product' : `its ${n} products`} to`}>
              <select className="input" value={moveTo} onChange={e => setMoveTo(e.target.value)} data-autofocus>
                {others.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </Field>
          </>
        ) : (
          <p className="confirm-text">“{category.label}” is the only category, so its products have nowhere to go. Add another category first.</p>
        )}
      </div>
      <div className="modal__foot">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancel</button>
        {others.length > 0 && <button className="btn btn--danger" disabled={busy || !moveTo}>{busy ? 'Moving…' : `Move and delete`}</button>}
      </div>
    </form>
  );
}

// Lists the categories with how many products each has, with a delete button for each.
function CategoryManager({ categories, onDelete }) {
  return (
    <div className="modal__body">
      <p className="muted category-note">Deleting a category that has products moves them to another category you choose. No products are deleted.</p>
      {categories.length === 0 && <p className="category-empty">No categories yet. Add one from a product form with “＋ Add a new category…”.</p>}
      <ul className={`category-list${categories.length ? '' : ' is-empty'}`}>
        {categories.map(c => (
          <li key={c._id}>
            <Thumb src={c.image} alt={c.label} />
            <span className="category-list__name">{c.label}</span>
            <span className="muted">{c.productCount} product{c.productCount === 1 ? '' : 's'}</span>
            <button
              type="button"
              className="icon-btn icon-btn--danger"
              onClick={() => onDelete(c)}
              aria-label={`Delete ${c.label}`}
              title={`Delete ${c.label}`}
            >
              <Trash size={18} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Products() {
  usePageTitle('Products');
  const toast = useToast();
  const { data, loading, refreshing, error, reload } = useApi(() => api.list());
  const { data: categories, reload: reloadCategories } = useApi(() => categoryApi.list());
  const [view, patch] = usePatch(reload);
  const [confirm, confirmDialog] = useConfirm();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [stock, setStock] = useState('all');
  const [editing, setEditing] = useState(null);
  const [managing, setManaging] = useState(false);
  const [moving, setMoving] = useState(null); // a category with products being deleted

  const all = (data || []).map(view);
  const byId = new Map(all.map(p => [p._id, p]));
  const categoryLabel = Object.fromEntries((categories || []).map(c => [c.key, c.label]));
  const inCategory = all.filter(p => category === 'all' || p.category === category);
  const STOCK_FILTERS = {
    all: () => true,
    combos: isCombo,
    available: p => p.isAvailable,
    out: p => !p.isAvailable,
  };
  const rows = inCategory
    .filter(STOCK_FILTERS[stock])
    .filter(p => !query || `${p.name} ${p.heading || ''} ${p.description}`.toLowerCase().includes(query.trim().toLowerCase()));

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

  const categoryDeleted = async (c, movedTo) => {
    if (category === c.key) setCategory('all');
    await Promise.all([reloadCategories(), reload()]);
    const target = movedTo && categories.find(x => x.key === movedTo)?.label;
    toast(target ? `“${c.label}” deleted; ${c.productCount} product${c.productCount === 1 ? '' : 's'} moved to “${target}”` : `Category “${c.label}” deleted`);
  };

  const deleteCategory = async c => {
    if (c.productCount > 0) return setMoving(c);
    const ok = await confirm({ title: `Delete “${c.label}”?`, message: 'It will be removed from the category list. This can’t be undone.', confirmLabel: 'Delete category', danger: true });
    if (!ok) return;
    try {
      await categoryApi.remove(c._id);
      await categoryDeleted(c, null);
    } catch (err) {
      toast(err.message, 'critical');
    }
  };

  const moveAndDelete = async moveTo => {
    const c = moving;
    await categoryApi.remove(c._id, moveTo);
    setMoving(null);
    await categoryDeleted(c, moveTo);
  };

  return (
    <>
      <PageHeader eyebrow="Menu" title="Products" subtitle={data ? `${all.length} items on the menu · ${all.filter(isCombo).length} combos · ${outCount} out of stock` : 'Your menu items'}>
        <button className="btn btn--ghost" onClick={() => setManaging(true)}><Tag size={18} />Categories</button>
        <button className="btn btn--outline" onClick={() => setEditing({ type: 'combo' })}><Layers size={18} />Add combo</button>
        <button className="btn btn--primary" onClick={() => setEditing({})}><Plus size={18} />Add product</button>
      </PageHeader>

      <div className="toolbar">
        <SearchInput value={query} onChange={setQuery} placeholder="Search products" />
        <select className="input input--auto" value={category} onChange={e => setCategory(e.target.value)} aria-label="Category">
          <option value="all">All categories</option>
          {(categories || []).map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <Segmented
          label="Stock"
          value={stock}
          onChange={setStock}
          options={[
            { value: 'all', label: 'All', count: inCategory.length },
            { value: 'combos', label: 'Combos', count: inCategory.filter(isCombo).length },
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
                {rows.map(p => {
                  const worth = isCombo(p) ? comboWorth(p.comboItems || [], all) : 0;
                  // The struck-out price and the saving always use the same number.
                  const was = p.mrp > p.price ? p.mrp : worth > p.price ? worth : null;
                  const missing = isCombo(p) && (p.comboItems || []).some(i => !byId.get(i.productId)?.isAvailable);
                  return (
                  <tr key={p._id} className={p.isAvailable ? undefined : 'is-muted'}>
                    <td>
                      <div className="cell-product">
                        <Thumb src={p.image} alt={p.name} />
                        <div>
                          {p.heading && <span className="tag tag--heading">{p.heading}</span>}
                          <div className="cell-title">
                            <VegMark veg={p.isVeg} />
                            {p.name}
                            {isCombo(p) && <span className="tag tag--brand"><Layers size={12} />Combo</span>}
                            {p.isBestseller && <span className="tag"><Star size={12} />Bestseller</span>}
                          </div>
                          <div className="cell-sub clamp">{isCombo(p) ? comboSummary(p.comboItems || []) : p.description}</div>
                        </div>
                      </div>
                    </td>
                    <td className="nowrap">{categoryLabel[p.category] || p.category}</td>
                    <td className="num">
                      <strong>{money(p.price)}</strong>
                      {p.halfPrice > 0 && <div className="cell-sub">Half {money(p.halfPrice)}</div>}
                      {was && <div className="cell-sub"><s>{money(was)}</s></div>}
                      {was && <div className="cell-sub saving">Save {money(was - p.price)}</div>}
                    </td>
                    <td className="num">{p.prepTimeMins} min</td>
                    <td>
                      <div className="switch-cell">
                        <Switch checked={p.isAvailable} onChange={v => toggleAvailable(p, v)} label={`${p.name} available`} />
                        {!p.isAvailable && <Badge tone="warning">Out of stock</Badge>}
                        {p.isAvailable && missing && <Badge tone="warning" title="One of its dishes is out of stock">Dish out of stock</Badge>}
                      </div>
                    </td>
                    <td className="actions-col">
                      <button className="icon-btn" onClick={() => setEditing(p)} aria-label={`Edit ${p.name}`} title="Edit"><Pencil size={18} /></button>
                      <button className="icon-btn icon-btn--danger" onClick={() => remove(p)} aria-label={`Delete ${p.name}`} title="Delete"><Trash size={18} /></button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?._id ? `Edit ${editing.name}` : isCombo(editing) ? 'Add combo' : 'Add product'} wide>
        {editing && categories && (
          <ProductForm product={editing} products={all} categories={categories} onCategoryAdded={reloadCategories} onDone={saved => { setEditing(null); if (saved) reload(); }} />
        )}
      </Modal>
      <Modal open={managing} onClose={() => setManaging(false)} title="Categories">
        {managing && categories && <CategoryManager categories={categories} onDelete={deleteCategory} />}
      </Modal>
      <Modal open={Boolean(moving)} onClose={() => setMoving(null)} title={moving ? `Delete “${moving.label}”` : ''}>
        {moving && categories && <MoveAndDelete category={moving} categories={categories} onConfirm={moveAndDelete} onCancel={() => setMoving(null)} />}
      </Modal>
      {confirmDialog}
    </>
  );
}
