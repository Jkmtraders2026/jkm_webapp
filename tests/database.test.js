import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
// Local PostgreSQL engine with minimal Supabase auth/storage contracts.
// This does not exercise deployed Supabase Auth or Storage APIs.
test('database enforces staff roles, quotation totals and payment integrity', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
 CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE SCHEMA auth; CREATE SCHEMA storage;
 CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
 $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 GRANT USAGE ON SCHEMA auth,public TO authenticated,anon;
 GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;
 CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 CREATE TABLE storage.objects(id uuid,bucket_id text);`);
    for (const file of ['01-website-prerequisite.sql', '02-workspace.sql'])
      await db.exec(await readFile(new URL('../supabase/' + file, import.meta.url), 'utf8'));
    const admin = '00000000-0000-4000-8000-000000000001',
      ops = '00000000-0000-4000-8000-000000000002',
      finance = '00000000-0000-4000-8000-000000000003',
      outsider = '00000000-0000-4000-8000-000000000004';
    await db.exec(`INSERT INTO auth.users VALUES('${admin}'),('${ops}'),('${finance}'),('${outsider}');
 INSERT INTO staff_members(user_id,role) VALUES('${admin}','admin'),('${ops}','operations'),('${finance}','finance');`);
    const as = async (id) =>
      db.exec(
        `RESET ROLE; SELECT set_config('request.jwt.claim.sub','${id}',false); SET ROLE authenticated;`,
      );
    await as(ops);
    const customer = (
      await db.query(
        "INSERT INTO customers(name,phone,country) VALUES('Test buyer','+255700000000','Tanzania') RETURNING id",
      )
    ).rows[0].id;
    const quote = (
      await db.query(`INSERT INTO quotations(customer_id,service,currency,items,service_fee,shipping_cost,total,valid_until,status)
 VALUES('${customer}','sourcing','USD','[{"description":"Boxes","quantity":3,"unit_price":"0.10"}]',0.2,1.25,999,'2027-01-01','accepted') RETURNING id,total`)
    ).rows[0];
    assert.equal(quote.total, '1.75');
    const order = (
      await db.query(
        `INSERT INTO orders(title,customer_id,quotation_id,service,currency,agreed_amount) VALUES('Test order','${customer}','${quote.id}','sourcing','USD',1.75) RETURNING id`,
      )
    ).rows[0].id;
    await assert.rejects(
      () => db.query(`UPDATE quotations SET service_fee=10 WHERE id='${quote.id}'`),
      /linked to an order/,
    );
    const pay = (amount, reference, currency = 'USD') =>
      db.query(
        `INSERT INTO payments(order_id,amount,currency,method,payment_date,external_reference) VALUES('${order}',${amount},'${currency}','bank','2026-10-22','${reference}')`,
      );
    await assert.rejects(() => pay(1, 'OPS'), /row-level security|Finance access/);
    await as(finance);
    await pay(1, 'DEPOSIT');
    await assert.rejects(() => pay(0.76, 'OVERPAY'), /outstanding balance/);
    await assert.rejects(() => pay(0.5, 'WRONG-CURRENCY', 'TZS'), /same currency/);
    await assert.rejects(() => pay(0.5, 'DEPOSIT'), /unique constraint/);
    await assert.rejects(
      () => db.query(`UPDATE payments SET amount=0.1 WHERE order_id='${order}'`),
      /permission denied/,
    );
    await assert.rejects(
      () => db.query(`DELETE FROM payments WHERE order_id='${order}'`),
      /permission denied/,
    );
    await assert.rejects(
      () => db.query("INSERT INTO customers(name) VALUES('Forbidden')"),
      /row-level security|permission denied/,
    );
    await as(ops);
    await assert.rejects(
      () => db.query(`UPDATE orders SET currency='TZS',quotation_id=null WHERE id='${order}'`),
      /payments cannot change/,
    );
    await assert.rejects(
      () => db.query(`UPDATE orders SET agreed_amount=0.5,quotation_id=null WHERE id='${order}'`),
      /below recorded payments/,
    );
    await assert.rejects(
      () => db.query(`UPDATE orders SET status='cancelled',quotation_id=null WHERE id='${order}'`),
      /payments cannot change/,
    );
    await as(outsider);
    assert.equal((await db.query('SELECT * FROM customers')).rows.length, 0);
    assert.equal((await db.query('SELECT * FROM payments')).rows.length, 0);
    await assert.rejects(
      () => db.query("INSERT INTO customers(name) VALUES('Forbidden')"),
      /row-level security/,
    );
    await assert.rejects(
      () => db.query(`INSERT INTO staff_members(user_id,role) VALUES('${outsider}','admin')`),
      /permission denied/,
    );
    await as(admin);
    await pay(0.75, 'FINAL');
    assert.equal(
      (await db.query(`SELECT sum(amount)::text AS total FROM payments WHERE order_id='${order}'`))
        .rows[0].total,
      '1.75',
    );
    await assert.rejects(
      () =>
        db.query(
          'INSERT INTO orders(title,customer_id,service,currency,agreed_amount) VALUES($1,$2,$3,$4,$5)',
          ['Bad', customer, 'sourcing', 'USD', 'NaN'],
        ),
      /check constraint/,
    );
  } finally {
    await db.close();
  }
});
