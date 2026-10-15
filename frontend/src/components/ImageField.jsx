// Photo picker: upload a file (button or drag & drop) or paste an image link.
import { useRef, useState } from 'react';
import { uploads } from '../api/index.js';
import { Upload, ImageIcon } from './Icons.jsx';

export default function ImageField({ label = 'Photo', value, onChange, error, alt = '' }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [broken, setBroken] = useState(null); // the src that failed to load

  const uploaded = /\/uploads\//.test(value || '');
  const showPreview = value && broken !== value;

  const handleFile = async file => {
    if (!file) return;
    setBusy(true);
    setUploadError(null);
    try {
      const { url } = await uploads.image(file);
      onChange(url);
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const onDrop = e => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  const message = uploadError || error;

  return (
    <div className="field field--span">
      <span className="field__label">{label}</span>
      <div
        className={`image-field${dragging ? ' is-dragging' : ''}${message ? ' has-error' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
        onDrop={onDrop}
      >
        <div className="image-field__preview">
          {showPreview
            ? <img src={value} alt={alt} onError={() => setBroken(value)} />
            : <ImageIcon size={28} />}
          {busy && <span className="image-field__busy"><span className="spinner" /></span>}
        </div>
        <div className="image-field__body">
          <div className="image-field__actions">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => input.current.click()} disabled={busy}>
              <Upload size={16} />{busy ? 'Preparing photo…' : value ? 'Replace photo' : 'Upload photo'}
            </button>
            {value && !busy && (
              <button type="button" className="btn btn--ghost btn--sm btn--ghost-danger" onClick={() => { onChange(''); setUploadError(null); }}>
                Remove
              </button>
            )}
          </div>
          <p className="field__hint">
            {uploaded ? 'Uploaded from your device. ' : ''}JPG, PNG or WebP up to 10 MB. You can also drop a photo here.
          </p>
          <input
            className="input input--sm"
            type="url"
            value={uploaded ? '' : value}
            onChange={e => { onChange(e.target.value); setUploadError(null); }}
            placeholder={uploaded ? 'Paste a link to use instead' : '…or paste an image link (https://)'}
            aria-label="Image link"
          />
          {value && broken === value && !message && <span className="field__error">This image link doesn’t load. Check the link.</span>}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          hidden
          onChange={e => { handleFile(e.target.files?.[0]); e.target.value = ''; }}
        />
      </div>
      {message && <span className="field__error" role="alert">{message}</span>}
    </div>
  );
}
