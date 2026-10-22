import test from 'node:test';
import assert from 'node:assert/strict';
import {
  minor,
  decimal,
  quoteTotal,
  orderBalance,
  canWrite,
  csvCell,
  escapeHTML,
} from '../src/domain.js';
test('money uses exact minor units, including negative display', () => {
  assert.equal(minor('0.10') + minor('0.20'), 30n);
  assert.equal(decimal(30n), '0.30');
  assert.equal(decimal(-125n), '-1.25');
  for (const value of ['-1', '1.001', 'NaN', '1e5', '9999999999999'])
    assert.throws(() => minor(value));
});
test('quotation combines integer quantities and fees without floating point loss', () => {
  assert.equal(
    quoteTotal([{ description: 'Boxes', quantity: 3, unit_price: '0.10' }], '0.20', '1.25'),
    '1.75',
  );
  for (const quantity of [0, -1, 1.5, 1000001])
    assert.throws(() => quoteTotal([{ description: 'Boxes', quantity, unit_price: '1' }]));
  assert.throws(() => quoteTotal([]));
  assert.throws(() => quoteTotal([{ description: '', quantity: 1, unit_price: '1' }]));
  assert.throws(() =>
    quoteTotal([{ description: 'Overflow', quantity: 2, unit_price: '999999999999.99' }]),
  );
});
test('balances include only the correct order and reject mixed currencies', () => {
  const order = { id: 'a', currency: 'USD', agreed_amount: '100.00' };
  assert.deepEqual(
    orderBalance(order, [
      { order_id: 'a', currency: 'USD', amount: '20.25' },
      { order_id: 'other', currency: 'TZS', amount: '500' },
    ]),
    { paid: '20.25', balance: '79.75' },
  );
  assert.throws(() => orderBalance(order, [{ order_id: 'a', currency: 'TZS', amount: '1' }]));
});
test('operations and finance permissions remain separate', () => {
  assert.equal(canWrite('operations', 'orders'), true);
  assert.equal(canWrite('operations', 'payments'), false);
  assert.equal(canWrite('finance', 'payments'), true);
  assert.equal(canWrite('finance', 'orders'), false);
  assert.equal(canWrite('visitor', 'customers'), false);
  assert.equal(canWrite('admin', 'payments'), true);
});
test('CSV neutralises formulas and escapes quoted customer data', () => {
  assert.equal(csvCell('=SUM(A1)'), `"'=SUM(A1)"`);
  assert.equal(csvCell(' \t+1'), `"' \t+1"`);
  assert.equal(csvCell('Buyer "A"'), '"Buyer ""A"""');
  assert.equal(escapeHTML('<img onerror="x">'), '&lt;img onerror=&quot;x&quot;&gt;');
});
