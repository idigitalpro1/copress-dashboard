#!/usr/bin/env node
// Read-only health check for the publication sites. Sends GET/HEAD requests only; never posts or sends email.
//
//   node scripts/site-check.mjs thevillager.today <wrc-domain> [--email path/to/template.html]
//   SITES="thevillager.today,wrc.example" node scripts/site-check.mjs
//
// Per site: apex and www status, redirect chain, TLS expiry, load time, key paths, homepage sanity.
// With --email, every http(s) link in the HTML file is checked too (e.g. the expired-subscriber template).
// Exit code 1 if anything fails.
import tls from 'node:tls';
import { readFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const emailIdx = args.indexOf('--email');
const emailFile = emailIdx >= 0 ? args.splice(emailIdx, 2)[1] : null;
const sites = (args.length ? args : (process.env.SITES || '').split(',')).map(s => s.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '')).filter(Boolean);
if (!sites.length) {
  console.error('usage: node scripts/site-check.mjs <domain> [<domain>...] [--email template.html]');
  process.exit(2);
}

const PATHS = ['/', '/subscribe', '/partners', '/admin', '/robots.txt', '/sitemap.xml'];
const SLOW_MS = 3000;
const TIMEOUT_MS = 15000;
let failures = 0;
const ok = m => console.log(`  ok    ${m}`);
const warn = m => console.log(`  WARN  ${m}`);
const fail = m => { failures++; console.log(`  FAIL  ${m}`); };

async function fetchChain(url, method = 'GET') {
  const hops = [];
  const t0 = performance.now();
  let cur = url;
  for (let i = 0; i < 8; i++) {
    const res = await fetch(cur, { method, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'user-agent': 'site-check/1.0' } });
    hops.push({ url: cur, status: res.status });
    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc) { cur = new URL(loc, cur).href; continue; }
    return { hops, res, ms: Math.round(performance.now() - t0), final: cur };
  }
  throw new Error('too many redirects');
}

function certDaysLeft(host) {
  return new Promise((resolve, reject) => {
    const s = tls.connect({ host, port: 443, servername: host, timeout: TIMEOUT_MS }, () => {
      const c = s.getPeerCertificate();
      s.end();
      resolve({ days: Math.floor((new Date(c.valid_to) - Date.now()) / 864e5), authorized: s.authorized, reason: s.authorizationError });
    });
    s.on('error', reject);
    s.on('timeout', () => { s.destroy(); reject(new Error('TLS timeout')); });
  });
}

async function checkUrl(url, label = url) {
  try {
    let r = await fetchChain(url, 'HEAD');
    if (r.res.status === 405 || r.res.status === 403) r = await fetchChain(url, 'GET');
    const s = r.res.status;
    const chain = r.hops.length > 1 ? ` via ${r.hops.length - 1} redirect(s) -> ${r.final}` : '';
    if (s >= 400) fail(`${label} ${s}${chain}`);
    else if (r.ms > SLOW_MS) warn(`${label} ${s} slow ${r.ms}ms${chain}`);
    else ok(`${label} ${s} ${r.ms}ms${chain}`);
    return s < 400;
  } catch (e) {
    fail(`${label} ${e.cause?.code || e.message}`);
    return false;
  }
}

for (const site of sites) {
  console.log(`\n== ${site}`);

  try {
    const c = await certDaysLeft(site);
    if (!c.authorized) fail(`TLS not trusted: ${c.reason}`);
    else if (c.days < 14) fail(`TLS expires in ${c.days} days`);
    else if (c.days < 30) warn(`TLS expires in ${c.days} days`);
    else ok(`TLS valid, ${c.days} days left`);
  } catch (e) {
    fail(`TLS ${e.code || e.message}`);
  }

  // apex vs www should both resolve and land on the same final host
  const finals = [];
  for (const host of [site, `www.${site}`]) {
    try {
      const r = await fetchChain(`https://${host}/`);
      finals.push(new URL(r.final).host);
      r.res.status < 400 ? ok(`https://${host}/ ${r.res.status} ${r.ms}ms -> ${new URL(r.final).host}`) : fail(`https://${host}/ ${r.res.status}`);
    } catch (e) {
      fail(`https://${host}/ ${e.cause?.code || e.message}`);
    }
  }
  if (finals.length === 2 && finals[0] !== finals[1]) warn(`apex and www end on different hosts: ${finals.join(' vs ')}`);

  try {
    const r = await fetch(`http://${site}/`, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
    const loc = r.headers.get('location') || '';
    r.status >= 300 && r.status < 400 && loc.startsWith('https://') ? ok('http redirects to https') : warn(`http:// returned ${r.status}, no https redirect`);
  } catch (e) {
    warn(`http:// ${e.cause?.code || e.message}`);
  }

  for (const p of PATHS) {
    const url = `https://${site}${p}`;
    // /admin normally sits behind login, so 401/403/redirect-to-login is healthy there
    if (p === '/admin') {
      try {
        const r = await fetchChain(url);
        r.res.status < 500 ? ok(`${url} ${r.res.status} (login gate expected)`) : fail(`${url} ${r.res.status}`);
      } catch (e) { fail(`${url} ${e.cause?.code || e.message}`); }
    } else if (p === '/robots.txt' || p === '/sitemap.xml') {
      try {
        const r = await fetchChain(url);
        r.res.status < 400 ? ok(`${url} ${r.res.status}`) : warn(`${url} ${r.res.status}`);
      } catch (e) { warn(`${url} ${e.cause?.code || e.message}`); }
    } else {
      await checkUrl(url);
    }
  }

  try {
    const r = await fetchChain(`https://${site}/`);
    const html = await r.res.text();
    if (!/<title>[^<]+<\/title>/i.test(html)) warn('homepage has no <title>');
    if (/(fatal error|stack trace|database error|error establishing a database connection|index of \/)/i.test(html)) fail('homepage shows an error page signature');
    if (html.length < 2000) warn(`homepage is only ${html.length} bytes`);
    const mixed = html.match(/(?:src|href)=["']http:\/\/[^"']+/gi) || [];
    mixed.length ? warn(`${mixed.length} http:// (mixed content) reference(s), e.g. ${mixed[0]}`) : ok('no mixed-content references on homepage');
  } catch (e) {
    fail(`homepage body check: ${e.cause?.code || e.message}`);
  }
}

if (emailFile) {
  console.log(`\n== links in ${emailFile}`);
  const html = await readFile(emailFile, 'utf8');
  const links = [...new Set([...html.matchAll(/href=["'](https?:\/\/[^"'#]+)/gi)].map(m => m[1]))]
    .filter(u => !/\{\{|\{%|%7B/.test(u)); // skip unrendered merge tags
  if (!links.length) warn('no http(s) links found');
  for (const u of links) await checkUrl(u);
}

console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);
