# Shared backend: JKM Global Traders website and staff workspace

JKM Delivery is a separate project and is not part of this implementation.

This repository is the canonical deployment source for the shared database and
`submit-request` function. Both frontends must use the same Supabase project.
No project, staff identity or hosting configuration is created by the code alone.

## 1. Set up GitHub deployment settings

In **Jkmtraders2026/jkm_webapp → Settings → Environments**, create `production`.
Add these environment secrets (never paste their values into issues or chat):

| Secret                  | Purpose                                                      |
| ----------------------- | ------------------------------------------------------------ |
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI deployment access                               |
| `SUPABASE_DB_PASSWORD`  | Password for the selected project's database                 |
| `TURNSTILE_SECRET_KEY`  | Server secret from the website's Cloudflare Turnstile widget |

Add these environment variables:

| Variable               | Value                                                                 |
| ---------------------- | --------------------------------------------------------------------- |
| `SUPABASE_PROJECT_REF` | The actual 20-character project reference                             |
| `JKM_ALLOWED_ORIGINS`  | Comma-separated exact website HTTPS origins, without a trailing slash |

Use only domains you own and actually serve, including `www` only if it is used.
Register those hostnames in the Turnstile widget. No example domain is silently
accepted. Restrict deployment-token permissions to the project and capabilities
needed for linking, migrations, functions and secrets.

## 2. Deploy the backend

After merging, open **Actions → Deploy shared JKM backend → Run workflow** on
`main`. The workflow runs tests, links the selected project, applies versioned
migrations, sets the function environment and deploys `submit-request`.
It does not reset the database or create user accounts.

Before first deployment, take a database backup and inspect the existing schema.
The baseline creates an empty installation or adopts a complete previous JKM
installation; it stops if it sees a partial installation. Adoption is intended
for the exact previous JKM schemas, not arbitrary tables with matching names.

If the old website migration is already tracked in Supabase migration history,
copy that exact historical migration from JKM_WEBSITE into this repository's
migration folder before using `db push`. Do not mark unrelated migrations as
applied or run `db reset` to bypass a history mismatch. Review unknown schema
changes before deployment.

Migration `202610280003` rejects duplicate payment references within a payment
method, ignoring case and surrounding whitespace, including across orders.
If historical duplicates exist, deployment stops without deleting them. Finance
must reconcile the original transaction and records first. This version records
a transaction against one order; split allocations require a separate transaction
and allocation model, not duplicate use of one bank/mobile-money reference.

## 3. Configure website hosting

In the existing website hosting project, retain `npm run build` and output `dist`.
Set these build environment variables, then rebuild/redeploy:

| Variable                       | Value                                                             |
| ------------------------------ | ----------------------------------------------------------------- |
| `JKM_SUPABASE_URL`             | The selected project's HTTPS origin                               |
| `JKM_SUPABASE_PUBLISHABLE_KEY` | Its public publishable key or legacy anon key                     |
| `JKM_TURNSTILE_SITE_KEY`       | Public site key from the same Turnstile widget                    |
| `JKM_REQUIRE_BACKEND`          | `1` for a production build that must reject missing configuration |

The builder writes public settings into `dist/assets/js/config.js` while retaining
social links. It rejects secret/service-role keys. It does not modify the source
config. Local unconfigured previews remain possible without `JKM_REQUIRE_BACKEND`.

## 4. Configure staff app hosting and accounts

Set and redeploy the staff app with:

- `VITE_SUPABASE_URL`: the same HTTPS origin used by the website.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: the same public project key.
- `VITE_WEBSITE_URL`: the actual company website URL.

In Supabase Authentication, create/invite staff accounts, disable public signup
for this staff application, and configure the actual app Site URL/redirects.
Then, as database administrator, insert the staff Auth UUID and role:

```sql
insert into public.staff_members(user_id, role)
values ('ACTUAL_AUTH_USER_UUID'::uuid, 'admin')
on conflict (user_id) do update set role = excluded.role;
```

Other roles are `operations` and `finance`. Public signup never grants staff access.
The staff app polls new/changed website requests every 30 seconds while visible,
and on returning to the tab. Polling pauses during record editing and demo mode.
New requests appear under **Website requests**. Backend RLS controls access.

## 5. Verify the live round trip

1. Send a test website request, including an allowed reference attachment.
2. Confirm the website returns a real reference.
3. Sign in to the live staff app; the same reference should appear within 30 seconds
   when the app is visible and no form is open. Manual Refresh remains available.
4. Open its attachment, update the status and check it again from another staff session.
5. Verify an anonymous/non-staff account cannot read enquiries or attachments.
6. Retry the unchanged form after a simulated uncertain response. Its submission
   key returns the same reference without creating another record. Editing the
   form creates a new key; reloading the page also begins a new submission.
7. Check audit events as admin, expired CAPTCHA and allowed-origin enforcement.

Automated tests use the actual SQL and Edge handler with a local PostgreSQL engine.
CAPTCHA, network storage and Supabase Auth are mocked contracts. Hosted Auth,
Storage, Turnstile and provider behaviour still require these live smoke tests.

## Data and operational boundaries

The function uses the hosted service key only on the server. Anonymous browser
users have no direct table INSERT/SELECT or private-storage access. Files use
short-lived signed URLs for staff. Idempotency returns only an opaque reference.

`audit_events` records inserts and updates and is readable by admins only. It
contains snapshots of business/personal data: apply a retention policy through
the administrator and include it in backup/privacy planning. Automatic deletion,
email notifications, refunds, reversals and full accounting are not included.

References:

- https://supabase.com/docs/guides/deployment/managing-environments
- https://supabase.com/docs/guides/functions/examples/github-actions
