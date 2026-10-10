import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

// Awards wall in the Publisher Inducted kit: Depth + Glass (LOCK-021), served at
// /thevillager-publisher-inducted-campaign-kit/awards (cleanUrls, no trailing slash).
const KIT = '/thevillager-publisher-inducted-campaign-kit/awards';
const page = new URL('../thevillager-publisher-inducted-campaign-kit/awards/index.html', import.meta.url);
const html = readFileSync(page, 'utf8');
const count = (re) => (html.match(re) || []).length;

test('awards wall is a static page with self-hosted assets on absolute paths', () => {
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<title>Villager &amp; Register-Call Awards<\/title>/);
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /viewport-fit=cover/);
  assert.doesNotMatch(html, /fonts\.(googleapis|gstatic)\.com/, 'Fredoka is self-hosted (LOCK-021)');
  assert.doesNotMatch(html, /<script[^>]+src=/, 'no external scripts');
  assert.doesNotMatch(html, /(src|href)="https?:/, 'no remote assets or links');
  const assets = [...html.matchAll(/(?:href="|url\(")(\/[^"]+\/assets\/[^"]+)"/g)].map(m => m[1]);
  assert.ok(assets.length >= 4);
  for (const a of assets) {
    assert.ok(a.startsWith(`${KIT}/assets/`), `${a} must be absolute: relative paths break without a trailing slash`);
    assert.ok(existsSync(new URL(`..${a}`, import.meta.url)), `${a} exists`);
  }
  assert.ok(existsSync(new URL(`..${KIT}/assets/icon-512.png`, import.meta.url)));
});

test('awards wall follows the Depth + Glass lock (LOCK-021)', () => {
  assert.match(html, /font-stretch: 75%; font-variation-settings: "wdth" 75/);
  assert.match(html, /--dg-regular-bg: rgb\(14 18 44 \/ \.54\)/);
  assert.match(html, /--dg-r-capsule: 999px; --dg-r-panel: 28px; --dg-r-card: 22px; --dg-r-chip: 14px/);
  assert.match(html, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(html, /<button[^>]+data-action="motion"[^>]+aria-pressed=/, 'visible motion toggle');
  assert.match(html, /<nav class="dg-tabbar[^"]*" aria-label="Primary">/);
  assert.equal(count(/<a [^>]*aria-current="page"/g), 1);
  assert.match(html, /<form class="dg-search[^"]*" role="search"/);
  assert.match(html, /<label class="sr-only" for="dg-q">[^<]+<\/label>\s*<input id="dg-q" type="search"/);
  assert.match(html, /position: fixed; left: 0; right: 0; bottom: 0/, 'floating inset dock');
  assert.doesNotMatch(html, /position:\s*sticky/, 'no anchored header');
  for (const q of ['prefers-reduced-transparency', 'prefers-contrast: more', 'forced-colors: active']) assert.ok(html.includes(q), q);
});

test('award counts agree across the numeral, headline, tally and shelves', () => {
  const cards = count(/<li class="dg-card /g);
  assert.equal(cards, 15);
  assert.match(html, new RegExp(`<span class="dg-display">${cards + 1}</span>`));
  assert.match(html, /<h1>Sixteen honors, one night<\/h1>/);
  assert.match(html, /brought home fifteen awards/);
  const places = [1, 2, 3].map(p => count(new RegExp(`<p class="place">${p}(st|nd|rd) place`, 'g')));
  assert.equal(places.reduce((a, b) => a + b, 0), cards);
  for (const [i, word] of ['first', 'second', 'third'].entries()) {
    assert.match(html, new RegExp(`<b>${places[i]}</b> ${word} place`));
  }
  for (const pub of ['villager', 'wrc']) {
    const shelf = html.split(`id="${pub}"`)[1].split('</section>')[0];
    const n = count(new RegExp(`data-pub="${pub}"`, 'g'));
    const firsts = (shelf.match(/<p class="place">1st place/g) || []).length;
    assert.match(shelf, new RegExp(`<p>${n} awards · ${firsts} first place</p>`));
  }
});

test('review fixes stay fixed: search form, icons, static no-JS page, forced colors', () => {
  // Enter in the search pill must reach the form's submit handler, not a card that shares its attribute.
  assert.equal(count(/data-search/g), 1, 'only the search form carries data-search');
  assert.match(html, /input\.form\.addEventListener\('submit'/);
  // The medal faces must not reuse the icons' .back layer class.
  assert.doesNotMatch(html, /^\.back \{/m);
  assert.match(html, /\.face--back \{ transform: rotateY\(180deg\)/);
  // Decorative loops run only after JS confirms motion, so the no-JS page is static.
  assert.doesNotMatch(html, /data-motion="auto"\]/);
  for (const loop of ['.spin', '.star::before', '.plaque::after']) {
    assert.ok(html.includes(`html[data-motion="on"] ${loop} { animation:`), loop);
  }
  // Pseudo-elements are ignored inside :is(), so they must not be listed there.
  assert.doesNotMatch(html, /:is\([^)]*::/);
  // Forced colors: the UA maps text and focus colours on glass; only the medals opt out.
  const forced = html.split('@media (forced-colors: active) {')[1].split('\n}')[0];
  assert.doesNotMatch(forced.split('\n').find(l => l.trim().startsWith('.glass {')), /forced-color-adjust/);
  assert.match(forced, /\.dg-search:focus-within \{ outline: 3px solid Highlight/);
  // Every star starts spinning at once, at a staggered angle.
  for (const [, d] of html.matchAll(/--d:(-?[\d.]+)s/g)) assert.ok(parseFloat(d) <= 0, `delay ${d}`);
});

test('awards wall stays clear of subscribe, QR and payment routing (LOCK-003)', () => {
  assert.doesNotMatch(html, /\/subscribe|stripe|checkout|qr/i);
});
