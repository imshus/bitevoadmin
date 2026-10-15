import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Check, Alert, X } from './Icons.jsx';

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback(id => setToasts(list => list.filter(t => t.id !== id)), []);

  const toast = useCallback((message, tone = 'good') => {
    const id = nextId.current++;
    setToasts(list => [...list.slice(-3), { id, message, tone }]);
    setTimeout(() => dismiss(id), 3500);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast--${t.tone}`}>
            <span className="toast__icon">{t.tone === 'critical' ? <Alert size={18} /> : <Check size={18} />}</span>
            <span>{t.message}</span>
            <button className="icon-btn icon-btn--sm" onClick={() => dismiss(t.id)} aria-label="Dismiss"><X size={16} /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// toast('Saved') or toast('Something failed', 'critical')
export const useToast = () => useContext(ToastContext);
