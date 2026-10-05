import net from 'node:net';
import { lookup as dnsLookup } from 'node:dns/promises';

// Server-side page fetch for the URL-to-video desk. The URL is operator-supplied but the
// server still must not become a proxy into private networks: http(s) only, standard ports,
// no credentials, every resolved address must be public, redirects are re-validated, and
// the body is size- and time-capped. (DNS is resolved once for the check and again by fetch,
// so a hostile DNS server could still rebind; the desk is operator-only and read-only.)

const MAX_REDIRECTS = 4;
const TEXT_TYPES = /^(text\/html|application\/xhtml\+xml|text\/plain)\b/i;

function fail(status, message) { return Object.assign(new Error(message), { status, expose: true }); }

function ipv4Private(ip) {
  const [a, b, c] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0 && c === 0)
    || (a === 198 && (b === 18 || b === 19));
}

export function isPrivateAddress(ip) {
  const v = net.isIP(ip);
  if (v === 4) return ipv4Private(ip);
  if (v === 6) {
    const s = ip.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
    if (mapped) return ipv4Private(mapped[1]);
    return s === '::' || s === '::1' || /^f[cd]/.test(s) || /^fe[89ab]/.test(s) || s.startsWith('ff');
  }
  return true; // not an IP: treat as unsafe
}

export function parsePublicUrl(raw) {
  let url;
  try { url = new URL(String(raw || '').trim()); } catch { throw fail(400, 'Enter a full http(s) URL.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw fail(400, 'Only http(s) URLs are supported.');
  if (url.username || url.password) throw fail(400, 'URLs with credentials are not allowed.');
  if (url.port && !['80', '443'].includes(url.port)) throw fail(400, 'Only the standard web ports are allowed.');
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || /\.(localhost|local|internal|lan|home|corp)$/.test(host) || host === 'metadata.google.internal') {
    throw fail(400, 'That host is not allowed.');
  }
  return { url, host };
}

export async function assertPublicHost(host, lookup = dnsLookup) {
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw fail(400, 'That address is not allowed.');
    return;
  }
  let records;
  try { records = await lookup(host, { all: true }); } catch { throw fail(502, 'Could not resolve that host.'); }
  const list = Array.isArray(records) ? records : [records];
  if (!list.length || list.some(r => isPrivateAddress(r.address))) throw fail(400, 'That host resolves to a private address.');
}

async function readCapped(response, maxBytes) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    const buf = Buffer.from(await response.arrayBuffer());
    return buf.subarray(0, maxBytes);
  }
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      chunks.push(Buffer.from(value.subarray(0, value.length - (total - maxBytes))));
      await reader.cancel().catch(() => {});
      break;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ', '&mdash;': '-', '&ndash;': '-', '&rsquo;': "'", '&lsquo;': "'", '&ldquo;': '"', '&rdquo;': '"' };
const decode = s => s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|[a-z]+);/gi, (m, d, h) => {
  if (d || h) { const n = d ? Number(d) : parseInt(h, 16); return n > 31 && n < 0x110000 ? String.fromCodePoint(n) : ' '; }
  return ENTITIES[m.toLowerCase()] ?? ' ';
});

function metaContent(html, ...names) {
  for (const name of names) {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, 'i');
    const tag = re.exec(html)?.[0];
    const content = tag && /content=["']([^"']*)["']/i.exec(tag)?.[1];
    if (content) return decode(content).trim();
  }
  return '';
}

export function extractPage(html, { maxChars = 12000 } = {}) {
  const title = metaContent(html, 'og:title', 'twitter:title') || decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || '').replace(/\s+/g, ' ').trim();
  const description = metaContent(html, 'og:description', 'description', 'twitter:description');
  const siteName = metaContent(html, 'og:site_name');
  const body = (/<body[\s\S]*<\/body>/i.exec(html)?.[0] || html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|form|nav|footer|header)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)\b[^>]*>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' ')
    .replace(/<[^>]+>/g, '');
  const text = decode(body).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').replace(/[ \t\f\v]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { title: title.slice(0, 200), description: description.slice(0, 500), site_name: siteName.slice(0, 120), text: text.slice(0, maxChars), truncated: text.length > maxChars };
}

export async function fetchPage(rawUrl, { fetchImpl = (...a) => fetch(...a), lookup = dnsLookup, maxBytes = 1_500_000, timeoutMs = 12000 } = {}) {
  let { url, host } = parsePublicUrl(rawUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(host, lookup);
    let response;
    try {
      response = await fetchImpl(url.href, {
        method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(timeoutMs),
        headers: { 'User-Agent': 'SATCOM-VideoDesk/1.0 (+https://satcom.conews.press)', Accept: 'text/html,application/xhtml+xml,text/plain;q=0.8' },
      });
    } catch { throw fail(502, 'Could not fetch that URL.'); }
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      if (hop === MAX_REDIRECTS) throw fail(502, 'Too many redirects.');
      ({ url, host } = parsePublicUrl(new URL(response.headers.get('location'), url).href));
      continue;
    }
    if (!response.ok) throw fail(502, `The page returned ${response.status}.`);
    const type = response.headers.get('content-type') || '';
    if (!TEXT_TYPES.test(type)) throw fail(415, 'That URL is not an HTML or text page.');
    const raw = (await readCapped(response, maxBytes)).toString('utf8');
    const page = /text\/plain/i.test(type)
      ? { title: '', description: '', site_name: '', text: raw.slice(0, 12000), truncated: raw.length > 12000 }
      : extractPage(raw);
    if (!page.text && !page.title) throw fail(422, 'No readable text was found on that page.');
    return { url: url.href, host, ...page };
  }
  throw fail(502, 'Could not fetch that URL.');
}
