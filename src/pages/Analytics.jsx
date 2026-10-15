import { useState } from 'react';
import { analytics } from '../api/index.js';
import { useApi, usePageTitle } from '../lib/useApi.js';
import { money, moneyCompact, num, pct, mins, dayLabel, longDayLabel as longDay, hourLabel } from '../lib/format.js';
import { PageHeader, Segmented, StatTile, Loading, ErrorState } from '../components/ui.jsx';
import { LineChart, ColumnChart, BarList, ChartCard, DataTable } from '../components/charts.jsx';
import { Star } from '../components/Icons.jsx';

const RANGES = [
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
];

export default function Analytics() {
  usePageTitle('Analytics');
  const [days, setDays] = useState(30);
  const { data, loading, refreshing, error, reload } = useApi(() => analytics.get(days), [days]);

  const filters = (
    <div className="toolbar">
      <Segmented label="Date range" value={days} onChange={setDays} options={RANGES} />
      <span className="toolbar__note">Compared with the {days} days before</span>
    </div>
  );

  const header = <PageHeader title="Analytics" subtitle="Sales, customers, coupons and delivery performance" />;
  if (loading) return <>{header}{filters}<Loading /></>;
  if (error && !data) return <>{header}{filters}<ErrorState error={error} onRetry={reload} /></>;

  const { current: c, previous: p } = data;
  const vs = `vs previous ${days} days`;
  const categoryTotal = data.byCategory.reduce((s, x) => s + x.revenue, 0) || 1;

  return (
    <>
      {header}
      {filters}

      <div className={`stack${refreshing ? ' is-refreshing' : ''}`}>
        <div className="stats stats--6">
          <StatTile label="Revenue" value={moneyCompact(c.revenue)} current={c.revenue} previous={p.revenue} compareLabel={vs} />
          <StatTile label="Orders" value={num(c.orders)} current={c.orders} previous={p.orders} compareLabel={vs} />
          <StatTile label="Average order value" value={money(c.aov)} current={c.aov} previous={p.aov} compareLabel={vs} />
          <StatTile label="New customers" value={num(c.newCustomers)} current={c.newCustomers} previous={p.newCustomers} compareLabel={vs} />
          <StatTile label="Average delivery time" value={mins(c.avgDeliveryMins)} current={c.avgDeliveryMins} previous={p.avgDeliveryMins} upIsGood={false} compareLabel={vs} />
          <StatTile label="Cancelled orders" value={pct(c.cancelRate, 1)} current={c.cancelRate} previous={p.cancelRate} upIsGood={false} compareLabel={vs} />
        </div>

        <ChartCard
          title="Revenue per day"
          subtitle={`${money(c.revenue)} from ${num(c.orders)} orders · ${money(c.discounts)} given as coupon discounts`}
          table={{
            columns: [
              { key: 'date', label: 'Day', format: longDay },
              { key: 'orders', label: 'Orders', align: 'right', format: num },
              { key: 'revenue', label: 'Revenue', align: 'right', format: money },
            ],
            rows: [...data.daily].reverse(),
          }}
        >
          <LineChart
            data={data.daily.map(d => ({ x: d.date, y: d.revenue }))}
            height={260}
            formatY={money}
            formatTick={moneyCompact}
            formatX={dayLabel}
            formatXLong={longDay}
            label={`Revenue per day for the last ${days} days`}
          />
        </ChartCard>

        <div className="grid grid--2">
          <ChartCard
            title="Orders by time of day"
            subtitle="When customers order, across the whole period"
            table={{
              columns: [
                { key: 'hour', label: 'Hour', format: h => `${hourLabel(h)} – ${hourLabel((h + 1) % 24)}` },
                { key: 'orders', label: 'Orders', align: 'right', format: num },
              ],
              rows: data.byHour,
            }}
          >
            <ColumnChart
              data={data.byHour.map(h => ({ x: h.hour, y: h.orders }))}
              formatY={v => `${num(v)} orders`}
              formatTick={num}
              formatX={hourLabel}
              formatXLong={h => `${hourLabel(h)} – ${hourLabel((h + 1) % 24)}`}
              label="Orders by hour of the day"
            />
          </ChartCard>

          <ChartCard
            title="Sales by category"
            subtitle="Food sales before delivery fees and discounts"
            table={{
              columns: [
                { key: 'label', label: 'Category' },
                { key: 'revenue', label: 'Sales', align: 'right', format: money },
                { key: 'share', label: 'Share', align: 'right', format: v => pct(v, 1) },
              ],
              rows: data.byCategory.map(x => ({ ...x, share: x.revenue / categoryTotal })),
            }}
          >
            <BarList data={data.byCategory.map(x => ({ label: x.label, value: x.revenue }))} format={moneyCompact} label="Sales by category" />
          </ChartCard>

          <ChartCard
            title="Best-selling dishes"
            subtitle="By number of plates sold"
            table={{
              columns: [
                { key: 'name', label: 'Dish' },
                { key: 'qty', label: 'Sold', align: 'right', format: num },
                { key: 'revenue', label: 'Sales', align: 'right', format: money },
              ],
              rows: data.topProducts,
            }}
          >
            <BarList data={data.topProducts.map(x => ({ label: x.name, value: x.qty }))} format={v => `${num(v)} sold`} label="Best-selling dishes" />
          </ChartCard>

          <ChartCard
            title="Payment methods"
            subtitle="Share of orders"
            table={{
              columns: [
                { key: 'method', label: 'Method' },
                { key: 'count', label: 'Orders', align: 'right', format: num },
                { key: 'share', label: 'Share', align: 'right', format: v => pct(v, 1) },
              ],
              rows: data.payments,
            }}
          >
            <BarList data={data.payments.map(x => ({ label: x.method, value: x.share }))} format={v => pct(v)} label="Payment methods" />
          </ChartCard>
        </div>

        <div className="grid grid--2">
          <section className="card">
            <header className="card__head">
              <div>
                <h2>Coupon performance</h2>
                <p>{num(c.couponOrders)} orders ({pct(c.orders ? c.couponOrders / c.orders : 0)}) used a coupon</p>
              </div>
            </header>
            {data.coupons.length ? (
              <DataTable
                columns={[
                  { key: 'code', label: 'Code', format: v => <code className="code">{v}</code> },
                  { key: 'uses', label: 'Orders', align: 'right', format: num },
                  { key: 'discount', label: 'Discount given', align: 'right', format: money },
                  { key: 'revenue', label: 'Order value', align: 'right', format: money },
                ]}
                rows={data.coupons}
              />
            ) : <p className="card__empty">No coupons were used in this period.</p>}
          </section>

          <section className="card">
            <header className="card__head">
              <div>
                <h2>Delivery performance</h2>
                <p>Average {mins(c.avgDeliveryMins)} · {pct(c.onTimeRate)} delivered within 35 minutes</p>
              </div>
            </header>
            <DataTable
              columns={[
                { key: 'name', label: 'Agent' },
                { key: 'deliveries', label: 'Deliveries', align: 'right', format: num },
                { key: 'avgMins', label: 'Avg time', align: 'right', format: mins },
                { key: 'onTimeRate', label: 'On time', align: 'right', format: v => pct(v) },
                { key: 'rating', label: 'Rating', align: 'right', format: v => (v ? <span className="rating"><Star size={14} />{v.toFixed(1)}</span> : '—') },
              ]}
              rows={data.agents}
            />
          </section>
        </div>
      </div>
    </>
  );
}
