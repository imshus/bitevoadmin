// Small building blocks shared by every page.
import { useEffect, useId, useRef, useState, useCallback } from 'react';
import { X, Search, ArrowUp, ArrowDown, Alert, Refresh } from './Icons.jsx';
import { initials, num } from '../lib/format.js';

// `eyebrow` is the small uppercase pill above the title, as on the website.
export function PageHeader({ eyebrow, title, subtitle, children }) {
  return (
    <div className="page-head">
      <div className="page-head__text">
        {eyebrow && <span className="pill">{eyebrow}</span>}
        <h1>{title}</h1>
        {subtitle && <p className="page-head__sub">{subtitle}</p>}
      </div>
      {children && <div className="page-head__actions">{children}</div>}
    </div>
  );
}

// Status pill: coloured dot + text label, so the colour never carries meaning alone.
export function Badge({ tone = 'neutral', children, title }) {
  return <span className={`badge badge--${tone}`} title={title}><span className="badge__dot" aria-hidden="true" />{children}</span>;
}

export function Switch({ checked, onChange, label, disabled, hideLabel = true }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={hideLabel ? label : undefined}
      className="switch"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="switch__track"><span className="switch__thumb" /></span>
      {!hideLabel && <span className="switch__label">{label}</span>}
    </button>
  );
}

export function Field({ label, error, hint, children, span }) {
  return (
    <label className={`field${span ? ' field--span' : ''}${error ? ' has-error' : ''}`}>
      <span className="field__label">{label}</span>
      {children}
      {error ? <span className="field__error">{error}</span> : hint && <span className="field__hint">{hint}</span>}
    </label>
  );
}

export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'is-on' : undefined}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.count != null && <span className="segmented__count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search' }) {
  return (
    <div className="search">
      <Search size={18} />
      <input type="search" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }) {
  const ref = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) {
      dialog.showModal();
      // React's autoFocus fires before the dialog is shown, so focus the marked field here.
      dialog.querySelector('[data-autofocus]')?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`modal${wide ? ' modal--wide' : ''}`}
      aria-labelledby={titleId}
      onCancel={e => { e.preventDefault(); onClose(); }}
      onMouseDown={e => { if (e.target === ref.current) onClose(); }}
    >
      {open && (
        <div className="modal__inner">
          <div className="modal__head">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X /></button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

// const [confirm, confirmDialog] = useConfirm();
// if (await confirm({ title, message, confirmLabel, danger })) { ... }  — render {confirmDialog} once.
export function useConfirm() {
  const [request, setRequest] = useState(null);

  const confirm = useCallback(options => new Promise(resolve => setRequest({ ...options, resolve })), []);
  const close = answer => {
    request?.resolve(answer);
    setRequest(null);
  };

  const dialog = (
    <Modal open={Boolean(request)} onClose={() => close(false)} title={request?.title || ''}>
      <div className="modal__body"><p className="confirm-text">{request?.message}</p></div>
      <div className="modal__foot">
        <button type="button" className="btn btn--ghost" onClick={() => close(false)}>Cancel</button>
        <button type="button" className={`btn ${request?.danger ? 'btn--danger' : 'btn--primary'}`} onClick={() => close(true)} data-autofocus>
          {request?.confirmLabel || 'Confirm'}
        </button>
      </div>
    </Modal>
  );

  return [confirm, dialog];
}

export function Loading({ label = 'Loading…' }) {
  return <div className="state"><span className="spinner" aria-hidden="true" />{label}</div>;
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="state state--error" role="alert">
      <Alert />
      <span>{error?.message || 'Something went wrong.'}</span>
      {onRetry && <button className="btn btn--ghost btn--sm" onClick={onRetry}><Refresh size={16} />Try again</button>}
    </div>
  );
}

export function EmptyState({ icon, title, text, action }) {
  return (
    <div className="empty">
      {icon && <div className="empty__icon">{icon}</div>}
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

// Stat tile: label · value · optional delta vs a named previous period.
// `upIsGood` decides whether a rise is shown as good or bad news.
export function StatTile({ label, value, hint, current, previous, upIsGood = true, compareLabel, icon }) {
  let delta = null;
  if (previous != null && current != null && previous !== 0) {
    const change = (current - previous) / Math.abs(previous);
    const flat = Math.abs(change) < 0.005;
    const good = flat ? null : (change > 0) === upIsGood;
    delta = (
      <span className={`delta ${flat ? 'delta--flat' : good ? 'delta--good' : 'delta--bad'}`}>
        <span className="delta__change">
          {!flat && (change > 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
          {flat ? 'No change' : `${Math.abs(change * 100).toFixed(Math.abs(change) < 0.1 ? 1 : 0)}%`}
        </span>
        {compareLabel && <span className="delta__vs">{compareLabel}</span>}
      </span>
    );
  }
  return (
    <div className="stat">
      {icon && <span className="stat__icon" aria-hidden="true">{icon}</span>}
      <div className="stat__label">{label}</div>
      <div className="stat__value">{value}</div>
      {delta || (hint && <div className="stat__hint">{hint}</div>)}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onChange }) {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;
  return (
    <div className="pagination">
      <span>{num((page - 1) * pageSize + 1)}–{num(Math.min(page * pageSize, total))} of {num(total)}</span>
      <div>
        <button type="button" className="btn btn--ghost btn--sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</button>
        <button type="button" className="btn btn--ghost btn--sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next</button>
      </div>
    </div>
  );
}

// BiteVo wordmark (light theme) or mark + name (dark theme, where the black lettering would vanish).
export function Logo({ className = '' }) {
  return (
    <span className={`logo ${className}`}>
      <picture>
        <source srcSet="/assets/logo-480.webp" type="image/webp" />
        <img className="logo__full" src="/assets/logo-480.png" alt="BiteVo — Good Food, Better Mood" width="480" height="175" />
      </picture>
      <span className="logo__mark">
        <img src="/assets/mark.png" alt="" width="38" height="38" />
        <strong>BiteVo</strong>
      </span>
    </span>
  );
}

export function Avatar({ name, size = 36 }) {
  return <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden="true">{initials(name)}</span>;
}

// The Indian veg / non-veg food mark.
export function VegMark({ veg }) {
  return (
    <span className={`veg-mark ${veg ? 'veg-mark--veg' : 'veg-mark--non'}`} title={veg ? 'Veg' : 'Non-veg'}>
      <span className="sr-only">{veg ? 'Veg' : 'Non-veg'}</span>
    </span>
  );
}

export function Meter({ value, max, label }) {
  const ratio = max ? Math.min(value / max, 1) : 0;
  const tone = ratio >= 0.9 ? 'critical' : ratio >= 0.7 ? 'warning' : 'normal';
  return (
    <div className={`meter meter--${tone}`} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
      <span style={{ width: `${ratio * 100}%` }} />
    </div>
  );
}
