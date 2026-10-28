// Delivery addresses on orders placed on the website:
// { label, line1, line2, landmark, area, pincode, zone, lat, lng, mapAddress }. Demo and older orders have none.

const clean = v => (typeof v === 'string' ? v.trim() : '');
const has = (lines, part) => lines.some(l => l.toLowerCase().includes(part.toLowerCase()));

// The full address as lines, e.g. "Flat 12, Tower B" / "MG Road" / "Landmark: Opposite City Mall" / "Sector 14 · 122001".
export function addressLines(a) {
  if (!a) return [];
  // Nothing typed in (only a pin on the map): the address the map gave for the pin comes first.
  const typed = [clean(a.line1), clean(a.line2)].filter(Boolean);
  const lines = typed.length ? typed : [clean(a.mapAddress)].filter(Boolean);
  const landmark = clean(a.landmark);
  if (landmark) lines.push(`Landmark: ${landmark}`);
  const area = clean(a.area);
  const pincode = clean(a.pincode);
  const place = [area && !has(lines, area) ? area : '', pincode && !has(lines, pincode) ? pincode : ''].filter(Boolean).join(' · ');
  if (place) lines.push(place);
  return lines;
}

// One short line for the order list, e.g. "Flat 12, Tower B, Sector 14".
export function shortAddress(a) {
  if (!a) return '';
  const first = clean(a.line1) || clean(a.mapAddress);
  const place = clean(a.area) || clean(a.line2);
  return [first, place && !first.toLowerCase().includes(place.toLowerCase()) ? place : ''].filter(Boolean).join(', ');
}

// Opens the customer's map pin (or, without one, the address text) in Google Maps.
export function mapsLink(a) {
  if (!a) return null;
  if (Number.isFinite(a.lat) && Number.isFinite(a.lng)) return `https://www.google.com/maps/search/?api=1&query=${a.lat},${a.lng}`;
  const text = addressLines(a).join(', ');
  return text ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}` : null;
}
