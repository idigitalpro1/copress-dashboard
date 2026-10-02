import { readFileSync } from 'node:fs';
export const snapshot = JSON.parse(readFileSync(new URL('../data/codex/development-board.json', import.meta.url), 'utf8'));
const columns = new Set(['backlog', 'active', 'review', 'done']);
export function normalizeCards(rows) {
  // Only publish reviewed task IDs, not arbitrary or private cards from the shared backend.
  // Match on the persisted backend id first; if an Admin card was re-created under a new id,
  // fall back to its reviewed [KEY] title prefix. Unknown keys stay private.
  const byId = new Map(snapshot.cards.map(card => [card.backendId, card]));
  const byKey = new Map(snapshot.cards.map(card => [card.key, card]));
  const keyOf = row => (/^\[([A-Z]+-\d+)\]/.exec(String(row.title || '')) || [])[1];
  const seen = new Set();
  const matched = [];
  for (const row of rows) { const original = byId.get(row.id); if (original && !seen.has(original.key)) { seen.add(original.key); matched.push([row, original]); } }
  for (const row of rows) { if (byId.has(row.id)) continue; const original = byKey.get(keyOf(row)); if (original && !seen.has(original.key)) { seen.add(original.key); matched.push([row, original]); } }
  const order = new Map(snapshot.cards.map((card, i) => [card.key, i]));
  matched.sort((a, b) => order.get(a[1].key) - order.get(b[1].key));
  return matched.map(([row, original]) => {
    return { ...original, title: String(row.title || '').replace(/^\[[^\]]+\]\s*/, '').slice(0,180) || original.title,
      column: columns.has(row.column) ? row.column : original.column,
      priority: ['low','normal','high'].includes(row.priority) ? row.priority : original.priority,
      owner: String(row.assignee || original.owner).slice(0,100) };
  });
}
export async function getBoard(fetcher = fetch) {
  const checkedAt = new Date().toISOString();
  try {
    const response = await fetcher(snapshot.source, { cache:'no-store', signal:AbortSignal.timeout(6000), headers:{Accept:'application/json'} });
    if (!response.ok) throw new Error('upstream unavailable');
    const payload = await response.json();
    if (!Array.isArray(payload.cards)) throw new Error('invalid upstream');
    const cards = normalizeCards(payload.cards);
    if (cards.length < snapshot.cards.length) throw new Error('incomplete upstream');
    return {board:snapshot.board, sourceMode:'live', checkedAt, snapshotUpdatedAt:snapshot.updatedAt, source:snapshot.source, cards};
  } catch {
    return {board:snapshot.board, sourceMode:'snapshot', checkedAt, snapshotUpdatedAt:snapshot.updatedAt, source:snapshot.source,
      warning:'Live board could not be confirmed. Showing the dated release snapshot; edits may not be reflected.', cards:snapshot.cards};
  }
}
