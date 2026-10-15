import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { usePageTitle } from '../lib/useApi.js';
import { Logo } from '../components/ui.jsx';
import { Eye, EyeOff, Alert, Check } from '../components/Icons.jsx';

export default function Login() {
  usePageTitle('Sign in');
  const { user, loading, login, notice } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (loading) return null;
  if (user) return <Navigate to={location.state?.from || '/'} replace />;

  const submit = async e => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login__hero">
        <Logo />
        <span className="pill">Admin panel</span>
        <h1>Good food,<br /><em>better mood.</em></h1>
        <p>Run the BiteVo kitchen from one place: orders, menu, offers, wallets and your delivery team.</p>
        <ul className="checks">
          <li><Check />Live orders</li>
          <li><Check />Menu &amp; coupons</li>
          <li><Check />Sales insights</li>
        </ul>
      </div>

      <form className="login__card" onSubmit={submit} noValidate>
        <h2>Welcome <em>back</em></h2>
        <p>Sign in to the BiteVo admin panel.</p>

        {(error || notice) && (
          <div className={`notice ${error ? 'notice--error' : 'notice--info'}`} role="alert">
            <Alert size={18} />
            <span>{error || notice}</span>
          </div>
        )}

        <label className="field">
          <span className="field__label">Email</span>
          <input className="input" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
        </label>
        <label className="field">
          <span className="field__label">Password</span>
          <span className="input-group">
            <input className="input" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
            <button type="button" className="icon-btn" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </span>
        </label>

        <button className="btn btn--primary btn--block" disabled={busy || !email || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
