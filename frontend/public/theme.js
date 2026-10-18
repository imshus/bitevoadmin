// Light like the website by default; apply a saved dark choice before first paint.
// A separate file (not inline in index.html) so the server's Content-Security-Policy can stay strict.
try { if (localStorage.getItem('bitevo-admin-theme') === 'dark') document.documentElement.dataset.theme = 'dark'; } catch (e) {}
