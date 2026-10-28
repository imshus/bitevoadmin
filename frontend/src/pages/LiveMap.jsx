// Live map: where every online rider is right now (sent by the delivery partner app), the orders they
// carry and how far they are from the customer or the kitchen, and today's orders still waiting for a
// rider, which can be assigned here with the nearest riders listed first. Reloads every 5 seconds.
import { useCallback, useEffect, useState } from 'react';
import * as api from '../api/index.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Badge, Segmented, StatTile, Loading, ErrorState, EmptyState } from '../components/ui.jsx';
import { Bike, Bag, MapPin, Activity, Smartphone } from '../components/Icons.jsx';
import RiderMap from '../components/RiderMap.jsx';
import { usePageTitle } from '../lib/useApi.js';
import { money, timeAgo, initials } from '../lib/format.js';
import { distanceKm, etaMins, hasPoint, kmLabel } from '../lib/geo.js';

const REFRESH_MS = 5000;
const STALE_MS = 2 * 60000; // no position for this long = "No signal"

const TONE = {
  free: { label: 'Free', badge: 'good' },
  busy: { label: 'On delivery', badge: 'info' },
  stale: { label: 'No signal', badge: 'warning' },
};

const secondsAgo = (iso, now) => {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  return s < 60 ? `${s}s ago` : timeAgo(iso, now);
};

// Adds what the page shows about each rider: freshness and distances to where they're going next.
function withDistances(rider, kitchen, now) {
  const age = rider.location ? now - Date.parse(rider.location.at) : null;
  const tone = !rider.location || age > STALE_MS ? 'stale' : rider.status === 'busy' ? 'busy' : 'free';
  const here = hasPoint(rider.location) ? rider.location : null;
  const orders = rider.orders.map(o => {
    // Before pickup the rider is heading to the kitchen; after, to the customer.
    const carrying = o.status === 'out_for_delivery';
    const target = carrying ? o.drop : kitchen;
    return { ...o, carrying, km: here && hasPoint(target) ? distanceKm(here, target) : null };
  });
  return { ...rider, age, tone, orders, kmToKitchen: here && hasPoint(kitchen) ? distanceKm(here, kitchen) : null };
}

function RiderRow({ rider: r, selected, onSelect, now }) {
  // Online with an order to collect: not free any more, though not carrying food yet.
  const tone = r.tone === 'free' && r.orders.length ? { label: 'To kitchen', badge: 'info' } : TONE[r.tone];
  const speed = r.location?.speed > 0.5 ? ` · ${Math.round(r.location.speed * 3.6)} km/h` : '';
  return (
    <li className={`rider-row${selected ? ' is-selected' : ''}`}>
      <button type="button" className="rider-row__main" onClick={() => onSelect(selected ? null : r._id)} aria-pressed={selected}>
        <span className={`rider-row__avatar rider-row__avatar--${r.tone}`}>{initials(r.name)}</span>
        <span className="rider-row__body">
          <span className="rider-row__top">
            <strong>{r.name}</strong>
            <Badge tone={r.usesApp ? tone.badge : 'neutral'}>{r.usesApp ? tone.label : 'No app'}</Badge>
          </span>
          <span className="rider-row__meta">{r.vehicleType}{r.vehicleNumber && ` · ${r.vehicleNumber}`} · {r.zone}</span>
          <span className={`rider-row__signal is-${r.tone}`}>
            {!r.location ? 'Online in the panel, but not sharing a location (not using the rider app)'
              : r.tone === 'stale' ? `Last position ${timeAgo(r.location.at, now)}`
              : `Live · updated ${secondsAgo(r.location.at, now)}${speed}`}
          </span>
          <span className="rider-row__meta">
            {r.kmToday} km today · {r.deliveredToday} delivered{r.cashToday > 0 && ` · ${money(r.cashToday)} cash`}
            {!r.orders.length && r.kmToKitchen != null && ` · ${kmLabel(r.kmToKitchen)} from kitchen`}
          </span>
          {r.orders.map(o => (
            <span key={o._id} className={`rider-order${o.carrying ? ' is-carrying' : ''}`}>
              <span><strong>{o.orderNo}</strong> · {o.customerName} · {o.area || o.zone}</span>
              <span>
                {o.carrying ? 'On the way to the customer' : 'Going to the kitchen'}
                {o.km != null && ` · ${kmLabel(o.km)} away · ≈ ${etaMins(o.km)} min`}
                {o.cashToCollect > 0 ? ` · collect ${money(o.cashToCollect)}` : ' · paid'}
              </span>
            </span>
          ))}
        </span>
      </button>
      {selected && r.phone && (
        <a className="btn btn--ghost btn--sm rider-row__call" href={`tel:${r.phone.replace(/[^\d+]/g, '')}`}><Smartphone size={15} />Call {r.phone}</a>
      )}
    </li>
  );
}

// An order without a (online) rider, and a picker with the nearest verified riders first.
function AssignRow({ order, riders, kitchen, note, onAssign, busy }) {
  // The rider picks up at the kitchen, so that's the distance that matters; without it, the customer's.
  const target = hasPoint(kitchen) ? kitchen : order.drop;
  const options = riders
    .filter(r => r.kycStatus === 'verified')
    .map(r => ({ r, km: hasPoint(r.location) && hasPoint(target) ? distanceKm(r.location, target) : null }))
    .sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));
  const [pick, setPick] = useState('');
  const chosen = options.some(x => x.r._id === pick) ? pick : options[0]?.r._id || '';

  return (
    <li className="wait-row">
      <div className="wait-row__top">
        <strong>{order.orderNo}</strong>
        <Badge tone={order.status === 'placed' ? 'warning' : 'info'}>{order.status === 'placed' ? 'New' : order.status === 'preparing' ? 'Preparing' : 'Out for delivery'}</Badge>
        <span className="wait-row__ago">{timeAgo(order.placedAt)}</span>
      </div>
      <span className="wait-row__meta">
        {order.customerName} · {order.area || order.zone} · {order.itemCount} item{order.itemCount === 1 ? '' : 's'} · {order.cashToCollect > 0 ? `cash ${money(order.cashToCollect)}` : 'paid'}
      </span>
      {note && <span className="wait-row__note">{note}</span>}
      {options.length ? (
        <div className="wait-row__assign">
          <select className="input input--sm" value={chosen} onChange={e => setPick(e.target.value)} aria-label={`Rider for ${order.orderNo}`}>
            {options.map(({ r, km }) => (
              <option key={r._id} value={r._id}>
                {r.name} · {km != null ? `${kmLabel(km)} from ${hasPoint(kitchen) ? 'kitchen' : 'customer'}` : 'no location'} · {r.orders.length ? `${r.orders.length} order${r.orders.length === 1 ? '' : 's'}` : 'free'}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn--primary btn--sm" disabled={!chosen || busy} onClick={() => onAssign(order, chosen)}>
            {busy ? 'Assigning…' : 'Assign'}
          </button>
        </div>
      ) : <span className="wait-row__meta">No verified rider is online.</span>}
    </li>
  );
}

export default function LiveMap() {
  usePageTitle('Live map');
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [track, setTrack] = useState(null);
  const [assigning, setAssigning] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await api.live.get());
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') load(); }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const now = Date.now();
  const kitchen = data?.kitchen || null;
  const riders = (data?.riders || []).map(r => withDistances(r, kitchen, now));
  const selected = riders.find(r => r._id === selectedId) || null;
  const carryingId = selected?.orders.find(o => o.carrying)?._id || null;

  // The selected rider's route so far, for the order they're carrying.
  useEffect(() => {
    if (!carryingId) return setTrack(null);
    let gone = false;
    const get = () => api.live.track(carryingId).then(r => { if (!gone) setTrack(r.points.map(p => [p.lat, p.lng])); }).catch(() => {});
    get();
    const timer = setInterval(get, 15000);
    return () => {
      gone = true;
      clearInterval(timer);
    };
  }, [carryingId]);

  const assign = async (order, agentId) => {
    const rider = riders.find(r => r._id === agentId);
    setAssigning(order._id);
    try {
      await api.orders.assign(order._id, agentId);
      toast(`${order.orderNo} assigned to ${rider?.name || 'the rider'}`);
      await load();
    } catch (err) {
      toast(err.message, 'critical');
    } finally {
      setAssigning(null);
    }
  };

  if (!data && error) return <ErrorState error={error} onRetry={load} />;
  if (!data) return <Loading />;

  const counts = {
    all: riders.length,
    busy: riders.filter(r => r.tone === 'busy').length,
    free: riders.filter(r => r.tone === 'free').length,
    stale: riders.filter(r => r.tone === 'stale').length,
  };
  const rows = riders
    .filter(r => filter === 'all' || r.tone === filter)
    .sort((a, b) => ({ busy: 0, free: 1, stale: 2 }[a.tone] - { busy: 0, free: 1, stale: 2 }[b.tone]) || a.name.localeCompare(b.name));
  const onTheWay = riders.reduce((n, r) => n + r.orders.filter(o => o.carrying).length, 0);
  const kmToday = Math.round(riders.reduce((s, r) => s + r.kmToday, 0) * 10) / 10;
  const trackLine = track && selected?.location ? [...track, [selected.location.lat, selected.location.lng]] : track;

  return (
    <>
      <PageHeader eyebrow="Live" title={<>Riders on the <em>map</em></>}
        subtitle="Positions come from the BiteVo delivery partner app and update every 5 seconds.">
        <span className="toolbar__note">{error ? `Can’t refresh: ${error.message}` : `Updated ${secondsAgo(data.at, now)}`}</span>
      </PageHeader>

      <div className="stats">
        <StatTile label="Riders online" value={counts.all} hint={`${counts.busy} on delivery · ${counts.free} free${counts.stale ? ` · ${counts.stale} no signal` : ''}`} icon={<Bike size={18} />} />
        <StatTile label="Orders on the way" value={onTheWay} hint="Picked up, heading to customers" icon={<MapPin size={18} />} />
        <StatTile label="Waiting for a rider" value={data.waiting.length} hint={data.withOfflineRider.length ? `+ ${data.withOfflineRider.length} with an offline rider` : 'Today’s live orders with no rider'} icon={<Bag size={18} />} />
        <StatTile label="Ridden today" value={`${kmToday} km`} hint="By the riders online now" icon={<Activity size={18} />} />
      </div>

      <div className="live">
        <div className="card live__map">
          <RiderMap riders={riders} waiting={[...data.waiting, ...data.withOfflineRider]} kitchen={kitchen} selectedId={selectedId} onSelect={setSelectedId} track={trackLine} />
        </div>

        <div className="live__side">
          <div className="card">
            <div className="card__head">
              <div>
                <h2>Riders</h2>
                <p>Pick a rider to follow them on the map.</p>
              </div>
            </div>
            {riders.length ? (
              <>
                <div className="live__filter">
                  <Segmented label="Show riders" value={filter} onChange={setFilter} options={[
                    { value: 'all', label: 'All', count: counts.all },
                    { value: 'busy', label: 'On delivery', count: counts.busy },
                    { value: 'free', label: 'Free', count: counts.free },
                    ...(counts.stale ? [{ value: 'stale', label: 'No signal', count: counts.stale }] : []),
                  ]} />
                </div>
                <ul className="rider-list">
                  {rows.map(r => <RiderRow key={r._id} rider={r} selected={r._id === selectedId} onSelect={setSelectedId} now={now} />)}
                  {!rows.length && <li className="card__empty">No riders here right now.</li>}
                </ul>
              </>
            ) : (
              <EmptyState icon={<Bike />} title="No riders online" text="Riders appear here as soon as they go online in the BiteVo delivery partner app." />
            )}
          </div>

          <div className="card">
            <div className="card__head">
              <div>
                <h2>Waiting for a rider</h2>
                <p>Nearest riders first, by distance {hasPoint(kitchen) ? 'to the kitchen' : 'to the customer'}.</p>
              </div>
            </div>
            {data.waiting.length || data.withOfflineRider.length ? (
              <ul className="wait-list">
                {data.waiting.map(o => <AssignRow key={o._id} order={o} riders={riders} kitchen={kitchen} onAssign={assign} busy={assigning === o._id} />)}
                {data.withOfflineRider.map(o => (
                  <AssignRow key={o._id} order={o} riders={riders} kitchen={kitchen} onAssign={assign} busy={assigning === o._id}
                    note={`Assigned to ${o.agentName}, who is offline. Reassign it?`} />
                ))}
              </ul>
            ) : <p className="card__empty">Every live order has a rider.</p>}
          </div>
        </div>
      </div>
    </>
  );
}
