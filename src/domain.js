export const currencies = ['TZS', 'USD', 'AED'];
export const services = [
  'sourcing',
  'import-export',
  'verification',
  'logistics',
  'consulting',
  'private-label',
  'general',
];
export const stages = [
  'new',
  'sourcing',
  'awaiting_approval',
  'purchasing',
  'inspection',
  'ready_to_ship',
  'in_transit',
  'delivered',
  'cancelled',
];
export function minor(value) {
  const s = String(value).trim();
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(s))
    throw new Error('Use a positive amount with no more than two decimal places.');
  const [whole, decimal = ''] = s.split('.');
  const result = BigInt(whole) * 100n + BigInt(decimal.padEnd(2, '0'));
  if (result > 99999999999999n) throw new Error('Amount is too large.');
  return result;
}
export function decimal(value) {
  const raw = BigInt(value);
  const n = raw < 0n ? -raw : raw;
  return `${raw < 0n ? '-' : ''}${n / 100n}.${String(n % 100n).padStart(2, '0')}`;
}
export function quoteTotal(items, fee = '0', shipping = '0') {
  if (items.length > 100) throw new Error('A quotation supports up to 100 items.');
  let total = minor(fee) + minor(shipping);
  for (const line of items) {
    const quantity = Number(line.quantity);
    if (
      !line.description?.trim() ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > 1000000
    )
      throw new Error(
        'Each item needs a description and a whole quantity between 1 and 1,000,000.',
      );
    total += minor(line.unit_price) * BigInt(quantity);
  }
  if (!items.length || total > 99999999999999n)
    throw new Error('Check quotation items and amounts.');
  return decimal(total);
}
export function orderBalance(order, payments) {
  const paid = payments
    .filter((p) => p.order_id === order.id)
    .reduce((sum, p) => {
      if (p.currency !== order.currency)
        throw new Error('Payment currency does not match the order.');
      return sum + minor(p.amount);
    }, 0n);
  return { paid: decimal(paid), balance: decimal(minor(order.agreed_amount) - paid) };
}
export function canWrite(role, entity) {
  if (role === 'admin') return true;
  if (entity === 'payments') return role === 'finance';
  return (
    role === 'operations' &&
    ['customers', 'suppliers', 'quotations', 'orders', 'shipments', 'website_requests'].includes(
      entity,
    )
  );
}
export function escapeHTML(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}
export function csvCell(value) {
  const s = String(value ?? '');
  return '"' + (/^[\s]*[=+@\-]/.test(s) ? "'" : '') + s.replaceAll('"', '""') + '"';
}
export function label(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replaceAll('-', ' ');
}
export function money(amount, currency = 'TZS') {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));
}
export function uniqueId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}
export function reference(prefix) {
  return `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${uniqueId().replaceAll('-', '').slice(0, 8).toUpperCase()}`;
}
