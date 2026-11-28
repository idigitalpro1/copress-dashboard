const STOP = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']);
const HELP = new Set(['HELP', 'INFO']);
const START = new Set(['START', 'UNSTOP']);
const DECISIONS = {
  YES: 'approve',
  Y: 'approve',
  APPROVE: 'approve',
  NO: 'reject',
  N: 'reject',
  REJECT: 'reject',
};
const CODE = /^[A-Z0-9]{4}$/;

export function parseReviewReply(raw) {
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!text) return { type: 'unknown' };
  const [first, ...restParts] = text.split(' ');
  const keyword = first.toUpperCase();
  const rest = restParts.join(' ').trim();
  if (!rest && STOP.has(keyword)) return { type: 'stop' };
  if (!rest && HELP.has(keyword)) return { type: 'help' };
  if (!rest && START.has(keyword)) return { type: 'start' };
  const decision = DECISIONS[keyword];
  if (!decision) return { type: 'unknown' };
  if (!rest) return { type: 'decision', decision, code: null, reason: null };
  const maybeCode = restParts[0].toUpperCase();
  if (CODE.test(maybeCode)) {
    return { type: 'decision', decision, code: maybeCode, reason: restParts.slice(1).join(' ').trim() || null };
  }
  return { type: 'decision', decision, code: null, reason: rest };
}
