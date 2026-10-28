# JKM Workspace

## Shared backend deployment

Use [BACKEND_SETUP.md](BACKEND_SETUP.md) for the current versioned backend,
hosting variables, staff setup and live verification. The initial SQL setup
below is retained for historical context; do not reapply it to an existing project.

Staff management webapp for **JKM Global Traders**, using the approved navy and #FF7E00 identity. Built with HTML5, CSS, JavaScript, Vite and Supabase. Staff-first release; a client portal can follow.

## Included

- Dashboard: new enquiries, active orders, quotations, shipments and target dates.
- Website requests: read enquiries, update status, open private reference attachments, prefill customer details.
- Customers and suppliers: contacts, countries, notes and staff-entered verification status.
- Quotations: itemised quantities and prices, fees, shipping charges, status and printable quotation / browser Save as PDF.
- Orders: customer/supplier links, accepted quotation, website request, agreed price, estimated cost and fulfilment stages.
- Shipments: manually recorded partner, carrier reference, route, method and milestones.
- Payments: verified funds received, remaining balance, transaction references and printable receipts. Recording does not transfer money.
- Reports: totals by TZS, USD and AED; no exchange-rate conversion. Estimated margin is not accounting profit.
- Search, status filters and CSV exports. Responsive navigation and accessible native form/dialog controls.

## Run locally

Requires Node 22.12 or later for the frontend; run backend tests on Node 24 or later.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Without Supabase settings, select **Open demo workspace**. Demo records are examples, saved only in this browser, with a prominent demo banner and document watermark. Demo can be reset. Failed live requests never fall back to demo data.

```sh
npm test
npm run format:check
npm run build
```

Tests cover exact monetary calculations, roles, CSV injection escaping and the actual SQL migrations in local PostgreSQL through PGlite. Auth and Storage schemas are minimal local contracts in that test; deployed Supabase APIs and concurrent sessions still need integration checks.

## Connect the live website and app

Use the **same Supabase project as the JKM website**. No Supabase project or staff account is provisioned by this repository.

1. In Supabase SQL Editor, check whether `public.website_requests` and `public.staff_members` already exist from the website migration. If present, **skip `supabase/01-website-prerequisite.sql`**. Otherwise, run it once. This is a readable copy of the website schema, not a new parallel inbox.
2. Run `supabase/02-workspace.sql` once. It adds staff roles and the app tables, policies, indexes and integrity triggers inside a transaction. Existing staff receive `operations` by default. If an installation already has app tables/role changes, review the schema before applying; these files are initial migrations, not repeatable reset scripts.
3. Create each staff account in Supabase Authentication. Disable public signup for the staff app. The administrator should arrange credentials through their normal private process; never commit or send passwords through chat.
4. Copy the staff account UUID, then run this in the SQL Editor as project administrator, replacing the placeholder UUID:

```sql
insert into public.staff_members (user_id, role)
values ('REPLACE_WITH_AUTH_USER_UUID'::uuid, 'admin')
on conflict (user_id) do update set role = excluded.role;
```

Use `operations` or `finance` for other staff. Only project administration can change membership/roles; the browser has no role-management grants.

5. Set the following build-time variables in `.env.local` or the deployment environment:

```text
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_OR_ANON_KEY
VITE_WEBSITE_URL=https://jkmglobaltraders.co.tz
```

Only a public publishable/anon key belongs in the frontend. **Never use a service-role key.** Row Level Security enforces access. Rebuild after changing Vite variables. For a custom Supabase hostname, update the `connect-src` directive in `public/_headers`.

6. Configure Supabase Auth Site URL / allowed redirects for the final app domain. Website submissions still use the website's existing `submit-request` Edge Function; this app reads `website_requests`, including private `request-files` attachments through 60-second signed URLs. The website's Edge Function configuration, validation and storage bucket remain necessary for new enquiries.

## Staff permissions

| Role                  | Read operations and payments | Manage requests/customers/suppliers/quotes/orders/shipments | Add payments |
| --------------------- | ---------------------------- | ----------------------------------------------------------- | ------------ |
| Admin                 | Yes                          | Yes                                                         | Yes          |
| Operations            | Yes                          | Yes                                                         | No           |
| Finance               | Yes                          | No                                                          | Yes          |
| Non-staff / anonymous | No                           | No                                                          | No           |

Payment records are append-only; no browser UPDATE/DELETE grant. The database checks order currency, balance and duplicate transaction references. A locked order row serialises payment inserts against changes to the order. Quotations linked to orders are immutable; revise with a new quotation. Orders with payments cannot change customer/currency, be reduced below paid value or be cancelled. The demo mirrors these checks but is not an access-control boundary.

The payment trigger is a fixed-search-path SECURITY DEFINER function with an explicit finance/admin membership check, used only by its trigger. Direct execution is revoked. Other business checks use invoker privileges. The versioned backend also records insert/update snapshots in admin-only `audit_events`. Apply retention and backup policies to those snapshots.

## Deploy on Cloudflare Pages

Create a **separate Pages project** for this repository; keep the company website in its current project.

| Setting                | Value                     |
| ---------------------- | ------------------------- |
| Repository             | Jkmtraders2026/jkm_webapp |
| Production branch      | main                      |
| Build command          | npm run build             |
| Build output directory | dist                      |
| Node version           | 22                        |

Set the build variables above, deploy, and then attach a domain such as `app.jkmglobaltraders.co.tz` if desired. Hash routes (`/#orders`, `/#payments`, etc.) allow direct section links without server rewrite rules. The Cloudflare headers file is included in the build. Demo works on the deployed frontend before Supabase is connected; live login does not.

## Verify before using live records

- Sign in with admin, operations and finance test accounts, plus an account absent from `staff_members`; verify both UI and direct API access follow the matrix.
- Submit a test enquiry through the website and check its request, attachment and status update in the app.
- Create a customer, quotation, accepted order, shipment and partial/final payments; verify printed totals, duplicate rejection, currency checks and two simultaneous payments competing for the last balance.
- Check deployed security headers, sign-out, session expiry and staff removal. Back up the project and configure retention through the Supabase administrator.

This release is a working staff frontend with database migrations and a demo. It does **not** include client accounts, online payments, automatic carrier updates, email/WhatsApp sending, tax invoices, refunds/reversals or full accounting. A payment correction/reversal workflow is still needed before adopting it as a complete finance ledger; the versioned backend now records insert/update history. Lists currently load up to 10,000 rows per module; larger volumes need server-side pagination. Print documents use the browser's print / Save as PDF dialog.
