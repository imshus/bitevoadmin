// Distances on the Live map. These are straight lines: roads are about 1.3× longer, and riders average
// about 20 km/h through town, which is what the time estimates assume.

export const hasPoint = p => Boolean(p) && Number.isFinite(p.lat) && Number.isFinite(p.lng);

export function distanceKm(a, b) {
  const rad = d => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

// "350 m", "2.4 km"
export const kmLabel = km => (km == null ? '—' : km < 1 ? `${Math.max(10, Math.round(km * 100) * 10)} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`);

export const etaMins = km => Math.max(1, Math.round(((km * 1.3) / 20) * 60));
