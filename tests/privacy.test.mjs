import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

const html = readFileSync(new URL('../privacy.html', import.meta.url), 'utf8');
const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

test('privacy.html is a static SATCOM page with the Google API policy text', () => {
  assert.match(html, /<title>SATCOM Video Studio — Privacy Policy<\/title>/);
  assert.match(html, /Villager Publishing \/ Colorado News Press \(SATCOM\)/);
  assert.match(html, /internal, password-protected newsroom tool/);
  assert.match(html, /youtube\.upload/);
  assert.match(html, /youtube\.force-ssl/);
  assert.match(html, /AES-256-GCM/);
  assert.match(html, /do not sell, rent, or share/i);
  assert.match(html, /not used to train AI models/);
  assert.match(
    html,
    /SATCOM Video Studio's use of information received from Google APIs adheres to the <a href="https:\/\/developers\.google\.com\/terms\/api-services-user-data-policy">Google API Services User Data Policy<\/a>, including the Limited Use requirements\./,
  );
  assert.match(html, /href="https:\/\/www\.youtube\.com\/t\/terms"/);
  assert.match(html, /href="https:\/\/policies\.google\.com\/privacy"/);
  assert.match(html, /href="https:\/\/myaccount\.google\.com\/permissions"/);
  assert.match(html, /delete the stored tokens/);
  assert.match(html, /up to 1 year/);
  assert.match(html, /support@villagerpublishing\.com/);
  assert.match(html, /datetime="2026-09-30"/);
  assert.match(html, /href="\/codex\.css"/);
  assert.match(html, /name="viewport"/);
});

test('/privacy is served by cleanUrls from privacy.html without a new rewrite', () => {
  assert.equal(vercel.cleanUrls, true);
  assert.equal(vercel.trailingSlash, false);
  assert.deepEqual(vercel.redirects.map(r => [r.source, r.destination]), [
    ['/data/video-feed.json', '/api/videos'],
    ['/', '/subscribe-villager/'],
  ]);
  assert.deepEqual(vercel.rewrites.map(r => [r.source, r.destination]), [
    ['/apikeys', '/apistore'],
    ['/video/studio', '/video/studio.html'],
    ['/video/upload', '/video/creator-upload.html'],
    ['/video/upload/:token', '/video/creator-upload.html'],
    ['/video', '/video/index.html'],
    ['/mcp', '/api/mcp'],
    ['/console/api/hermes/:path*', 'https://codex.conews.press/api/v1/platform/hermes/:path*'],
  ]);
  assert.equal(vercel.redirects[0].has, undefined);
  assert.equal(vercel.redirects[1].has[0].value, 'subscribe.thevillager.today');
  assert.ok(!vercel.rewrites.some(r => r.source === '/privacy' || r.destination === '/privacy.html'));

  const pathname = '/privacy';
  let file = pathname === '/apikeys' ? '/apistore.html'
    : pathname === '/video' || pathname === '/video/' ? '/video/index.html'
    : pathname === '/' ? '/index.html' : pathname;
  if (!extname(file)) file += '.html';
  assert.equal(file, '/privacy.html');
});
