// Business rules shared by several routes.

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
export const money = n => inr.format(Math.round(n || 0));

export const ZONES = ['North Zone', 'South Zone', 'East Zone', 'West Zone', 'Central'];
export const VEHICLES = ['Bike', 'Scooter', 'E-bike', 'Bicycle'];

// Order flow: placed (new) → preparing → out_for_delivery → delivered; or cancelled.
export const LIVE_STATUSES = ['placed', 'preparing', 'out_for_delivery'];
export const NEXT_STATUS = { placed: 'preparing', preparing: 'out_for_delivery', out_for_delivery: 'delivered' };

// Coupon lifecycle. `usedCount` is optional.
export function couponStatus(c, now = Date.now()) {
  if (c.expiresAt && Date.parse(c.expiresAt) < now) return 'expired';
  if (c.usageLimit && c.usedCount >= c.usageLimit) return 'used_up';
  if (!c.isActive) return 'paused';
  if (c.startsAt && Date.parse(c.startsAt) > now) return 'scheduled';
  return 'active';
}

// "Chrome on Windows", "Safari on iOS", …
export function deviceName(userAgent = '') {
  const ua = userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'unknown OS';
  return `${browser} on ${os}`;
}

// Strips IPv6-mapped prefixes so 127.0.0.1 reads normally.
export const clientIp = req => (req.ip || '').replace(/^::ffff:/, '') || null;
