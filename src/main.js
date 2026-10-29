import './style.css';
import { Workspace, client, configured } from './store.js';
import { modules } from './schema.js';
import { icon } from './icons.js';
import {
  escapeHTML as esc,
  label,
  money,
  minor,
  quoteTotal,
  orderBalance,
  canWrite,
  csvCell,
} from './domain.js';
const ws = new Workspace();
const root = document.querySelector('#app');
const dialog = document.querySelector('#record-dialog');
let view = 'dashboard',
  search = '',
  filter = 'all',
  toastTimer;
function notify(message, error = false) {
  const t = document.querySelector('#toast');
  t.textContent = message;
  t.className = error ? 'visible error' : 'visible';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.className = '';
    t.textContent = '';
  }, 5500);
}
const badge = (status) =>
  `<span class="badge ${['delivered', 'accepted', 'closed', 'inspection_completed'].includes(status) ? 'green' : ['new', 'draft', 'pending', 'preparing'].includes(status) ? 'blue' : ['cancelled', 'rejected', 'on_hold'].includes(status) ? 'red' : 'amber'}">${esc(label(status))}</span>`;
const button = (text, action, kind = 'primary', ic = 'plus') =>
  `<button type="button" class="button ${kind}" data-action="${action}">${icon(ic)}${text}</button>`;
function related(entity, id) {
  const row = ws.data[entity]?.find((r) => r.id === id);
  return row ? row.name || row.reference : '—';
}
function display(entity, key, row) {
  if (key.endsWith('_id'))
    return related(
      {
        customer_id: 'customers',
        supplier_id: 'suppliers',
        order_id: 'orders',
        quotation_id: 'quotations',
        source_request_id: 'website_requests',
      }[key],
      row[key],
    );
  if (['amount', 'agreed_amount', 'total'].includes(key)) return money(row[key], row.currency);
  if (key === 'payment_date') return row[key];
  return ['status', 'verification_status', 'service', 'method'].includes(key)
    ? label(row[key] || '—')
    : String(row[key] ?? '—');
}
function navigate(route) {
  location.hash = route;
}
function route() {
  const key = location.hash.slice(1) || 'dashboard';
  view = modules[key] || ['dashboard', 'reports', 'settings'].includes(key) ? key : 'dashboard';
  search = '';
  filter = 'all';
  render();
  window.scrollTo(0, 0);
}
function auth(message = '') {
  root.innerHTML = `<div class="auth-layout"><section class="auth-story"><a class="auth-brand" href="${esc(import.meta.env.VITE_WEBSITE_URL || 'https://jkmglobaltraders.co.tz')}"><img src="/jkm-logo.png" alt="JKM Global Traders"></a><div><span class="eyebrow">THE JKM WORKSPACE</span><h1>Every request.<br>Every detail.<br><em>One place.</em></h1><p>Your staff workspace for sourcing, trade coordination and customer orders.</p></div><span class="auth-caption">Connecting Markets. Delivering Value.</span></section><section class="auth-panel"><div class="login"><span class="eyebrow">STAFF ACCESS</span><h2>Welcome to JKM.</h2><p>Sign in to keep business moving.</p><form id="login-form"><label>Email address<input name="email" type="email" required autocomplete="username" placeholder="Your staff email"></label><label>Password<input name="password" type="password" required autocomplete="current-password" placeholder="Enter your password"></label><button class="button primary" type="submit">Sign in to workspace ${icon('arrow')}</button><p id="auth-status" role="status">${esc(message || (!configured ? 'Live workspace is not connected yet. Please contact the administrator.' : ''))}</p></form></div><span class="secure-note">For authorised JKM staff. Accounts are provisioned by an administrator.</span></section></div>`;
  document.querySelector('#login-form').onsubmit = async (event) => {
    event.preventDefault();
    const b = event.target.querySelector('button');
    b.disabled = true;
    document.querySelector('#auth-status').textContent = 'Signing in…';
    const data = new FormData(event.target);
    try {
      await ws.signIn(data.get('email'), data.get('password'));
      event.target.reset();
      route();
    } catch (error) {
      document.querySelector('#auth-status').textContent = error.message;
    } finally {
      b.disabled = false;
    }
  };
}
function render() {
  if (!ws.user) {
    auth();
    return;
  }
  const info = modules[view];
  root.innerHTML = `<div class="workspace"><aside class="sidebar" id="sidebar"><button class="icon-button sidebar-close" id="nav-close" aria-label="Close navigation">${icon('close')}</button><a class="sidebar-brand" href="#dashboard"><img src="/jkm-logo.png" alt="JKM Global Traders"></a><span class="workspace-name">OPERATIONS WORKSPACE</span><nav aria-label="Workspace">${[['dashboard', 'Overview', 'dashboard'], ...Object.entries(modules).map(([k, v]) => [k, v.title, v.icon]), ['reports', 'Reports', 'chart']].map(([key, name, ic]) => `<a href="#${key}" class="nav-item ${view === key ? 'active' : ''}" ${view === key ? 'aria-current="page"' : ''}>${icon(ic)}<span>${name}</span>${key === 'website_requests' ? `<small>${ws.data.website_requests.filter((r) => r.status === 'new').length}</small>` : ''}</a>`).join('')}</nav><div class="sidebar-bottom"><a class="nav-item ${view === 'settings' ? 'active' : ''}" href="#settings">${icon('settings')}Workspace settings</a><div class="sidebar-help"><span class="help-dot"></span><div><strong>Built for your next move.</strong><small>JKM Global Traders</small></div></div></div></aside><div class="workspace-main"><header class="topbar"><button id="nav-toggle" class="icon-button" aria-label="Toggle navigation" aria-expanded="false">${icon('menu')}</button><div class="breadcrumb">Workspace <span>/</span> <b>${esc(info?.title || label(view))}</b></div><div class="top-right"><span class="mode-chip ${ws.demo ? 'demo' : ''}">${ws.demo ? 'Demo workspace' : 'Live workspace'}</span><span class="avatar">${esc(ws.user.email?.slice(0, 2).toUpperCase() || 'JK')}</span><button id="logout" class="icon-button" aria-label="Sign out">${icon('logout')}</button></div></header>${ws.demo ? '<div class="demo-banner"><span><strong>Demo mode</strong> · Sample data saved only in this browser. No live customer records or payments.</span><button id="reset-demo">Reset demo</button></div>' : ''}<main id="main"><div class="page-heading"><div><span class="eyebrow">${view === 'dashboard' ? 'YOUR BUSINESS, AT A GLANCE' : 'JKM OPERATIONS'}</span><h1>${view === 'dashboard' ? 'Workspace overview' : esc(info?.title || label(view))}</h1><p>${esc(info?.description || { dashboard: 'A clearer view of your requests, orders and next steps.', reports: 'Operational totals, kept separate for each currency.', settings: 'Connection, access and workspace information.' }[view])}</p></div><div class="page-actions">${info && view !== 'website_requests' && canWrite(ws.role, view) ? button('New ' + info.singular, 'new') : ''}${info ? button('Export CSV', 'export', 'secondary', 'download') : ''}${button('Refresh data', 'refresh', 'secondary', 'clock')}</div></div><section id="page-content">${view === 'dashboard' ? dashboard() : view === 'reports' ? reports() : view === 'settings' ? settings() : listView(view)}</section><footer class="app-footer"><span>JKM Global Traders · Staff workspace</span><span>${esc(label(ws.role))} access ${ws.demo ? '· Demo only' : ''}</span></footer></main></div></div>`;
  bindShell();
  bindContent();
}
function bindShell() {
  document.querySelector('#nav-close').onclick = () => {
    document.querySelector('#sidebar').classList.remove('open');
    document.querySelector('#nav-toggle').setAttribute('aria-expanded', 'false');
    document.querySelector('#nav-toggle').focus();
  };
  document.querySelector('#nav-toggle').onclick = (event) => {
    const open = document.querySelector('#sidebar').classList.toggle('open');
    event.currentTarget.setAttribute('aria-expanded', String(open));
  };
  document.querySelector('#logout').onclick = async () => {
    try {
      await ws.signOut();
      dialog.close();
      auth();
    } catch (error) {
      notify(error.message, true);
    }
  };
  document.querySelector('#reset-demo')?.addEventListener('click', () => {
    if (confirm('Reset all sample records in this browser?')) {
      try {
        ws.resetDemo();
        render();
        notify('Demo reset.');
      } catch (error) {
        notify(error.message, true);
      }
    }
  });
  document.querySelector('[data-action=new]')?.addEventListener('click', () => openForm(view));
  document.querySelector('[data-action=export]')?.addEventListener('click', exportCSV);
  document.querySelector('[data-action=refresh]')?.addEventListener('click', async (event) => {
    event.currentTarget.disabled = true;
    try {
      await ws.refresh();
      render();
      notify(ws.demo ? 'Demo records are up to date.' : 'Workspace refreshed.');
    } catch (error) {
      notify(error.message, true);
      event.currentTarget.disabled = false;
    }
  });
}
function listRows(entity) {
  return ws.data[entity].filter((row) => {
    const matches =
      Object.values(row)
        .filter((v) => typeof v === 'string')
        .join(' ')
        .toLowerCase()
        .includes(search.toLowerCase()) ||
      modules[entity].columns.some((key) =>
        display(entity, key, row).toLowerCase().includes(search.toLowerCase()),
      );
    const state = row.status || row.verification_status;
    return matches && (filter === 'all' || state === filter);
  });
}
function listView(entity) {
  const states = [
    ...new Set(ws.data[entity].map((r) => r.status || r.verification_status).filter(Boolean)),
  ];
  return `<div class="panel"><div class="table-toolbar"><label class="search-field">${icon('search')}<input id="search-records" type="search" placeholder="Search ${esc(modules[entity].title.toLowerCase())}…" aria-label="Search records" value="${esc(search)}"></label>${states.length ? `<select id="status-filter" aria-label="Filter status"><option value="all">All statuses</option>${states.map((s) => `<option value="${esc(s)}" ${filter === s ? 'selected' : ''}>${esc(label(s))}</option>`).join('')}</select>` : ''}<span id="record-count"></span></div><div id="table-content"></div></div>`;
}
function drawTable() {
  const info = modules[view];
  if (!info) return;
  const rows = listRows(view);
  document.querySelector('#record-count').textContent = `${rows.length} records`;
  document.querySelector('#table-content').innerHTML = rows.length
    ? `<div class="table-wrap"><table><thead><tr>${info.columns.map((c) => `<th>${esc(label(c.replace('_id', '')))}</th>`).join('')}<th><span class="sr-only">Actions</span></th></tr></thead><tbody>${rows.map((row) => `<tr>${info.columns.map((c, i) => `<td>${c === 'status' || c === 'verification_status' ? badge(row[c]) : i === 0 ? `<button class="row-link" data-open="${esc(row.id)}">${esc(display(view, c, row))}</button>` : esc(display(view, c, row))}</td>`).join('')}<td><button class="table-open" data-open="${esc(row.id)}" aria-label="View ${esc(row.reference || row.name)}">${icon('arrow')}</button></td></tr>`).join('')}</tbody></table></div>`
    : empty(
        'No records to show',
        search || filter !== 'all'
          ? 'Try another search or status filter.'
          : 'New records will appear here as your team starts working.',
      );
  document
    .querySelectorAll('[data-open]')
    .forEach((b) => (b.onclick = () => openDetail(view, b.dataset.open)));
}
function empty(title, description) {
  return `<div class="empty">${icon('inbox')}<h3>${title}</h3><p>${description}</p></div>`;
}
function dashboard() {
  const open = ws.data.orders.filter((o) => !['delivered', 'cancelled'].includes(o.status));
  const newRequests = ws.data.website_requests.filter((r) => r.status === 'new');
  const quotes = ws.data.quotations.filter((q) => ['draft', 'sent'].includes(q.status));
  const moving = ws.data.shipments.filter((s) => !['delivered'].includes(s.status));
  return `<div class="stats">${[
    ['New enquiries', newRequests.length, 'Ready for your review', 'inbox', 'website_requests'],
    ['Active orders', open.length, 'From sourcing to delivery', 'box', 'orders'],
    ['Open quotations', quotes.length, 'Drafts and sent offers', 'quote', 'quotations'],
    ['Shipments in progress', moving.length, 'Partner milestones', 'truck', 'shipments'],
  ]
    .map(
      ([name, count, sub, ic, target]) =>
        `<a class="stat-card" href="#${target}"><div><span>${name}</span><span class="stat-icon">${icon(ic)}</span></div><strong>${count}</strong><small>${sub}</small></a>`,
    )
    .join(
      '',
    )}</div><div class="dashboard-grid"><section class="panel"><div class="panel-heading"><div><h2>Orders in motion</h2><p>Where your current assignments stand.</p></div><a class="quiet-link" href="#orders">View all ${icon('arrow')}</a></div>${
    open.length
      ? `<div class="pipeline">${[
          'sourcing',
          'awaiting_approval',
          'purchasing',
          'inspection',
          'ready_to_ship',
          'in_transit',
        ]
          .map((stage) => {
            const count = open.filter((o) => o.status === stage).length;
            return `<div class="pipeline-row"><span>${esc(label(stage))}</span><div><i style="width:${Math.max((count / open.length) * 100, count ? 6 : 0)}%"></i></div><b>${count}</b></div>`;
          })
          .join('')}</div>`
      : empty('A clean slate', 'Your active orders will be summarised here.')
  }<div class="panel-foot"><span>${ws.data.orders.filter((o) => o.status === 'delivered').length} completed orders</span><a href="#reports">Explore reports ↗</a></div></section><section class="quick-panel"><span class="eyebrow">KEEP THINGS MOVING</span><h2>What’s next?</h2><p>Start with a customer requirement. Keep every decision connected.</p><a href="#website_requests">${icon('inbox')}Review website requests ${icon('arrow')}</a><a href="#quotations">${icon('quote')}Prepare a quotation ${icon('arrow')}</a><a href="#payments">${icon('wallet')}Record a verified payment ${icon('arrow')}</a></section></div><div class="dashboard-grid"><section class="panel"><div class="panel-heading"><div><h2>Latest requests</h2><p>Customer requirements from the website.</p></div><a class="quiet-link" href="#website_requests">Open inbox ↗</a></div>${
    ws.data.website_requests.length
      ? ws.data.website_requests
          .slice(0, 4)
          .map(
            (row) =>
              `<button class="activity-row" data-detail="website_requests" data-id="${esc(row.id)}"><span class="activity-icon">${icon('inbox')}</span><span><strong>${esc(row.full_name)}</strong><small>${esc(row.product || row.service)} · ${esc(row.destination)}</small></span>${badge(row.status)}</button>`,
          )
          .join('')
      : empty(
          'No incoming requests',
          'Website enquiries appear here after the shared Supabase connection is configured.',
        )
  }</section><section class="panel"><div class="panel-heading"><div><h2>Upcoming targets</h2><p>Order deadlines recorded by your staff.</p></div></div>${
    open
      .filter((o) => o.due_date)
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
      .slice(0, 4)
      .map(
        (row) =>
          `<button class="activity-row" data-detail="orders" data-id="${esc(row.id)}"><span class="activity-icon">${icon('clock')}</span><span><strong>${esc(row.title)}</strong><small>${esc(row.reference)} · ${esc(related('customers', row.customer_id))}</small></span><time>${esc(row.due_date)}</time></button>`,
      )
      .join('') || empty('No dates set', 'Add target dates to your active orders.')
  }</section></div>`;
}
function reports() {
  return `<div class="info-callout">Amounts are grouped by transaction currency. Estimated margin is agreed order value minus estimated cost; it is not realised accounting profit.</div><div class="report-grid">${[
    'TZS',
    'USD',
    'AED',
  ]
    .map((currency) => {
      const orders = ws.data.orders.filter(
        (o) => o.currency === currency && o.status !== 'cancelled',
      );
      let value = 0n,
        paid = 0n,
        cost = 0n;
      for (const order of orders) {
        value += minor(order.agreed_amount);
        cost += minor(order.estimated_cost);
        paid += minor(orderBalance(order, ws.data.payments).paid);
      }
      return `<section class="panel currency-panel"><span class="currency-label">${currency}</span><h2>${money(Number(value) / 100, currency)}</h2><p>Agreed value · ${orders.length} non-cancelled orders</p><dl><div><dt>Payments recorded</dt><dd>${money(Number(paid) / 100, currency)}</dd></div><div><dt>Outstanding balance</dt><dd>${money(Number(value - paid) / 100, currency)}</dd></div><div><dt>Estimated costs</dt><dd>${money(Number(cost) / 100, currency)}</dd></div><div><dt>Estimated margin</dt><dd>${money(Number(value - cost) / 100, currency)}</dd></div></dl></section>`;
    })
    .join(
      '',
    )}</div><section class="panel"><div class="panel-heading"><div><h2>Service mix</h2><p>Non-cancelled assignments grouped by service.</p></div></div><div class="service-breakdown">${['sourcing', 'import-export', 'verification', 'logistics', 'consulting', 'private-label', 'general'].map((service) => `<div><span>${esc(label(service))}</span><strong>${ws.data.orders.filter((o) => o.service === service && o.status !== 'cancelled').length}</strong></div>`).join('')}</div></section>`;
}
function settings() {
  return `<div class="settings-grid"><section class="panel settings-panel"><h2>Connection</h2><dl><div><dt>Workspace mode</dt><dd>${ws.demo ? 'Demo · browser-only sample records' : 'Live · Supabase'}</dd></div><div><dt>Live backend</dt><dd>${configured ? 'Configured in deployment' : 'Not configured'}</dd></div><div><dt>Website</dt><dd>JKM Global Traders</dd></div><div><dt>Signed-in account</dt><dd>${esc(ws.user.email)}</dd></div><div><dt>Role</dt><dd>${esc(label(ws.role))}</dd></div></dl><p>Live website enquiries use the same Supabase project and website_requests table. Demo mode does not connect to the live database.</p></section><section class="panel settings-panel"><h2>Staff permissions</h2><div class="role-description"><b>Admin</b><p>Manage operations and record payments.</p><b>Operations</b><p>Manage requests, customers, suppliers, quotations, orders and shipments. Read payment records.</p><b>Finance</b><p>Read operations and record verified payments. Payment records are append-only in this version.</p></div>${ws.demo ? '<label>Preview a staff role<select id="demo-role"><option value="admin">Admin</option><option value="operations">Operations</option><option value="finance">Finance</option></select></label>' : '<p>Staff accounts and role changes are provisioned by the administrator in Supabase, never through public signup.</p>'}</section></div>`;
}
function bindContent() {
  if (modules[view]) {
    drawTable();
    document.querySelector('#search-records').oninput = (event) => {
      search = event.target.value;
      drawTable();
    };
    document.querySelector('#status-filter')?.addEventListener('change', (event) => {
      filter = event.target.value;
      drawTable();
    });
  }
  document
    .querySelectorAll('[data-detail]')
    .forEach((b) => (b.onclick = () => openDetail(b.dataset.detail, b.dataset.id)));
  const role = document.querySelector('#demo-role');
  if (role) {
    role.value = ws.role;
    role.onchange = () => {
      ws.role = role.value;
      render();
      notify('Previewing ' + label(ws.role) + ' permissions.');
    };
  }
}
function showDialog(html) {
  dialog.innerHTML = html;
  dialog.showModal();
  dialog.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => dialog.close()));
}
const dialogHead = (eyebrow, title) =>
  `<div class="dialog-head"><div><span class="eyebrow">${esc(eyebrow)}</span><h2 id="dialog-title">${esc(title)}</h2></div><button class="icon-button" data-close aria-label="Close dialog">${icon('close')}</button></div>`;
function openDetail(entity, id) {
  const row = ws.data[entity].find((r) => r.id === id);
  if (!row) return;
  const info = modules[entity];
  const paid = entity === 'orders' ? orderBalance(row, ws.data.payments) : null;
  showDialog(
    `${dialogHead(info.title, row.reference || row.name)}<div class="detail-meta">${row.status || row.verification_status ? badge(row.status || row.verification_status) : ''}<span>Updated ${new Date(row.updated_at).toLocaleString()}</span></div><dl class="detail-grid">${Object.entries(
      row,
    )
      .filter(
        ([key]) =>
          ![
            'id',
            'created_at',
            'updated_at',
            'created_by',
            'attachments',
            'items',
            'notes',
            'message',
            'reference',
          ].includes(key),
      )
      .map(
        ([key, value]) =>
          `<div><dt>${esc(label(key.replace('_id', '')))}</dt><dd>${esc(display(entity, key, row))}</dd></div>`,
      )
      .join(
        '',
      )}${paid ? `<div><dt>Paid</dt><dd>${money(paid.paid, row.currency)}</dd></div><div><dt>Balance due</dt><dd>${money(paid.balance, row.currency)}</dd></div>` : ''}</dl>${row.items ? `<h3>Quotation items</h3>${itemTable(row)}` : ''}${row.message || row.notes ? `<div class="detail-note"><h3>${entity === 'website_requests' ? 'Customer requirements' : 'Notes & terms'}</h3><p>${esc(row.message || row.notes)}</p></div>` : ''}${row.attachments?.length ? `<h3>Reference files</h3><div class="file-list">${row.attachments.map((file, i) => `<button class="button secondary" data-file="${i}">${icon('download')}${esc(file.name)}</button>`).join('')}</div>` : ''}<div class="dialog-actions">${canWrite(ws.role, entity) && entity !== 'payments' ? button(entity === 'website_requests' ? 'Update status' : 'Edit ' + info.singular, 'edit', 'secondary') : ''}${['quotations', 'payments'].includes(entity) ? button('Print ' + (entity === 'payments' ? 'receipt' : 'quotation'), 'print', 'secondary', 'quote') : ''}${entity === 'website_requests' && canWrite(ws.role, 'customers') ? button('Add as customer', 'customer') : ''}<button class="button secondary" data-close>Close</button></div><p class="dialog-status" role="status"></p>`,
  );
  dialog.querySelector('[data-action=edit]')?.addEventListener('click', () => {
    dialog.close();
    openForm(entity, row);
  });
  dialog.querySelector('[data-action=customer]')?.addEventListener('click', () => {
    dialog.close();
    openForm('customers', {
      name: row.full_name,
      company: row.company,
      email: row.email,
      phone: row.phone,
      country: row.destination,
      notes: 'From website request ' + row.reference,
    });
  });
  dialog.querySelector('[data-action=print]')?.addEventListener('click', () => {
    dialog.close();
    printDocument(entity, row);
  });
  dialog.querySelectorAll('[data-file]').forEach(
    (b) =>
      (b.onclick = async () => {
        b.disabled = true;
        try {
          const url = await ws.attachment(row.attachments[Number(b.dataset.file)].path);
          const a = document.createElement('a');
          a.className = 'button secondary';
          a.href = url;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.textContent = 'Open ' + row.attachments[Number(b.dataset.file)].name + ' ↗';
          b.replaceWith(a);
        } catch (error) {
          dialog.querySelector('.dialog-status').textContent = error.message;
          b.disabled = false;
        }
      }),
  );
}
function fieldHTML(field, row) {
  const value = row[field.name] ?? (['money'].includes(field.type) ? '0.00' : '');
  const required = field.required ? 'required' : '';
  let control;
  if (field.type === 'select' || field.type === 'relation') {
    let options =
      field.type === 'select'
        ? field.options.map((v) => [v, label(v)])
        : ws.data[field.options]
            .filter((r) => field.name !== 'quotation_id' || r.status === 'accepted')
            .map((r) => [r.id, (r.name || r.reference) + (r.title ? ' · ' + r.title : '')]);
    control = `<select name="${field.name}" ${required}>${!field.required || field.type === 'relation' ? '<option value="">Select…</option>' : ''}${options.map(([v, t]) => `<option value="${esc(v)}" ${String(value) === String(v) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  } else if (field.type === 'textarea')
    control = `<textarea name="${field.name}" rows="3" maxlength="4000">${esc(value)}</textarea>`;
  else
    control = `<input name="${field.name}" type="${field.type === 'money' ? 'number' : field.type}" ${field.type === 'money' ? 'min="0" max="999999999999.99" step="0.01"' : ''} value="${esc(value)}" maxlength="240" ${required}>`;
  return `<label class="${field.type === 'textarea' ? 'full' : ''}">${field.label}${field.required ? ' *' : ''}${control}</label>`;
}
function lineHTML(item = { description: '', quantity: 1, unit_price: '0.00' }) {
  return `<div class="item-line"><label><span class="sr-only">Item description</span><input data-line="description" placeholder="Item description" value="${esc(item.description)}" required maxlength="500"></label><label><span class="sr-only">Quantity</span><input data-line="quantity" aria-label="Quantity" type="number" min="1" max="1000000" step="1" value="${item.quantity}" required></label><label><span class="sr-only">Unit price</span><input data-line="unit_price" aria-label="Unit price" type="number" min="0" step="0.01" max="999999999999.99" value="${esc(item.unit_price)}" required></label><button type="button" class="icon-button remove-line" aria-label="Remove item">${icon('close')}</button></div>`;
}
function openForm(entity, record = {}) {
  if (!canWrite(ws.role, entity)) {
    notify('Your role cannot edit these records.', true);
    return;
  }
  if (entity === 'payments' && record.id) {
    notify('Payment records are append-only.', true);
    return;
  }
  const info = modules[entity];
  showDialog(
    `${dialogHead(info.title, (record.id ? 'Edit ' : 'New ') + info.singular)}<form id="record-form"><div class="form-grid">${info.fields.map((field) => fieldHTML(field, record)).join('')}</div>${entity === 'quotations' ? `<fieldset class="quote-items"><legend>Quotation items</legend><div class="line-head"><span>Description</span><span>Qty</span><span>Unit price</span></div><div id="quote-lines">${(record.items || [undefined]).map(lineHTML).join('')}</div><button type="button" class="button secondary" id="add-line">${icon('plus')}Add item</button><output id="quote-total"></output></fieldset>` : ''}${entity === 'payments' ? '<div class="info-callout" id="payment-balance">Record only verified funds received. This records a payment; it does not transfer money.</div>' : ''}${entity === 'quotations' ? '<p class="small-note">Accepted status records a customer decision entered by staff; this does not send or obtain online approval.</p>' : ''}<div class="dialog-actions"><button class="button secondary" type="button" data-close>Cancel</button><button class="button primary" type="submit">${icon('check')}Save ${info.singular}</button></div><p class="dialog-status" role="status" aria-live="polite"></p></form>`,
  );
  const form = dialog.querySelector('form');
  const getItems = () =>
    [...dialog.querySelectorAll('.item-line')].map((line) =>
      Object.fromEntries(
        [...line.querySelectorAll('[data-line]')].map((input) => [
          input.dataset.line,
          input.dataset.line === 'quantity' ? Number(input.value) : input.value,
        ]),
      ),
    );
  function bindLines() {
    dialog.querySelectorAll('.remove-line').forEach(
      (b) =>
        (b.onclick = () => {
          if (dialog.querySelectorAll('.item-line').length <= 1) return;
          b.closest('.item-line').remove();
          calculate();
        }),
    );
  }
  function calculate() {
    try {
      dialog.querySelector('#quote-total').textContent =
        'Total: ' +
        money(
          quoteTotal(
            getItems(),
            form.elements.service_fee.value,
            form.elements.shipping_cost.value,
          ),
          form.elements.currency.value,
        );
    } catch {
      dialog.querySelector('#quote-total').textContent =
        'Complete all item details to calculate the total.';
    }
  }
  if (entity === 'quotations') {
    bindLines();
    calculate();
    dialog.querySelector('#add-line').onclick = () => {
      dialog.querySelector('#quote-lines').insertAdjacentHTML('beforeend', lineHTML());
      bindLines();
      calculate();
    };
    form.addEventListener('input', calculate);
  }
  if (entity === 'payments') {
    const chooseOrder = () => {
      const order = ws.data.orders.find((o) => o.id === form.elements.order_id.value);
      if (!order) return;
      form.elements.currency.value = order.currency;
      dialog.querySelector('#payment-balance').textContent =
        'Outstanding: ' +
        money(orderBalance(order, ws.data.payments).balance, order.currency) +
        '. Record verified funds only; no money is transferred.';
    };
    form.elements.order_id.onchange = chooseOrder;
    chooseOrder();
  }
  if (entity === 'orders') {
    form.elements.quotation_id.onchange = () => {
      const q = ws.data.quotations.find((q) => q.id === form.elements.quotation_id.value);
      if (!q) return;
      form.elements.customer_id.value = q.customer_id;
      form.elements.currency.value = q.currency;
      form.elements.agreed_amount.value = q.total;
      form.elements.service.value = q.service;
    };
  }
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const b = form.querySelector('button[type=submit]');
    b.disabled = true;
    const status = form.querySelector('.dialog-status');
    status.textContent = 'Saving…';
    try {
      const payload = Object.fromEntries(
        info.fields.map((f) => [f.name, form.elements[f.name].value.trim()]),
      );
      for (const f of info.fields) {
        if (f.type === 'relation' || f.type === 'date') payload[f.name] ||= null;
        if (f.type === 'money') minor(payload[f.name]);
      }
      if (entity === 'quotations') {
        payload.items = getItems();
        quoteTotal(payload.items, payload.service_fee, payload.shipping_cost);
      }
      if (entity === 'payments') {
        const order = ws.data.orders.find((o) => o.id === payload.order_id);
        if (
          !order ||
          payload.currency !== order.currency ||
          minor(payload.amount) <= 0n ||
          minor(payload.amount) > minor(orderBalance(order, ws.data.payments).balance)
        )
          throw new Error(
            'Payment must match the order currency and not exceed the outstanding balance.',
          );
      }
      await ws.save(entity, payload, record.id);
      dialog.close();
      render();
      notify(
        `${info.singular[0].toUpperCase() + info.singular.slice(1)} saved${ws.demo ? ' in demo mode' : ''}.`,
      );
    } catch (error) {
      status.textContent = error.message;
    } finally {
      b.disabled = false;
    }
  };
}
function itemTable(q) {
  return `<div class="table-wrap"><table><thead><tr><th>Description</th><th>Qty</th><th>Unit price</th></tr></thead><tbody>${q.items.map((item) => `<tr><td>${esc(item.description)}</td><td>${esc(item.quantity)}</td><td>${money(item.unit_price, q.currency)}</td></tr>`).join('')}</tbody></table></div><div class="quote-summary"><span>Service fee: ${money(q.service_fee, q.currency)}</span><span>Shipping / charges: ${money(q.shipping_cost, q.currency)}</span><strong>Total: ${money(q.total, q.currency)}</strong></div>`;
}
function printDocument(entity, row) {
  const order = entity === 'payments' ? ws.data.orders.find((o) => o.id === row.order_id) : null;
  const customer = ws.data.customers.find((c) => c.id === (row.customer_id || order?.customer_id));
  showDialog(
    `<div class="document">${ws.demo ? '<div class="document-demo">DEMO — NOT A REAL COMMERCIAL DOCUMENT</div>' : ''}<div class="document-head"><img src="/jkm-logo.png" alt="JKM Global Traders"><div><h2 id="dialog-title">${entity === 'payments' ? 'Payment receipt' : 'Quotation'}</h2><strong>${esc(row.reference)}</strong><p>${new Date(row.created_at).toLocaleDateString()}</p></div></div><p><b>Customer:</b> ${esc(customer?.name || '—')}<br>${esc(customer?.company || '')}<br>${esc(customer?.email || '')}</p>${entity === 'quotations' ? `<p>Service: ${esc(label(row.service))}<br>Valid until: ${esc(row.valid_until)} · Status: ${esc(label(row.status))}</p>${itemTable(row)}` : `<dl class="detail-grid"><div><dt>Order</dt><dd>${esc(order?.reference)}</dd></div><div><dt>Amount received</dt><dd>${money(row.amount, row.currency)}</dd></div><div><dt>Payment method</dt><dd>${esc(label(row.method))}</dd></div><div><dt>Transaction reference</dt><dd>${esc(row.external_reference)}</dd></div><div><dt>Payment date</dt><dd>${esc(row.payment_date)}</dd></div></dl>`}<p class="document-notes">${esc(row.notes || '')}</p><p class="small-note">JKM Global Traders · +255 766 109 131 · WhatsApp +255 699 830 601</p></div><div class="dialog-actions no-print"><button class="button secondary" data-close>Close</button><button class="button primary" id="print-now">${icon('quote')}Print / Save PDF</button></div>`,
  );
  dialog.querySelector('#print-now').onclick = () => window.print();
}
function exportCSV() {
  const rows = listRows(view);
  const keys = modules[view].columns;
  const content =
    '\uFEFF' +
    [
      keys.map(csvCell).join(','),
      ...rows.map((row) => keys.map((key) => csvCell(display(view, key, row))).join(',')),
    ].join('\r\n');
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `jkm-${view}${ws.demo ? '-demo' : ''}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
window.addEventListener('hashchange', route);
if (client)
  client.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT' && !ws.demo) {
      ws.user = null;
      ws.role = null;
      ws.data = {
        website_requests: [],
        customers: [],
        suppliers: [],
        quotations: [],
        orders: [],
        shipments: [],
        payments: [],
      };
      dialog.close();
      auth();
    }
  });
auth();
ws.restore()
  .then((restored) => {
    if (restored) route();
  })
  .catch((error) => auth(error.message));

// Keep the staff inbox current without disrupting a form the user is editing.
let checkingInbox = false;
async function checkInbox() {
  if (checkingInbox || document.hidden || !ws.user || ws.demo || dialog.open) return;
  checkingInbox = true;
  try {
    const added = await ws.refreshInbox();
    if (!ws.user) return;
    if (!dialog.open && ['dashboard', 'website_requests'].includes(view)) render();
    if (added) notify(`${added} new website request${added === 1 ? '' : 's'} received.`);
  } catch (error) {
    if (!ws.user) auth(error.message);
    else notify(error.message, true);
  } finally {
    checkingInbox = false;
  }
}
setInterval(checkInbox, 30000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) checkInbox();
});
