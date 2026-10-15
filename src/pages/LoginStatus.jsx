import { useEffect, useState } from 'react';
import { sessions as sessionApi, loginEvents as eventApi } from '../api/index.js';
import { useApi, usePageTitle } from '../lib/useApi.js';
import { timeAgo, dateTime } from '../lib/format.js';
import { sessionStatus, ROLE_LABEL } from '../lib/status.js';
import { useAuth } from '../auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Badge, Segmented, SearchInput, useConfirm, Loading, ErrorState, EmptyState, StatTile } from '../components/ui.jsx';
import { LogIn, LogOut, Refresh, Smartphone, Monitor, Shield } from '../components/Icons.jsx';

const DAY = 86400000;
const AUTO_REFRESH_MS = 30000;

const ROLE_FILTERS = [
  { value: 'all', label: 'Everyone' },
  { value: 'admin', label: 'Admins' },
  { value: 'agent', label: 'Agents' },
  { value: 'customer', label: 'Customers' },
];

const DeviceIcon = ({ platform }) => (platform === 'web' ? <Monitor size={16} /> : <Smartphone size={16} />);

const matches = (query, ...fields) => !query || fields.join(' ').toLowerCase().includes(query.trim().toLowerCase());

export default function LoginStatus() {
  usePageTitle('Login status');
  const toast = useToast();
  const { user, refresh: refreshAuth } = useAuth();
  const [confirm, confirmDialog] = useConfirm();
  const [tab, setTab] = useState('sessions');
  const [role, setRole] = useState('all');
  const [query, setQuery] = useState('');
  const [result, setResult] = useState('all');
  const [now, setNow] = useState(Date.now());

  const load = () => Promise.all([sessionApi.list(), eventApi.list()]).then(([sessions, events]) => {
    setNow(Date.now());
    return { sessions, events };
  });
  const { data, loading, refreshing, error, reload } = useApi(load);

  useEffect(() => {
    const timer = setInterval(reload, AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [reload]);

  const sessions = (data?.sessions || []).map(s => ({ ...s, state: sessionStatus(s, now) }));
  const events = data?.events || [];
  const signedIn = sessions.filter(s => s.state.key !== 'signed_out');
  const recentFailed = events.filter(e => !e.success && now - Date.parse(e.at) < DAY);

  const sessionRows = sessions
    .filter(s => role === 'all' || s.role === role)
    .filter(s => matches(query, s.userName, s.identifier, s.device, s.ip));
  const eventRows = events
    .filter(e => role === 'all' || e.role === role)
    .filter(e => result === 'all' || (result === 'failed' ? !e.success : e.success))
    .filter(e => matches(query, e.userName, e.identifier, e.device, e.ip));

  const signOut = async s => {
    const own = s._id === user.sessionId;
    const ok = await confirm({
      title: own ? 'Sign yourself out?' : `Sign out ${s.userName}?`,
      message: own
        ? 'This is the session you are using right now. You will need to sign in again.'
        : `They will be signed out of ${s.device} and will need to sign in again${s.role === 'agent' ? ' before taking more orders' : ''}.`,
      confirmLabel: 'Sign out',
      danger: true,
    });
    if (!ok) return;
    try {
      await sessionApi.revoke(s._id);
      if (own) return refreshAuth();
      await reload();
      toast(`${s.userName} signed out`);
    } catch (err) {
      toast(err.message, 'critical');
    }
  };

  return (
    <>
      <PageHeader title="Login status" subtitle="Who is signed in to BiteVo right now, across the admin panel, delivery app and customer app">
        <button className="btn btn--ghost" onClick={reload} disabled={refreshing}><Refresh size={18} />{refreshing ? 'Refreshing…' : 'Refresh'}</button>
      </PageHeader>

      <div className="stats">
        <StatTile label="Active now" value={signedIn.filter(s => s.state.key === 'active').length} hint="Used in the last 5 minutes" />
        <StatTile label="Agents signed in" value={signedIn.filter(s => s.role === 'agent').length} hint={`${signedIn.filter(s => s.role === 'agent' && s.state.key === 'active').length} active now`} />
        <StatTile label="Customers signed in" value={signedIn.filter(s => s.role === 'customer').length} hint={`${signedIn.filter(s => s.role === 'customer' && s.state.key === 'active').length} active now`} />
        <StatTile label="Failed sign-ins" value={recentFailed.length} hint="In the last 24 hours" />
      </div>

      <div className="tabs" role="tablist" aria-label="Login status views">
        <button role="tab" aria-selected={tab === 'sessions'} className={tab === 'sessions' ? 'is-on' : undefined} onClick={() => setTab('sessions')}>
          Sessions <span className="tabs__count">{signedIn.length}</span>
        </button>
        <button role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? 'is-on' : undefined} onClick={() => setTab('history')}>
          Sign-in history
        </button>
      </div>

      <div className="toolbar">
        <SearchInput value={query} onChange={setQuery} placeholder="Search name, phone, email or IP" />
        <Segmented label="Role" value={role} onChange={setRole} options={ROLE_FILTERS} />
        {tab === 'history' && (
          <Segmented label="Result" value={result} onChange={setResult}
            options={[{ value: 'all', label: 'All' }, { value: 'success', label: 'Successful' }, { value: 'failed', label: 'Failed', count: events.filter(e => !e.success).length }]} />
        )}
      </div>

      <section className={`card${refreshing ? ' is-refreshing' : ''}`} role="tabpanel">
        {loading ? <Loading /> : error && !data ? <ErrorState error={error} onRetry={reload} /> : tab === 'sessions' ? (
          sessionRows.length === 0 ? <EmptyState icon={<LogIn />} title="No sessions match" text="Try a different search or role." /> : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Device</th>
                    <th>Signed in</th>
                    <th>Last active</th>
                    <th>Status</th>
                    <th className="actions-col"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {sessionRows.map(s => (
                    <tr key={s._id} className={s.state.key === 'signed_out' ? 'is-muted' : undefined}>
                      <td>
                        <div className="cell-title">
                          {s.userName}
                          {s._id === user.sessionId && <span className="tag tag--brand">You</span>}
                        </div>
                        <div className="cell-sub nowrap">{s.identifier}</div>
                      </td>
                      <td className="nowrap">{ROLE_LABEL[s.role]}</td>
                      <td>
                        <div className="cell-device"><DeviceIcon platform={s.platform} />{s.device}</div>
                        <div className="cell-sub mono">{s.ip || 'This browser'}</div>
                      </td>
                      <td className="nowrap" title={dateTime(s.loginAt)}>{timeAgo(s.loginAt, now)}</td>
                      <td className="nowrap" title={dateTime(s.lastActiveAt)}>{timeAgo(s.lastActiveAt, now)}</td>
                      <td className="nowrap">
                        <Badge tone={s.state.tone}>{s.state.label}</Badge>
                        {s.revokedAt && <div className="cell-sub">{timeAgo(s.revokedAt, now)}</div>}
                      </td>
                      <td className="actions-col">
                        {!s.revokedAt && (
                          <button className="btn btn--sm btn--ghost btn--ghost-danger" onClick={() => signOut(s)} aria-label={`Sign out ${s.userName} on ${s.device}`}><LogOut size={15} />Sign out</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : eventRows.length === 0 ? <EmptyState icon={<Shield />} title="No sign-ins match" text="Try a different search or filter." /> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>User</th>
                  <th>Role</th>
                  <th>Result</th>
                  <th>Device</th>
                  <th>IP address</th>
                </tr>
              </thead>
              <tbody>
                {eventRows.map(e => (
                  <tr key={e._id}>
                    <td className="nowrap">
                      <div>{dateTime(e.at)}</div>
                      <div className="cell-sub">{timeAgo(e.at, now)}</div>
                    </td>
                    <td>
                      <div className="cell-title">{e.userName}</div>
                      <div className="cell-sub nowrap">{e.identifier}</div>
                    </td>
                    <td className="nowrap">{ROLE_LABEL[e.role]}</td>
                    <td className="nowrap">
                      {e.success ? <Badge tone="good">Signed in</Badge> : <Badge tone="critical">Failed</Badge>}
                      {e.reason && <div className="cell-sub">{e.reason}</div>}
                    </td>
                    <td><div className="cell-device"><DeviceIcon platform={e.platform} />{e.device}</div></td>
                    <td className="mono nowrap">{e.ip || 'This browser'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="footnote">Refreshes every 30 seconds. “Active now” means used in the last 5 minutes; “Idle” means within the last hour.</p>
      {confirmDialog}
    </>
  );
}
