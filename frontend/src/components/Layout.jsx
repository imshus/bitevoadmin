import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { resetDemoData } from '../api/index.js';
import { useConfirm, Avatar, Logo } from './ui.jsx';
import { Dashboard, Box, Ticket, Bike, LogIn, LogOut, Chart, Menu, X, Sun, Moon, Refresh, ChevronDown, Bag, Wallet } from './Icons.jsx';

const NAV = [
  { to: '/', label: 'Dashboard', icon: Dashboard, end: true },
  { to: '/orders', label: 'Orders', icon: Bag },
  { to: '/products', label: 'Products', icon: Box },
  { to: '/coupons', label: 'Coupons', icon: Ticket },
  { to: '/wallet', label: 'Wallet', icon: Wallet },
  { to: '/agents', label: 'Delivery agents', icon: Bike },
  { to: '/logins', label: 'Login status', icon: LogIn },
  { to: '/analytics', label: 'Analytics', icon: Chart },
];

// Bottom tab bar on phones: the pages used most on the go, plus "More" for the full menu.
const TABS = [
  { to: '/', label: 'Home', icon: Dashboard, end: true },
  { to: '/orders', label: 'Orders', icon: Bag },
  { to: '/products', label: 'Menu', icon: Box },
  { to: '/wallet', label: 'Wallet', icon: Wallet },
];

const THEME_KEY = 'bitevo-admin-theme';

// On phones each table row is shown as a card; label every cell with its column name for that.
function useCardLabels(ref) {
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    let frame = 0;
    const label = () => {
      frame = 0;
      for (const table of root.querySelectorAll('table.table')) {
        const names = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim());
        for (const row of table.querySelectorAll('tbody tr')) {
          [...row.children].forEach((cell, i) => {
            if (cell.getAttribute('data-label') !== names[i]) cell.setAttribute('data-label', names[i] || '');
          });
        }
      }
    };
    label();
    const observer = new MutationObserver(() => { if (!frame) frame = requestAnimationFrame(label); });
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [ref]);
}

// Light (like the website) unless the admin picked dark.
function useTheme() {
  const [theme, setTheme] = useState(() => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'));
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    if (next === 'dark') document.documentElement.dataset.theme = 'dark';
    else delete document.documentElement.dataset.theme;
    try { localStorage.setItem(THEME_KEY, next); } catch { /* storage blocked */ }
    setTheme(next);
  };
  return [theme, toggle];
}

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [confirm, confirmDialog] = useConfirm();
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const reset = async () => {
    setOpen(false);
    const ok = await confirm({
      title: 'Reset demo data?',
      message: 'All products, coupons, agents and sessions go back to the original dummy data, and you will be signed out.',
      confirmLabel: 'Reset data',
      danger: true,
    });
    if (ok) {
      try {
        await resetDemoData();
        window.location.assign('/login');
      } catch (err) {
        window.alert(err.message);
      }
    }
  };

  return (
    <div className="user-menu" ref={ref}>
      <button className="user-menu__btn" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="menu" aria-label={`Account menu for ${user.name}`}>
        <Avatar name={user.name} size={34} />
        <span className="user-menu__who">
          <strong>{user.name}</strong>
          <span>{user.role}</span>
        </span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="user-menu__pop" role="menu">
          <div className="user-menu__email">{user.email}</div>
          {user.demoMode && <button role="menuitem" onClick={reset}><Refresh size={18} />Reset demo data</button>}
          <button role="menuitem" onClick={logout}><LogOut size={18} />Sign out</button>
        </div>
      )}
      {confirmDialog}
    </div>
  );
}

export default function Layout() {
  const [navOpen, setNavOpen] = useState(false);
  const [theme, toggleTheme] = useTheme();
  const { user } = useAuth();
  const { pathname } = useLocation();
  const contentRef = useRef(null);
  useCardLabels(contentRef);

  useEffect(() => setNavOpen(false), [pathname]);

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className={`app${navOpen ? ' nav-open' : ''}`}>
      <aside className="sidebar" id="sidebar">
        <div className="sidebar__brand">
          <Logo />
          <button className="icon-btn sidebar__close" onClick={() => setNavOpen(false)} aria-label="Close menu"><X /></button>
        </div>
        <span className="pill sidebar__tag">Admin panel</span>
        <nav className="sidebar__nav" aria-label="Main">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}>
              <Icon />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        {user.demoMode && (
          <div className="sidebar__foot">
            <span className="pill">Demo mode</span>
            <p>Showing demo data, and new demo orders keep arriving. Turn off with DEMO_MODE=false on the server.</p>
          </div>
        )}
      </aside>
      <div className="scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />

      <div className="main">
        <header className="topbar">
          <button className="icon-btn topbar__menu" onClick={() => setNavOpen(true)} aria-label="Open menu" aria-controls="sidebar" aria-expanded={navOpen}>
            <Menu />
          </button>
          <Logo className="topbar__logo" />
          <span className="topbar__date">{today}</span>
          <div className="topbar__right">
            <button className="icon-btn" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} title={theme === 'dark' ? 'Light theme' : 'Dark theme'}>
              {theme === 'dark' ? <Sun /> : <Moon />}
            </button>
            <UserMenu />
          </div>
        </header>
        <main className="content" ref={contentRef}>
          <Outlet />
        </main>
      </div>

      <nav className="tabbar" aria-label="Quick navigation">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `tabbar__item${isActive ? ' is-active' : ''}`}>
            <span className="tabbar__icon"><Icon size={20} /></span>
            <span>{label}</span>
          </NavLink>
        ))}
        <button type="button" className={`tabbar__item${navOpen ? ' is-active' : ''}`} onClick={() => setNavOpen(true)} aria-controls="sidebar" aria-expanded={navOpen}>
          <span className="tabbar__icon"><Menu size={20} /></span>
          <span>More</span>
        </button>
      </nav>
    </div>
  );
}
