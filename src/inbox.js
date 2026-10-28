// Merge changes by id; never drop older requests merely because polling returned a page.
export function mergeRequests(current, incoming) {
  const rows = new Map(current.map((row) => [row.id, row]));
  for (const row of incoming) {
    const old = rows.get(row.id);
    if (!old || row.updated_at >= old.updated_at) rows.set(row.id, row);
  }
  return [...rows.values()].sort(
    (a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id),
  );
}
export function inboxCursor(rows) {
  // Include the boundary timestamp: simultaneous updates must not be skipped.
  return rows.reduce(
    (latest, row) => (row.updated_at > latest ? row.updated_at : latest),
    '1970-01-01T00:00:00.000Z',
  );
}
