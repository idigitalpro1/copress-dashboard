import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const handler = require(path.join(root, 'api/menus.js'));

function invoke({ method = 'GET', url = '/api/menus', query } = {}) {
  return new Promise((resolve) => {
    const headers = {};
    const response = {
      statusCode: 200,
      setHeader(name, value) {
        headers[name.toLowerCase()] = value;
      },
      end(body) {
        resolve({ statusCode: this.statusCode, headers, body });
      }
    };

    handler({ method, url, query }, response);
  });
}

const all = await invoke();
const empire = await invoke({ url: '/api/menus?town=empire' });
const missing = await invoke({ query: { town: 'missing' } });
const post = await invoke({ method: 'POST' });
const head = await invoke({ method: 'HEAD' });
const allJson = JSON.parse(all.body);
const empireJson = JSON.parse(empire.body);
const expectedTownCount = handler.menuData.towns.length;
const expectedVenueCount = handler.menuData.towns.reduce((total, town) => total + town.venues.length, 0);
const expectedItemCount = handler.menuData.towns.reduce(
  (total, town) => total + town.venues.reduce((sum, venue) => sum + venue.items.length, 0),
  0
);

assert.equal(all.statusCode, 200);
assert.equal(allJson.meta.townCount, expectedTownCount);
assert.equal(allJson.meta.venueCount, expectedVenueCount);
assert.equal(allJson.meta.itemCount, expectedItemCount);
assert.ok(allJson.towns.some((town) => town.id === 'empire'));
assert.ok(allJson.towns.some((town) => town.id === 'georgetown'));
assert.equal(empire.statusCode, 200);
assert.equal(empireJson.meta.townCount, 1);
assert.equal(empireJson.towns[0].id, 'empire');
assert.equal(missing.statusCode, 404);
assert.equal(post.statusCode, 405);
assert.equal(post.headers.allow, 'GET, HEAD, OPTIONS');
assert.equal(head.statusCode, 200);
assert.equal(head.body, '');

const html = fs.readFileSync(path.join(root, 'menu-preview.html'), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);

assert.equal(scripts.length, 1, 'preview should contain one inline script');
new Function(scripts[0]);
assert.match(html, /\/api\/menus/);
assert.match(html, /\/data\/menus\.json/);

console.log(JSON.stringify({
  route: '/api/menus',
  towns: allJson.meta.townCount,
  venues: allJson.meta.venueCount,
  items: allJson.meta.itemCount,
  filteredTown: empireJson.towns[0].id,
  missingTownStatus: missing.statusCode,
  methodGuardStatus: post.statusCode,
  headBodyBytes: Buffer.byteLength(head.body),
  inlineScriptSyntax: 'passed'
}, null, 2));
