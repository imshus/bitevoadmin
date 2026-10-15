// Lightweight SVG charts. One series per chart, drawn in the --series-1 colour.
// Each chart has a hover/keyboard tooltip, and ChartCard offers a table view of the same data.
import { useEffect, useRef, useState } from 'react';
import { Table, Chart as ChartIcon } from './Icons.jsx';

function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

function niceStep(raw) {
  const exp = Math.floor(Math.log10(raw));
  const f = raw / 10 ** exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * 10 ** exp;
}

function yTicks(max, count = 4) {
  if (!(max > 0)) return [0, 1];
  const step = niceStep(max / count);
  const ticks = [];
  for (let v = 0; v <= Math.ceil(max / step) * step + step / 1e6; v += step) ticks.push(v);
  return ticks;
}

// Arrow keys move the highlighted point when the chart has keyboard focus.
function keyNav(e, index, length, setIndex) {
  if (!length) return;
  const keys = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };
  if (e.key in keys) {
    e.preventDefault();
    setIndex(Math.min(length - 1, Math.max(0, (index ?? length - 1) + keys[e.key])));
  } else if (e.key === 'Home') setIndex(0);
  else if (e.key === 'End') setIndex(length - 1);
}

function Tooltip({ x, y, width, value, label }) {
  const left = Math.min(Math.max(x, 70), width - 70);
  return (
    <div className="chart-tip" style={{ left, top: y }}>
      <strong>{value}</strong>
      <span><i className="chart-tip__key" aria-hidden="true" />{label}</span>
    </div>
  );
}

const M = { top: 12, right: 12, bottom: 28 };

// Trend over time: 2px line with a light area wash and a snapping crosshair.
export function LineChart({ data, height = 240, formatY, formatTick = formatY, formatX, formatXLong = formatX, label }) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState(null);
  const n = data.length;
  const ticks = yTicks(Math.max(...data.map(d => d.y), 0));
  const top = ticks[ticks.length - 1];
  const left = Math.max(...ticks.map(t => formatTick(t).length)) * 7 + 14;
  const plotW = Math.max(width - left - M.right, 10);
  const plotH = height - M.top - M.bottom;
  const x = i => left + (n === 1 ? plotW / 2 : (i * plotW) / (n - 1));
  const y = v => M.top + plotH - (v / top) * plotH;
  const base = M.top + plotH;

  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.y).toFixed(1)}`).join('');
  const area = n ? `${line}L${x(n - 1).toFixed(1)},${base}L${x(0).toFixed(1)},${base}Z` : '';

  const maxLabels = Math.max(2, Math.floor(plotW / 64));
  const every = Math.ceil(n / maxLabels);
  const labelIdx = data.map((_, i) => i).filter(i => (n - 1 - i) % every === 0);

  const onMove = e => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - box.left;
    const i = n === 1 ? 0 : Math.round(((px - left) / plotW) * (n - 1));
    setActive(Math.min(n - 1, Math.max(0, i)));
  };

  const a = active != null ? data[active] : null;

  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={label}
          tabIndex={0}
          onPointerMove={onMove}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive(n - 1)}
          onBlur={() => setActive(null)}
          onKeyDown={e => keyNav(e, active, n, setActive)}
        >
          {ticks.map(t => (
            <g key={t}>
              <line x1={left} x2={left + plotW} y1={y(t)} y2={y(t)} className={t === 0 ? 'chart-axis' : 'chart-grid'} />
              <text x={left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="chart-tick">{formatTick(t)}</text>
            </g>
          ))}
          {labelIdx.map(i => (
            <text key={i} x={x(i)} y={height - 8} textAnchor={i === 0 && n > 1 ? 'start' : i === n - 1 && n > 1 ? 'end' : 'middle'} className="chart-tick">
              {formatX(data[i].x)}
            </text>
          ))}
          <path d={area} className="chart-area" />
          <path d={line} className="chart-line" />
          {a && (
            <g>
              <line x1={x(active)} x2={x(active)} y1={M.top} y2={base} className="chart-crosshair" />
              <circle cx={x(active)} cy={y(a.y)} r="4.5" className="chart-dot" />
            </g>
          )}
        </svg>
      )}
      {a && <Tooltip x={x(active)} y={y(a.y)} width={width} value={formatY(a.y)} label={formatXLong(a.x)} />}
    </div>
  );
}

// Compare magnitude across ordered buckets: thin columns, rounded at the data end.
export function ColumnChart({ data, height = 240, formatY, formatTick = formatY, formatX, formatXLong = formatX, label }) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState(null);
  const n = data.length;
  const ticks = yTicks(Math.max(...data.map(d => d.y), 0));
  const top = ticks[ticks.length - 1];
  const left = Math.max(...ticks.map(t => formatTick(t).length)) * 7 + 14;
  const plotW = Math.max(width - left - M.right, 10);
  const plotH = height - M.top - M.bottom;
  const band = plotW / Math.max(n, 1);
  const barW = Math.min(24, band * 0.62);
  const y = v => M.top + plotH - (v / top) * plotH;
  const base = M.top + plotH;
  const every = Math.ceil(n / Math.max(1, Math.floor(plotW / 44)));

  const bar = (i, v) => {
    const x0 = left + i * band + (band - barW) / 2;
    const h = base - y(v);
    if (h <= 0) return '';
    const r = Math.min(4, h, barW / 2);
    return `M${x0},${base}V${base - h + r}Q${x0},${base - h} ${x0 + r},${base - h}H${x0 + barW - r}Q${x0 + barW},${base - h} ${x0 + barW},${base - h + r}V${base}Z`;
  };

  const a = active != null ? data[active] : null;

  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={label}
          tabIndex={0}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive(n - 1)}
          onBlur={() => setActive(null)}
          onKeyDown={e => keyNav(e, active, n, setActive)}
        >
          {ticks.map(t => (
            <g key={t}>
              <line x1={left} x2={left + plotW} y1={y(t)} y2={y(t)} className={t === 0 ? 'chart-axis' : 'chart-grid'} />
              <text x={left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="chart-tick">{formatTick(t)}</text>
            </g>
          ))}
          {data.map((d, i) => (
            <g key={i}>
              <path d={bar(i, d.y)} className={`chart-bar${active != null && active !== i ? ' is-dim' : ''}`} />
              {i % every === 0 && (
                <text x={left + i * band + band / 2} y={height - 8} textAnchor="middle" className="chart-tick">{formatX(d.x)}</text>
              )}
              <rect x={left + i * band} y={M.top} width={band} height={plotH} fill="transparent" onPointerEnter={() => setActive(i)} />
            </g>
          ))}
        </svg>
      )}
      {a && <Tooltip x={left + active * band + band / 2} y={y(a.y)} width={width} value={formatY(a.y)} label={formatXLong(a.x)} />}
    </div>
  );
}

// Ranked horizontal bars with the value at each bar's tip. Works for long names.
export function BarList({ data, format, label }) {
  const max = Math.max(...data.map(d => d.value), 0) || 1;
  return (
    <ul className="barlist" aria-label={label}>
      {data.map(d => (
        <li key={d.label} title={`${d.label}: ${format(d.value)}`}>
          <span className="barlist__label">{d.label}</span>
          <span className="barlist__track"><span className="barlist__bar" style={{ width: `${(d.value / max) * 100}%` }} /></span>
          <span className="barlist__value">{format(d.value)}</span>
        </li>
      ))}
    </ul>
  );
}

// Card around a chart with a Chart / Table toggle. `table` = { columns: [{ key, label, align, format }], rows }.
export function ChartCard({ title, subtitle, table, children, className = '' }) {
  const [view, setView] = useState('chart');
  return (
    <section className={`card chart-card ${className}`}>
      <header className="card__head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {table && (
          <button
            type="button"
            className="icon-btn"
            onClick={() => setView(v => (v === 'chart' ? 'table' : 'chart'))}
            aria-label={view === 'chart' ? 'Show as table' : 'Show as chart'}
            title={view === 'chart' ? 'Show as table' : 'Show as chart'}
          >
            {view === 'chart' ? <Table size={18} /> : <ChartIcon size={18} />}
          </button>
        )}
      </header>
      {view === 'chart' || !table ? children : <DataTable {...table} capped />}
    </section>
  );
}

// `capped` limits the height (used for a chart's table view, which can have 90 rows).
export function DataTable({ columns, rows, capped }) {
  return (
    <div className={`table-wrap${capped ? ' table-wrap--capped' : ''}`}>
      <table className="table table--compact">
        <thead>
          <tr>{columns.map(c => <th key={c.key} className={c.align === 'right' ? 'num' : undefined}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {columns.map(c => (
                <td key={c.key} className={c.align === 'right' ? 'num' : undefined}>{c.format ? c.format(r[c.key], r) : r[c.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
