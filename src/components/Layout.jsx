import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { resetDemoData } from '../api/index.js';
import { useConfirm, Avatar } from './ui.jsx';
import { Dashboard, Box, Ticket, Bike, LogIn, LogOut, Chart, Menu, X, Sun, Moon, Refresh, ChevronDown } from './Icons.jsx';

const NAV = [
  { to: '/', label: 'Dashboard', icon: Dashboard, end: true },
  { to: '/products', label: 'Products', icon: Box },
  { to: '/coupons', label: 'Coupons', icon: Ticket },
  { to: '/agents', label: 'Delivery agents', icon: Bike },
  { to: '/logins', label: 'Login status', icon: LogIn },
  { to: '/analytics', label: 'Analytics', icon: Chart },
];

const THEME_KEY = 'bitevo-admin-theme';

function useTheme() {
  const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || (systemDark() ? 'dark' : 'light'));
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
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
      resetDemoData();
      window.location.assign('/login');
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
          <button role="menuitem" onClick={reset}><Refresh size={18} />Reset demo data</button>
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
  const { pathname } = useLocation();

  useEffect(() => setNavOpen(false), [pathname]);

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className={`app${navOpen ? ' nav-open' : ''}`}>
      <aside className="sidebar" id="sidebar">
        <div className="sidebar__brand">
          <img src="/assets/mark.png" alt="" width="36" height="36" />
          <div>
            <strong>BiteVo</strong>
            <span>Admin panel</span>
          </div>
          <button className="icon-btn sidebar__close" onClick={() => setNavOpen(false)} aria-label="Close menu"><X /></button>
        </div>
        <nav className="sidebar__nav" aria-label="Main">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}>
              <Icon />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar__foot">
          <span className="demo-pill">Demo data</span>
          <p>Showing dummy data until the panel is connected to the BiteVo database.</p>
        </div>
      </aside>
      <div className="scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />

      <div className="main">
        <header className="topbar">
          <button className="icon-btn topbar__menu" onClick={() => setNavOpen(true)} aria-label="Open menu" aria-controls="sidebar" aria-expanded={navOpen}>
            <Menu />
          </button>
          <span className="topbar__date">{today}</span>
          <div className="topbar__right">
            <button className="icon-btn" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} title={theme === 'dark' ? 'Light theme' : 'Dark theme'}>
              {theme === 'dark' ? <Sun /> : <Moon />}
            </button>
            <UserMenu />
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
