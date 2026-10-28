import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { PGlite } from '@electric-sql/pglite';

async function database(existing = false) {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE SCHEMA auth; CREATE SCHEMA storage;
 CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
 $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 GRANT USAGE ON SCHEMA auth,public TO authenticated,anon;
 GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;
 CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 CREATE TABLE storage.objects(id uuid,bucket_id text);`);
  if (existing)
    for (const name of ['01-website-prerequisite.sql', '02-workspace.sql'])
      await db.exec(await readFile(new URL('../supabase/' + name, import.meta.url), 'utf8'));
  if (existing)
    await db.exec(`INSERT INTO website_requests(reference,full_name,email,phone,service,destination,message)
    VALUES('LEGACY-REQUEST','Existing customer','existing@example.com','12345','general','Dar es Salaam','An existing request that must remain intact.')`);
  for (const name of [
    '202610280001_shared_backend.sql',
    '202610280002_inbox_audit.sql',
    '202610280003_unique_payment_transactions.sql',
  ])
    await db.exec(
      await readFile(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8'),
    );
  return db;
}
async function handler(db) {
  let serve;
  let uploads = 0;
  const client = {
    storage: {
      from: () => ({
        upload: async () => {
          uploads++;
          return { error: null };
        },
        remove: async () => ({ error: null }),
      }),
    },
    from: () => ({
      insert: async (row) => {
        await db.exec('RESET ROLE');
        const keys = Object.keys(row);
        try {
          await db.query(
            'INSERT INTO website_requests (' +
              keys.join(',') +
              ') VALUES (' +
              keys.map((_, i) => '$' + (i + 1)).join(',') +
              ')',
            keys.map((k) => (k === 'attachments' ? JSON.stringify(row[k]) : row[k])),
          );
          return { error: null };
        } catch (error) {
          return { error };
        }
      },
      select: () => ({
        eq: (_, id) => ({
          maybeSingle: async () => {
            await db.exec('RESET ROLE');
            const data = (
              await db.query('SELECT reference FROM website_requests WHERE submission_id=$1', [id])
            ).rows[0];
            return { data, error: null };
          },
        }),
      }),
    }),
  };
  let source = await readFile(
    new URL('../supabase/functions/submit-request/index.ts', import.meta.url),
    'utf8',
  );
  source = source.replace(/^import .*;\n/, '').replace('export function', 'function');
  vm.runInNewContext(stripTypeScriptTypes(source), {
    Deno: {
      env: {
        get: (k) =>
          ({
            ALLOWED_ORIGINS: 'https://jkm.example',
            TURNSTILE_SECRET_KEY: 'test-only',
            SUPABASE_URL: 'https://example.supabase.co',
            SUPABASE_SERVICE_ROLE_KEY: 'test-only',
          })[k],
      },
      serve: (fn) => {
        serve = fn;
      },
    },
    createClient: () => client,
    Response,
    Request,
    FormData,
    Blob,
    File,
    URL,
    TextDecoder,
    Uint8Array,
    crypto,
    AbortSignal,
    fetch: async () =>
      new Response(JSON.stringify({ success: true, hostname: 'jkm.example' }), {
        headers: { 'content-type': 'application/json' },
      }),
  });
  return { serve, uploads: () => uploads };
}
function form(id) {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    full_name: 'Test shop',
    email: 'shop@example.com',
    phone: '+255700000000',
    service: 'sourcing',
    destination: 'Dar es Salaam',
    message: 'Please source our requested packaging supplies.',
    consent: 'on',
    captcha_token: 'test-token',
    submission_id: id,
  }))
    f.set(k, v);
  return f;
}
const request = (f) =>
  new Request('https://example.supabase.co/functions/v1/submit-request', {
    method: 'POST',
    headers: { origin: 'https://jkm.example' },
    body: f,
  });

test('website submission reaches the inbox table with staff-only access and idempotent retries', async () => {
  const db = await database();
  try {
    const intake = await handler(db);
    const id = crypto.randomUUID();
    const first = await intake.serve(request(form(id)));
    assert.equal(first.status, 201);
    const reference = (await first.json()).reference;
    const retryForm = form(id);
    retryForm.set('captcha_token', 'already-consumed');
    const second = await intake.serve(request(retryForm));
    assert.equal(second.status, 200);
    assert.equal((await second.json()).reference, reference);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM website_requests')).rows[0].n, 1);
    const admin = '00000000-0000-4000-8000-000000000001',
      ops = '00000000-0000-4000-8000-000000000002',
      outsider = '00000000-0000-4000-8000-000000000003';
    await db.exec(
      `INSERT INTO auth.users VALUES('${admin}'),('${ops}'),('${outsider}'); INSERT INTO staff_members(user_id,role) VALUES('${admin}','admin'),('${ops}','operations');`,
    );
    async function as(id) {
      await db.exec(
        `RESET ROLE;SELECT set_config('request.jwt.claim.sub','${id}',false);SET ROLE authenticated;`,
      );
    }
    await as(ops);
    assert.equal(
      (await db.query('SELECT reference FROM website_requests')).rows[0].reference,
      reference,
    );
    await db.exec("UPDATE website_requests SET status='reviewing'");
    assert.equal((await db.query('SELECT * FROM audit_events')).rows.length, 0);
    await assert.rejects(
      () =>
        db.exec(
          "INSERT INTO website_requests(reference,full_name,email,phone,service,destination,message) VALUES('bad','bad','x@y.z','12345','sourcing','Dar','A long enough fake request')",
        ),
      /permission denied|row-level security/,
    );
    await as(outsider);
    assert.equal((await db.query('SELECT * FROM website_requests')).rows.length, 0);
    await as(admin);
    const events = (
      await db.query('SELECT operation,actor_id FROM audit_events ORDER BY occurred_at')
    ).rows;
    assert.equal(events.length, 2);
    assert.equal(events[0].operation, 'INSERT');
    assert.equal(events[1].actor_id, ops);
    await db.exec('RESET ROLE; SET ROLE anon');
    await assert.rejects(() => db.query('SELECT * FROM website_requests'), /permission denied/);
  } finally {
    await db.close();
  }
});
test('versioned backend adopts a complete existing workspace without replacing it', async () => {
  const db = await database(true);
  try {
    const columns = (
      await db.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name='website_requests'",
      )
    ).rows;
    assert.ok(columns.some((c) => c.column_name === 'submission_id'));
    assert.equal(
      (await db.query('SELECT reference FROM website_requests')).rows[0].reference,
      'LEGACY-REQUEST',
    );
    assert.equal(
      (await db.query("SELECT count(*)::int AS n FROM pg_policies WHERE tablename='audit_events'"))
        .rows[0].n,
      1,
    );
  } finally {
    await db.close();
  }
});
test('invalid retry identifiers never create requests', async () => {
  const db = await database();
  try {
    const intake = await handler(db);
    const response = await intake.serve(request(form('not-a-uuid')));
    assert.equal(response.status, 400);
    assert.equal(intake.uploads(), 0);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM website_requests')).rows[0].n, 0);
  } finally {
    await db.close();
  }
});

test('a transaction cannot be credited to two orders using case or whitespace variations', async () => {
  const db = await database();
  try {
    const uid = '00000000-0000-4000-8000-000000000001';
    await db.exec(
      `INSERT INTO auth.users VALUES('${uid}');INSERT INTO staff_members(user_id,role) VALUES('${uid}','admin');SELECT set_config('request.jwt.claim.sub','${uid}',false);SET ROLE authenticated;`,
    );
    const customer = (await db.query("INSERT INTO customers(name) VALUES('Test') RETURNING id"))
      .rows[0].id;
    const order = async (title) =>
      (
        await db.query(
          "INSERT INTO orders(title,customer_id,service,currency,agreed_amount) VALUES($1,$2,'general','TZS',10000) RETURNING id",
          [title, customer],
        )
      ).rows[0].id;
    const first = await order('First'),
      second = await order('Second');
    const pay = (id, ref) =>
      db.query(
        "INSERT INTO payments(order_id,amount,currency,method,payment_date,external_reference) VALUES($1,5000,'TZS','mobile_money','2026-10-28',$2)",
        [id, ref],
      );
    await pay(first, 'REAL-TRANSFER');
    await assert.rejects(() => pay(second, ' real-transfer '), /unique constraint/);
    assert.equal(
      (await db.query('SELECT sum(amount)::text AS total FROM payments')).rows[0].total,
      '5000.00',
    );
  } finally {
    await db.close();
  }
});

test('simultaneous retries produce one stored request and the same reference', async () => {
  const db = await database();
  try {
    const intake = await handler(db),
      id = crypto.randomUUID();
    const responses = await Promise.all([
      intake.serve(request(form(id))),
      intake.serve(request(form(id))),
    ]);
    const values = await Promise.all(responses.map((r) => r.json()));
    assert.ok(responses.every((r) => [200, 201].includes(r.status)));
    assert.equal(values[0].reference, values[1].reference);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM website_requests')).rows[0].n, 1);
  } finally {
    await db.close();
  }
});
