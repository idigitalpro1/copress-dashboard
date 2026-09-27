import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../newsletter.html', import.meta.url), 'utf8');
const issueData = html.slice(html.indexOf('const PUBLICATION_ISSUES = {'));
const wrcBlock = issueData.slice(issueData.indexOf('  wrc: {'), issueData.indexOf('  villager: {'));
const villagerBlock = issueData.slice(issueData.indexOf('  villager: {'), issueData.indexOf('\n};'));

test('WRC Sept. 24 uses exactly three verified leads and the preserved issue assets', () => {
  assert.equal((wrcBlock.match(/issueStory\(/g) || []).length, 3);
  assert.equal((wrcBlock.match(/readmore: WRC_ISSUE_URL/g) || []).length, 3);
  assert.match(html, /const WRC_ISSUE_URL = 'https:\/\/registercall\.com\/issues\/wrc-2026-09-24\.pdf';/);
  assert.match(html, /const WRC_FRONTPAGE_URL = 'https:\/\/registercall\.com\/issues\/wrc-2026-09-24-frontpage\.png';/);
  assert.match(wrcBlock, /BH: No Briggs Lot, no collaboration/);
  assert.match(wrcBlock, /Despite Central vs\. RCI court case, it’s business as usual/);
  assert.match(wrcBlock, /Floyd Hill I-70 project enters its fourth construction season/);
  assert.match(html, /wrc-2026-09-24-weekly/);
  assert.match(html, /site: 'https:\/\/registercall\.com\/'/);
  assert.doesNotMatch(html, /AUG 20, 2026/);
  assert.match(html, /\$\{issue\.fullIssueLabel \|\| 'Read full issue'\}/);
});

test('Villager Sept. 24 switches to its own five-story current set', () => {
  assert.equal((villagerBlock.match(/issueStory\(/g) || []).length, 5);
  for (const slug of [
    'colorado-journalism-hall-of-fame-honors-gerri-bob-sweeney',
    'centennial-chalk-art-festival-winners-2026',
    'hudson-gardens-jack-o-lanterns-2026',
    'arapahoe-county-district-2-commissioner-candidates-2026',
    'arapahoe-county-district-4-commissioner-candidates-2026',
  ]) {
    assert.match(villagerBlock, new RegExp(`https://thevillager\\.today/article/${slug}`));
  }
  assert.match(html, /villager-2026-09-24-weekly/);
  assert.match(html, /site: 'https:\/\/thevillager\.today\/'/);
  assert.match(html, /function selectPublication[\s\S]*?resetStoriesForPublication\(\);[\s\S]*?applyPublication\(\);/);
});

test('newsletter stays review-only and keeps publication-scoped draft versions', () => {
  assert.match(html, /Review-only current source/);
  assert.match(html, /contentVersion: getIssue\(\)\.contentVersion/);
  assert.match(html, /saved\.contentVersion === getIssue\(\)\.contentVersion/);
  const sendBody = html.slice(html.indexOf('async function sendNewsletter()'), html.indexOf('function exportHTML()'));
  assert.doesNotMatch(sendBody, /fetch\(|XMLHttpRequest|sendBeacon/);
  assert.match(sendBody, /no newsletter was sent/);
  assert.match(html, /live subscriber delivery remains disconnected/);
  assert.equal((html.match(/href="\[unsubscribe\]"/g) || []).length, 3);
  assert.equal((html.match(/href="\[webversion\]"/g) || []).length, 3);
  assert.doesNotMatch(html, /href="#">Unsubscribe/);
});
