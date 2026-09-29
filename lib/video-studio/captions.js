// Caption cues are kept in SOURCE time (seconds from the start of the original clip)
// so changing the trim never desynchronises them. They are shifted per render.
const MAX_CUES = 2000;

function clean(text) {
  return String(text ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 300);
}

function parseTime(value) {
  const m = String(value).trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/);
  if (!m) return NaN;
  return Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number((m[4] || '0').padEnd(3, '0')) / 1000;
}

export function normalizeCues(cues) {
  if (!Array.isArray(cues)) return [];
  return cues.slice(0, MAX_CUES).map(c => ({ start: Number(c?.start), end: Number(c?.end), text: clean(c?.text) }))
    .filter(c => Number.isFinite(c.start) && Number.isFinite(c.end) && c.start >= 0 && c.end > c.start && c.end - c.start <= 30 && c.text)
    .map(c => ({ start: Math.round(c.start * 1000) / 1000, end: Math.round(c.end * 1000) / 1000, text: c.text }))
    .sort((a, b) => a.start - b.start);
}

// Accepts SRT or WebVTT text.
export function parseCaptions(text) {
  const cues = [];
  for (const block of String(text ?? '').replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    const timing = lines.findIndex(l => l.includes('-->'));
    if (timing < 0) continue;
    const [a, b] = lines[timing].split('-->');
    cues.push({ start: parseTime(a), end: parseTime(String(b).trim().split(/\s+/)[0]), text: lines.slice(timing + 1).join(' ') });
  }
  return normalizeCues(cues);
}

function stamp(seconds, sep) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${sep}${String(ms % 1000).padStart(3, '0')}`;
}

export function toSrt(cues) {
  return normalizeCues(cues).map((c, i) => `${i + 1}\n${stamp(c.start, ',')} --> ${stamp(c.end, ',')}\n${c.text}\n`).join('\n');
}

export function toVtt(cues) {
  return 'WEBVTT\n\n' + normalizeCues(cues).map(c => `${stamp(c.start, '.')} --> ${stamp(c.end, '.')}\n${c.text}\n`).join('\n');
}

// Shift source-time cues into a trimmed clip's timeline.
export function cuesForWindow(cues, start, end) {
  return normalizeCues(cues).filter(c => c.end > start && c.start < end)
    .map(c => ({ start: Math.max(0, c.start - start), end: Math.min(end, c.end) - start, text: c.text }))
    .filter(c => c.end > c.start);
}

// Group word timestamps (from speech-to-text) into readable caption cues.
export function wordsToCues(words, offset = 0, { maxChars = 42, maxSeconds = 3.5, gap = 0.7 } = {}) {
  const cues = []; let cur = null;
  for (const w of Array.isArray(words) ? words : []) {
    const text = clean(w?.text ?? w?.word); const start = Number(w?.start) + offset; const end = Number(w?.end) + offset;
    if (!text || !Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (cur && (start - cur.end > gap || end - cur.start > maxSeconds || (cur.text + ' ' + text).length > maxChars)) { cues.push(cur); cur = null; }
    if (!cur) cur = { start, end, text };
    else { cur.text = /^[,.;:!?%)]/.test(text) ? cur.text + text : `${cur.text} ${text}`; cur.end = end; }
    if (/[.!?]$/.test(text)) { cues.push(cur); cur = null; }
  }
  if (cur) cues.push(cur);
  return normalizeCues(cues);
}
