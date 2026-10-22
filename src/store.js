import { createClient } from '@supabase/supabase-js';
import { canWrite, minor, quoteTotal, orderBalance, reference, uniqueId } from './domain.js';
const entities = [
  'website_requests',
  'customers',
  'suppliers',
  'quotations',
  'orders',
  'shipments',
  'payments',
];
const storageKey = 'jkm-workspace-demo-v1';
const now = () => new Date().toISOString();
export const configured = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);
export const client = configured
  ? createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
  : null;
export function seed() {
  const stamp = now();
  return {
    customers: [
      {
        id: 'customer-1',
        name: 'Amani Retail — sample',
        company: 'Amani Retail',
        email: 'buyer@example.com',
        phone: '+255700000000',
        country: 'Tanzania',
        notes: 'Illustrative customer. Demo data only.',
        created_at: stamp,
        updated_at: stamp,
      },
      {
        id: 'customer-2',
        name: 'Coast Hospitality — sample',
        company: 'Coast Hospitality',
        email: 'hospitality@example.com',
        phone: '+255711111111',
        country: 'Tanzania',
        notes: 'Illustrative customer.',
        created_at: stamp,
        updated_at: stamp,
      },
    ],
    suppliers: [
      {
        id: 'supplier-1',
        name: 'Gulf Packaging — sample',
        contact_name: 'Sample contact',
        email: 'supplier@example.com',
        phone: '+971500000000',
        country: 'UAE',
        category: 'Packaging',
        verification_status: 'pending',
        notes: 'Illustrative supplier; not a verified recommendation.',
        created_at: stamp,
        updated_at: stamp,
      },
    ],
    website_requests: [
      {
        id: 'request-1',
        reference: 'JKM-DEMO-001',
        full_name: 'Amani Buyer',
        company: 'Amani Retail — sample',
        email: 'buyer@example.com',
        phone: '+255700000000',
        service: 'sourcing',
        product: 'Branded packaging boxes',
        quantity: '500 pieces',
        origin: 'UAE',
        destination: 'Dar es Salaam, Tanzania',
        timeline: 'Next month',
        message:
          'Sample website enquiry: source 500 branded packaging boxes with sample approval before production.',
        attachments: [],
        status: 'new',
        created_at: stamp,
        updated_at: stamp,
      },
    ],
    quotations: [
      {
        id: 'quote-1',
        reference: 'QT-DEMO-001',
        customer_id: 'customer-1',
        service: 'sourcing',
        currency: 'USD',
        items: [{ description: 'Packaging boxes — sample', quantity: 500, unit_price: '2.00' }],
        service_fee: '100.00',
        shipping_cost: '150.00',
        total: '1250.00',
        valid_until: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
        status: 'accepted',
        notes: 'Illustrative quotation only. No actual trade or commitment.',
        created_at: stamp,
        updated_at: stamp,
      },
    ],
    orders: [
      {
        id: 'order-1',
        reference: 'ORD-DEMO-001',
        customer_id: 'customer-1',
        supplier_id: 'supplier-1',
        quotation_id: 'quote-1',
        source_request_id: null,
        title: 'Branded retail packaging — sample',
        service: 'sourcing',
        currency: 'USD',
        agreed_amount: '1250.00',
        estimated_cost: '950.00',
        status: 'purchasing',
        due_date: new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10),
        notes: 'Sample order. Tracking milestones are staff-entered.',
        created_at: stamp,
        updated_at: stamp,
      },
    ],
    shipments: [
      {
        id: 'shipment-1',
        reference: 'SHP-DEMO-001',
        order_id: 'order-1',
        carrier: 'Partner to be confirmed',
        tracking_number: '',
        origin: 'Dubai, UAE',
        destination: 'Dar es Salaam, Tanzania',
        method: 'air',
        status: 'preparing',
        estimated_arrival: new Date(Date.now() + 24 * 86400000).toISOString().slice(0, 10),
        notes: 'Illustrative shipment, not live carrier tracking.',
        created_at: stamp,
        updated_at: stamp,
      },
    ],
    payments: [
      {
        id: 'payment-1',
        reference: 'PAY-DEMO-001',
        order_id: 'order-1',
        amount: '500.00',
        currency: 'USD',
        method: 'bank',
        payment_date: new Date().toISOString().slice(0, 10),
        external_reference: 'DEMO-DEPOSIT',
        notes: 'Demo deposit record. No money transferred.',
        created_at: stamp,
        updated_at: stamp,
      },
    ],
  };
}
function loadDemo() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && entities.every((key) => Array.isArray(saved[key]))) return saved;
  } catch {
    /* Start clean if browser storage is unavailable. */
  }
  return seed();
}
export class Workspace {
  constructor() {
    this.demo = false;
    this.role = null;
    this.user = null;
    this.data = Object.fromEntries(entities.map((key) => [key, []]));
  }
  openDemo() {
    this.demo = true;
    this.role = 'admin';
    this.user = { email: 'demo@jkm.local' };
    this.data = loadDemo();
  }
  async restore() {
    if (!client) return false;
    const {
      data: { session },
      error,
    } = await client.auth.getSession();
    if (error) throw error;
    if (!session) return false;
    await this.authorize(session.user);
    return true;
  }
  async signIn(email, password) {
    if (!client)
      throw new Error('Supabase is not connected yet. Use the labelled demo workspace to explore.');
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error('Sign-in failed. Check your details or ask your administrator.');
    await this.authorize(data.user);
  }
  async authorize(user) {
    this.demo = false;
    const { data, error } = await client
      .from('staff_members')
      .select('user_id,role')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error || !data || !['admin', 'operations', 'finance'].includes(data.role)) {
      await client.auth.signOut();
      throw new Error('This account is not authorised for JKM Workspace.');
    }
    this.role = data.role;
    this.user = user;
    try {
      await this.refresh();
    } catch (error) {
      this.role = null;
      this.user = null;
      throw error;
    }
  }
  async refresh() {
    if (this.demo) return;
    const loaded = await Promise.all(
      entities.map(async (entity) => {
        let rows = [];
        for (let from = 0; from < 10000; from += 500) {
          const { data, error } = await client
            .from(entity)
            .select('*')
            .order('created_at', { ascending: false })
            .order('id')
            .range(from, from + 499);
          if (error)
            throw new Error(
              `Could not load ${entity.replaceAll('_', ' ')}. Check database setup and access.`,
            );
          rows.push(...data);
          if (data.length < 500) return [entity, rows];
        }
        throw new Error(
          'More than 10,000 records require server-side pagination before this workspace can load safely.',
        );
      }),
    );
    this.data = Object.fromEntries(loaded);
  }
  persist() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(this.data));
    } catch {
      throw new Error('Browser storage is full or blocked. Demo changes could not be persisted.');
    }
  }
  async save(entity, payload, id) {
    if (entity === 'payments' && id) throw new Error('Payment records are append-only.');
    if (!canWrite(this.role, entity))
      throw new Error('Your staff role cannot change these records.');
    const existing = id ? this.data[entity].find((row) => row.id === id) : null;
    if (id && !existing) throw new Error('This record is no longer available. Refresh and retry.');
    if (entity === 'website_requests') payload = { status: payload.status };
    if (this.demo) {
      const row = { ...existing, ...payload };
      if (entity === 'quotations')
        row.total = quoteTotal(row.items, row.service_fee, row.shipping_cost);
      if (entity === 'orders') {
        minor(row.agreed_amount);
        minor(row.estimated_cost);
        if (
          id &&
          minor(orderBalance(existing, this.data.payments).paid) > 0n &&
          (row.currency !== existing.currency ||
            row.customer_id !== existing.customer_id ||
            row.status === 'cancelled')
        )
          throw new Error(
            'An order with payments cannot change customer, currency or be cancelled.',
          );
        if (
          row.quotation_id &&
          this.data.orders.some((o) => o.id !== id && o.quotation_id === row.quotation_id)
        )
          throw new Error('This quotation is already linked to an order.');
        if (id && minor(row.agreed_amount) < minor(orderBalance(existing, this.data.payments).paid))
          throw new Error('Order amount cannot be less than payments already recorded.');
        if (
          row.source_request_id &&
          this.data.orders.some(
            (order) => order.id !== id && order.source_request_id === row.source_request_id,
          )
        )
          throw new Error('This website request is already linked to an order.');
        if (row.quotation_id) {
          const quote = this.data.quotations.find((q) => q.id === row.quotation_id);
          if (
            !quote ||
            quote.status !== 'accepted' ||
            quote.customer_id !== row.customer_id ||
            quote.currency !== row.currency ||
            quote.service !== row.service ||
            minor(quote.total) !== minor(row.agreed_amount)
          )
            throw new Error(
              'Linked quotation must be accepted and match the customer, currency and amount.',
            );
        }
      }
      if (entity === 'payments') {
        const order = this.data.orders.find((o) => o.id === row.order_id);
        if (!order) throw new Error('Select an order first.');
        if (order.status === 'cancelled')
          throw new Error('Cannot record payments on a cancelled order.');
        const balance = orderBalance(
          order,
          this.data.payments.filter((p) => p.id !== id),
        );
        if (
          row.currency !== order.currency ||
          minor(row.amount) <= 0n ||
          minor(row.amount) > minor(balance.balance)
        )
          throw new Error(
            'Payment must match the order currency and cannot exceed the outstanding balance.',
          );
        if (
          this.data.payments.some(
            (p) =>
              p.id !== id &&
              p.order_id === row.order_id &&
              p.external_reference === row.external_reference,
          )
        )
          throw new Error('This payment reference is already recorded for the order.');
      }
      if (entity === 'quotations' && id && this.data.orders.some((o) => o.quotation_id === id))
        throw new Error(
          'A quotation linked to an order is locked. Create a new quotation for revisions.',
        );
      row.id ||= uniqueId();
      row.created_at ||= now();
      row.updated_at = now();
      if (!id && ['quotations', 'orders', 'shipments', 'payments'].includes(entity))
        row.reference = reference(
          { quotations: 'QT', orders: 'ORD', shipments: 'SHP', payments: 'PAY' }[entity],
        );
      const old = this.data[entity];
      this.data[entity] = id ? old.map((r) => (r.id === id ? row : r)) : [row, ...old];
      try {
        this.persist();
      } catch (error) {
        this.data[entity] = old;
        throw error;
      }
      return row;
    }
    let query = id
      ? client.from(entity).update(payload).eq('id', id).eq('updated_at', existing.updated_at)
      : client.from(entity).insert(payload);
    const { data, error } = await query.select().single();
    if (error)
      throw new Error(
        error.code === 'PGRST116'
          ? 'Record changed elsewhere or access expired. Refresh before editing.'
          : error.message,
      );
    this.data[entity] = id
      ? this.data[entity].map((row) => (row.id === id ? data : row))
      : [data, ...this.data[entity]];
    return data;
  }
  async attachment(path) {
    if (this.demo) throw new Error('Demo files are not connected to storage.');
    const { data, error } = await client.storage.from('request-files').createSignedUrl(path, 60);
    if (error) throw new Error('Attachment could not be opened. Check staff access.');
    return data.signedUrl;
  }
  async signOut() {
    if (client && !this.demo) {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw new Error('Sign-out could not be confirmed. Try again.');
    }
    this.role = null;
    this.user = null;
    this.data = Object.fromEntries(entities.map((key) => [key, []]));
    this.demo = false;
  }
  resetDemo() {
    if (!this.demo) throw new Error('Demo only.');
    this.data = seed();
    this.persist();
  }
}
