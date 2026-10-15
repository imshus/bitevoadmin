// Derived statuses shared by several pages. `tone` maps to the status colours in styles.css.
import { money } from './format.js';

// Coupon lifecycle. `c.usedCount` is optional (only the coupon list has it).
export function couponStatus(c, now = Date.now()) {
  if (c.expiresAt && Date.parse(c.expiresAt) < now) return { key: 'expired', label: 'Expired', tone: 'neutral' };
  if (c.usageLimit && c.usedCount >= c.usageLimit) return { key: 'used_up', label: 'Used up', tone: 'neutral' };
  if (!c.isActive) return { key: 'paused', label: 'Paused', tone: 'warning' };
  if (c.startsAt && Date.parse(c.startsAt) > now) return { key: 'scheduled', label: 'Scheduled', tone: 'info' };
  return { key: 'active', label: 'Active', tone: 'good' };
}

export function describeOffer(c) {
  const upTo = c.maxDiscount ? ` up to ${money(c.maxDiscount)}` : '';
  switch (c.discountType) {
    case 'percent': return `${c.discountValue}% off${upTo}`;
    case 'flat': return `${money(c.discountValue)} off`;
    case 'free_item': return `Free ${c.freeItem?.qty > 1 ? `${c.freeItem.qty} × ` : ''}${c.freeItem?.name || 'item'}`;
    case 'cashback': return c.cashbackUnit === 'flat'
      ? `${money(c.discountValue)} wallet cashback`
      : `${c.discountValue}% wallet cashback${upTo}`;
    default: return 'Free delivery';
  }
}

const ACTIVE_MINS = 5;
const IDLE_MINS = 60;

export function sessionStatus(s, now = Date.now()) {
  if (s.revokedAt) return { key: 'signed_out', label: 'Signed out', tone: 'neutral' };
  const mins = (now - Date.parse(s.lastActiveAt)) / 60000;
  if (mins <= ACTIVE_MINS) return { key: 'active', label: 'Active now', tone: 'good' };
  if (mins <= IDLE_MINS) return { key: 'idle', label: 'Idle', tone: 'warning' };
  return { key: 'inactive', label: 'Signed in, inactive', tone: 'neutral' };
}

export const AGENT_STATUS = {
  online: { label: 'Online', tone: 'good' },
  busy: { label: 'On delivery', tone: 'info' },
  offline: { label: 'Offline', tone: 'neutral' },
};

export const KYC_STATUS = {
  verified: { label: 'Verified', tone: 'good' },
  pending: { label: 'Pending', tone: 'warning' },
  rejected: { label: 'Rejected', tone: 'critical' },
};

// Order flow: placed (new) → preparing → out_for_delivery → delivered; or cancelled.
export const ORDER_STATUS = {
  placed: { label: 'New', tone: 'warning' },
  preparing: { label: 'Preparing', tone: 'info' },
  out_for_delivery: { label: 'Out for delivery', tone: 'info' },
  delivered: { label: 'Delivered', tone: 'good' },
  cancelled: { label: 'Cancelled', tone: 'critical' },
};

export const WALLET_TXN = {
  cashback: { label: 'Cashback', tone: 'good' },
  refund: { label: 'Refund', tone: 'info' },
  payment: { label: 'Paid for order', tone: 'neutral' },
  admin_credit: { label: 'Added by admin', tone: 'good' },
  admin_debit: { label: 'Deducted by admin', tone: 'warning' },
};

export const ROLE_LABEL = { admin: 'Admin', agent: 'Delivery agent', customer: 'Customer' };
