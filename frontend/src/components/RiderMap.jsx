// The Live map (Leaflet + OpenStreetMap tiles, no key needed): each online rider as a dot with their
// initials, coloured by status and pointing where they're heading; a dashed line to where they're going
// next (the kitchen before pickup, the customer after); orders waiting for a rider; the kitchen; and the
// selected rider's route so far. Riders move in place as new positions arrive.
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { hasPoint } from '../lib/geo.js';
import { initials } from '../lib/format.js';
import { Maximize } from './Icons.jsx';

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const GURUGRAM = [28.4595, 77.0266];
const RED = '#B71C1C';
const BLUE = '#1A73E8';
const INDIGO = '#5B6BBF';

// Tooltips are HTML, so names and addresses are escaped.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ll = p => [p.lat, p.lng];

const STORE = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h16l-1.5-5h-13z"/><path d="M5 9v11h14V9"/></svg>';
const HOME = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/></svg>';
const BAG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>';

const pin = (kind, inner, size = 32) => L.divIcon({
  className: 'lm-icon',
  html: `<div class="lm-pin lm-pin--${kind}" style="width:${size}px;height:${size}px"><span>${inner}</span></div>`,
  iconSize: [size, size + 6],
  iconAnchor: [size / 2, size + 4],
  tooltipAnchor: [0, -size],
});

const riderIcon = (r, selected) => L.divIcon({
  className: 'lm-icon',
  html: `<div class="lm-rider lm-rider--${r.tone}${selected ? ' is-selected' : ''}">${
    r.tone !== 'stale' && r.location.heading != null ? `<i style="transform:rotate(${Math.round(r.location.heading)}deg)"></i>` : ''
  }<span>${esc(initials(r.name))}</span></div>`,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  tooltipAnchor: [0, -20],
});

/**
 * riders     [{ _id, name, tone: 'free' | 'busy' | 'stale', location, orders: [{ status, drop, … }] }]
 * waiting    orders with no rider yet
 * kitchen    { lat, lng, name } or null
 * selectedId the rider to highlight and fly to
 * track      [[lat, lng], …] the selected rider's route so far, or null
 */
export default function RiderMap({ riders, waiting, kitchen, selectedId, onSelect, track }) {
  const box = useRef(null);
  const map = useRef(null);
  const groups = useRef(null);
  const markers = useRef(new Map());
  const fitted = useRef(false);
  const lastSelected = useRef(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const m = L.map(box.current, { center: GURUGRAM, zoom: 13 });
    L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(m);
    m.attributionControl.setPrefix(false);
    groups.current = {
      lines: L.layerGroup().addTo(m),
      track: L.layerGroup().addTo(m),
      places: L.layerGroup().addTo(m),
    };
    map.current = m;
    const resize = new ResizeObserver(() => m.invalidateSize());
    resize.observe(box.current);
    return () => {
      resize.disconnect();
      m.remove();
      map.current = null;
      markers.current.clear();
      fitted.current = false;
    };
  }, []);

  // Riders: one marker each, moved in place.
  useEffect(() => {
    const seen = new Set();
    for (const r of riders) {
      if (!hasPoint(r.location)) continue;
      seen.add(r._id);
      const selected = r._id === selectedId;
      let marker = markers.current.get(r._id);
      if (!marker) {
        marker = L.marker(ll(r.location), { keyboard: false }).addTo(map.current);
        marker.on('click', () => onSelectRef.current(r._id));
        markers.current.set(r._id, marker);
      } else {
        marker.setLatLng(ll(r.location));
      }
      const look = `${r.tone}:${selected}:${r.location.heading ?? ''}:${r.name}`;
      if (marker.look !== look) {
        marker.setIcon(riderIcon(r, selected));
        marker.unbindTooltip().bindTooltip(esc(r.name), { direction: 'top' });
        marker.look = look;
      }
      marker.setZIndexOffset(selected ? 3000 : r.tone === 'stale' ? 1000 : 2000);
    }
    for (const [id, marker] of markers.current) {
      if (!seen.has(id)) {
        marker.remove();
        markers.current.delete(id);
      }
    }
  }, [riders, selectedId]);

  // Where each rider is going, drop points, waiting orders and the kitchen.
  useEffect(() => {
    const { lines, places } = groups.current;
    lines.clearLayers();
    places.clearLayers();
    if (hasPoint(kitchen)) {
      L.marker(ll(kitchen), { icon: pin('kitchen', STORE, 34), keyboard: false, zIndexOffset: 500 }).bindTooltip(esc(kitchen.name)).addTo(places);
    }
    for (const r of riders) {
      const selected = r._id === selectedId;
      for (const o of r.orders) {
        const carrying = o.status === 'out_for_delivery';
        if (hasPoint(o.drop)) {
          L.marker(ll(o.drop), { icon: pin(carrying ? 'drop' : 'drop-later', HOME), keyboard: false, zIndexOffset: selected ? 400 : 0 })
            .bindTooltip(`<b>${esc(o.orderNo)}</b> · ${esc(o.customerName)}<br>${esc(o.area)} · ${esc(r.name)}`)
            .addTo(places);
        }
        // Before pickup the rider is on the way to the kitchen.
        const next = carrying ? o.drop : kitchen;
        if (hasPoint(r.location) && hasPoint(next)) {
          L.polyline([ll(r.location), ll(next)], {
            color: carrying ? RED : INDIGO, weight: selected ? 4 : 2.5, opacity: selected ? 0.9 : 0.5, dashArray: '6 8', interactive: false,
          }).addTo(lines);
        }
      }
    }
    for (const o of waiting) {
      if (!hasPoint(o.drop)) continue;
      L.marker(ll(o.drop), { icon: pin('waiting', BAG, 28), keyboard: false })
        .bindTooltip(`<b>${esc(o.orderNo)}</b> · waiting for a rider<br>${esc(o.area)}`)
        .addTo(places);
    }
  }, [riders, waiting, kitchen, selectedId]);

  useEffect(() => {
    const g = groups.current.track;
    g.clearLayers();
    if (track?.length > 1) L.polyline(track, { color: BLUE, weight: 4, opacity: 0.6, lineCap: 'round', interactive: false }).addTo(g);
  }, [track]);

  const fitAll = () => {
    const pts = [
      ...riders.filter(r => hasPoint(r.location)).map(r => ll(r.location)),
      ...riders.flatMap(r => r.orders).filter(o => hasPoint(o.drop)).map(o => ll(o.drop)),
      ...waiting.filter(o => hasPoint(o.drop)).map(o => ll(o.drop)),
      ...(hasPoint(kitchen) ? [ll(kitchen)] : []),
    ];
    if (pts.length === 1) map.current.setView(pts[0], 15);
    else if (pts.length) map.current.fitBounds(pts, { padding: [50, 50], maxZoom: 16 });
    return pts.length > 0;
  };

  // Everything in view the first time there's something to show; after that the admin's view is kept.
  useEffect(() => {
    if (!fitted.current) fitted.current = fitAll();
  }, [riders, waiting, kitchen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flies to a rider when they're picked in the list.
  useEffect(() => {
    if (selectedId === lastSelected.current) return;
    lastSelected.current = selectedId;
    const r = riders.find(x => x._id === selectedId);
    if (r && hasPoint(r.location)) map.current.flyTo(ll(r.location), Math.max(map.current.getZoom(), 15), { duration: 0.6 });
  }, [selectedId, riders]);

  return (
    <div className="rider-map">
      <div ref={box} className="rider-map__canvas" />
      <button type="button" className="rider-map__fit" onClick={fitAll} title="Show everything" aria-label="Show everything on the map"><Maximize size={18} /></button>
      <ul className="rider-map__legend" aria-label="Map key">
        <li><i className="lm-dot lm-dot--free" />Free</li>
        <li><i className="lm-dot lm-dot--busy" />On delivery</li>
        <li><i className="lm-dot lm-dot--stale" />No signal</li>
        <li><i className="lm-dot lm-dot--waiting" />Waiting order</li>
      </ul>
    </div>
  );
}
