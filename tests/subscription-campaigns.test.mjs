import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({});
vm.runInContext(readFileSync(new URL('../js/subscription-campaigns.js', import.meta.url), 'utf8'), context);
const api = context.SubscriptionCampaigns;

test('all three concepts produce drafts with frozen destinations and no inherited renewal defaults', () => {
  assert.equal(api.concepts.length, 3);
  for (const concept of api.concepts) for (const publication of concept.publications) {
    const draft = api.createDraft(concept.key, publication, '2026-10-11');
    assert.equal(draft.status, 'draft');
    assert.equal(draft.sent, false);
    assert.equal(draft.readmore, api.publications[publication].url);
    assert.equal(draft.postcard.size, '4x6');
    assert.equal(draft.postcard.page_size, '6in 4in');
    assert.equal(draft.postcard.renew_url, draft.readmore);
    assert.equal(draft.pictureMessage.orientation, 'vertical');
    assert.equal(draft.pictureMessage.qr_url, draft.readmore);
    assert.equal(draft.pictureMessage.clickable_url, draft.readmore);
    assert.ok(draft.pictureMessage.copy.includes(draft.readmore));
    assert.equal(draft.artwork.member, null);
    assert.equal(draft.postcard.art, null);
    assert.equal(draft.postcard.rate, undefined);
    assert.equal(draft.postcard.expires, undefined);
    assert.doesNotMatch(JSON.stringify(draft), /\$85|2026-07-31/);
  }
  assert.throws(() => api.createDraft('villager-high-school-sports', 'wrc'));
  const sports = api.createDraft('villager-high-school-sports', 'villager');
  assert.ok(sports.blockers.some(item => item.includes('photo missing')));
});

test('subscription handoff maps both publications, labels and subject without sponsored or mountain assumptions', () => {
  for (const publication of ['villager', 'wrc']) {
    const draft = api.createDraft('villager-wrc-pairing', publication);
    const mapped = api.normalizeHandoff({ ...draft, readmore: 'https://example.com/' }, 'wrc');
    assert.equal(mapped.kicker, 'Subscription Invitation');
    assert.equal(api.storyUrl(mapped, publication, 'https://example.com/'), api.publications[publication].url);
    assert.equal(mapped[publication === 'villager' ? 'villagerUrl' : 'wrcUrl'], draft.readmore);
    assert.doesNotMatch(mapped.subject, /mountain readers/);
    assert.ok(mapped.subject.includes(api.publications[publication].name));
  }
  const old = api.normalizeHandoff({ title: 'Sponsor', readmore: 'https://example.com/ad' }, 'villager');
  assert.equal(old.kicker, 'Sponsored Message');
  assert.equal(api.storyUrl(old, 'villager', 'fallback'), 'https://example.com/ad');
  assert.equal(api.normalizeHandoff({ campaignType: 'editorial' }, 'wrc').kicker, 'Community News');
});

test('conversion adapter never claims enrollment, subscription or payment; consent is channel specific', () => {
  const draft = api.createDraft('villager-wrc-pairing', 'wrc');
  for (const channel of ['email', 'picture-text', 'qr']) for (const consent of [false, true]) {
    const handoff = api.conversionHandoff(draft, channel, consent);
    assert.equal(handoff.enrollment.status, 'unavailable');
    assert.equal(handoff.enrollment.enrolled, false);
    assert.equal(handoff.enrollment.contact_ref, null);
    assert.equal(handoff.paid_status, 'unverified');
    assert.equal(handoff.subscriber_record, 'unverified');
    assert.equal(handoff.delivery.sent, false);
    assert.equal(handoff.consent.required, channel !== 'qr');
    assert.equal(handoff.consent.confirmed, channel === 'qr' ? null : consent);
    assert.equal(handoff.consent.evidence_ref, null);
    assert.ok(handoff.blockers.some(item => item.includes('Consent evidence')));
  }
  assert.throws(() => api.conversionHandoff(draft, 'sms-send', true));
});

test('UI uses shared contract, exact subscription CTA and an inline live-text export button', () => {
  const newsletter = readFileSync(new URL('../newsletter.html', import.meta.url), 'utf8');
  const hub = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const html of [newsletter, hub]) assert.match(html, /src="\/js\/subscription-campaigns.js"/);
  assert.match(newsletter, /normalizeHandoff\(rawHandoff, state.publication\)/);
  assert.match(newsletter, /story.campaignType === 'subscription' \? url : campaignLink\(url\)/);
  assert.match(newsletter, /<a class="cta-btn" style="display:inline-block;[^"]+" href="\$\{subscription \? storyLink\(lead\)/);
  assert.match(hub, /disabled title="No connected enrollment adapter"/);
  assert.match(hub, /id="subscription-consent"/);
});
