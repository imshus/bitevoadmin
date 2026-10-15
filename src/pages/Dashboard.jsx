import { Link } from 'react-router-dom';
import { dashboard } from '../api/index.js';
import { useApi, usePageTitle } from '../lib/useApi.js';
import { money, moneyCompact, num, dayLabel, longDayLabel, timeAgo } from '../lib/format.js';
import { ORDER_STATUS } from '../lib/status.js';
import { useAuth } from '../auth.jsx';
import { PageHeader, Badge, StatTile, Loading, ErrorState } from '../components/ui.jsx';
import { LineChart, ChartCard } from '../components/charts.jsx';
import { Box, Bike, Ticket, Shield, ArrowRight, Check } from '../components/Icons.jsx';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function Attention({ attention }) {
  const items = [
    attention.outOfStock.length > 0 && { to: '/products', icon: <Box />, title: `${plural(attention.outOfStock.length, 'product')} out of stock`, sub: attention.outOfStock.join(', ') },
    attention.pendingKyc.length > 0 && { to: '/agents', icon: <Bike />, title: `${plural(attention.pendingKyc.length, 'agent')} waiting for ID check`, sub: attention.pendingKyc.join(', ') },
    attention.expiringCoupons.length > 0 && { to: '/coupons', icon: <Ticket />, title: `${plural(attention.expiringCoupons.length, 'coupon')} ending within 7 days`, sub: attention.expiringCoupons.join(', ') },
    attention.failedLogins > 0 && { to: '/logins', icon: <Shield />, title: `${plural(attention.failedLogins, 'failed sign-in')} in the last 24 h`, sub: 'Check for unusual activity' },
  ].filter(Boolean);

  return (
    <section className="card">
      <header className="card__head"><div><h2>Needs attention</h2></div></header>
      {items.length === 0 ? (
        <div className="all-clear"><Check />Nothing needs your attention right now.</div>
      ) : (
        <ul className="attention">
          {items.map(item => (
            <li key={item.to}>
              <Link to={item.to}>
                <span className="attention__icon">{item.icon}</span>
                <span className="attention__text">
                  <strong>{item.title}</strong>
                  <span>{item.sub}</span>
                </span>
                <ArrowRight size={18} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function Dashboard() {
  usePageTitle('Dashboard');
  const { user } = useAuth();
  const { data, loading, error, reload } = useApi(() => dashboard.summary());

  const header = (
    <PageHeader title={`${greeting()}, ${user.name.split(' ')[0]}`} subtitle="Here’s how BiteVo is doing today.">
      <Link className="btn btn--ghost" to="/analytics">Full analytics<ArrowRight size={18} /></Link>
    </PageHeader>
  );
  if (loading) return <>{header}<Loading /></>;
  if (error && !data) return <>{header}<ErrorState error={error} onRetry={reload} /></>;

  const { today, yesterday, week, agents } = data;

  return (
    <>
      {header}

      <div className="stats">
        <StatTile label="Revenue today" value={money(today.revenue)} current={today.revenue} previous={yesterday.revenue} compareLabel="vs this time yesterday" />
        <StatTile label="Orders today" value={num(today.orders)} current={today.orders} previous={yesterday.orders} compareLabel="vs this time yesterday" />
        <StatTile label="Live orders" value={num(data.liveOrders)} hint="Being prepared or on the way" />
        <StatTile label="Agents available" value={`${agents.online + agents.busy} of ${agents.total}`} hint={`${agents.online} free · ${agents.busy} on delivery`} />
      </div>

      <div className="grid grid--2-1">
        <ChartCard
          title="Revenue, last 7 days"
          subtitle={`${money(week.reduce((s, d) => s + d.revenue, 0))} from ${num(week.reduce((s, d) => s + d.orders, 0))} orders`}
          table={{
            columns: [
              { key: 'date', label: 'Day', format: longDayLabel },
              { key: 'orders', label: 'Orders', align: 'right', format: num },
              { key: 'revenue', label: 'Revenue', align: 'right', format: money },
            ],
            rows: week,
          }}
        >
          <LineChart
            data={week.map(d => ({ x: d.date, y: d.revenue }))}
            formatY={money}
            formatTick={moneyCompact}
            formatX={dayLabel}
            formatXLong={longDayLabel}
            label="Revenue per day for the last 7 days"
          />
        </ChartCard>
        <Attention attention={data.attention} />
      </div>

      <section className="card">
        <header className="card__head">
          <div>
            <h2>Latest orders</h2>
            <p>The most recent orders placed in the app</p>
          </div>
        </header>
        <div className="table-wrap">
          <table className="table table--compact">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Items</th>
                <th className="num">Total</th>
                <th>Status</th>
                <th>Placed</th>
              </tr>
            </thead>
            <tbody>
              {data.recentOrders.map(o => (
                <tr key={o._id}>
                  <td className="mono nowrap">{o.orderNo}</td>
                  <td className="nowrap">{o.customerName}</td>
                  <td>{o.items[0].name}{o.items.length > 1 && <span className="muted"> + {o.items.length - 1} more</span>}</td>
                  <td className="num">{money(o.total)}</td>
                  <td className="nowrap"><Badge tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Badge></td>
                  <td className="nowrap">{timeAgo(o.placedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
