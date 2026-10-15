import { useCallback, useEffect, useRef, useState } from 'react';

// Loads data from an API function and reloads it when `deps` change.
// While reloading, the previous data stays on screen (`refreshing` is true).
export function useApi(load, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const latest = useRef(0);

  const reload = useCallback(() => {
    const call = ++latest.current;
    setState(s => ({ ...s, loading: true }));
    return load().then(
      data => { if (call === latest.current) setState({ data, error: null, loading: false }); },
      error => { if (call === latest.current) setState(s => ({ ...s, error, loading: false })); },
    );
  }, deps);

  useEffect(() => { reload(); }, [reload]);

  return {
    data: state.data,
    error: state.error,
    loading: state.loading && state.data === null,
    refreshing: state.loading && state.data !== null,
    reload,
  };
}

// Inline edits (toggles) that show the new value immediately while the request runs.
// const [view, patch] = usePatch(reload);  rows.map(view);  patch(id, { isActive: false }, api.coupons.update)
export function usePatch(reload) {
  const [pending, setPending] = useState({});
  const view = doc => (pending[doc._id] ? { ...doc, ...pending[doc._id] } : doc);
  const patch = async (id, changes, update) => {
    setPending(p => ({ ...p, [id]: { ...p[id], ...changes } }));
    try {
      await update(id, changes);
      await reload();
    } finally {
      setPending(p => {
        const next = { ...p };
        delete next[id];
        return next;
      });
    }
  };
  return [view, patch];
}

// Sets the browser tab title.
export function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · BiteVo Admin` : 'BiteVo Admin';
  }, [title]);
}
