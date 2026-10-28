import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeRequests, inboxCursor } from '../src/inbox.js';
const old = { id: 'old', created_at: '2026-10-01', updated_at: '2026-10-01', status: 'new' };
const newer = { id: 'new', created_at: '2026-10-28', updated_at: '2026-10-28', status: 'new' };
test('polling preserves old requests, updates statuses and does not duplicate boundary rows', () => {
  const current = [old, newer];
  const changes = [newer, { ...old, status: 'reviewing', updated_at: '2026-10-28' }];
  const merged = mergeRequests(current, changes);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, 'new');
  assert.equal(merged[1].status, 'reviewing');
  assert.deepEqual(mergeRequests(merged, changes), merged);
  assert.equal(inboxCursor(merged), '2026-10-28');
});
test('stale server responses cannot overwrite a newer status', () => {
  assert.equal(
    mergeRequests([{ ...old, updated_at: '2026-10-29', status: 'closed' }], [old])[0].status,
    'closed',
  );
});
