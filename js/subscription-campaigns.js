/* Shared SATCOM draft contract. No delivery, billing or subscriber writes. */
(function (root) {
  'use strict';
  const publications = Object.freeze({
    villager: { name: 'The Villager', url: 'https://thevillager.today/subscribe' },
    wrc: { name: 'Weekly Register-Call', url: 'https://registercall.com/subscribe' },
  });
  // Canonical subscription packet v2026.10.02, existing payment links only.
  const offers = Object.freeze([
  {
    "id": "wrc-print-annual",
    "publication": "wrc",
    "name": "Print — 1 year",
    "amountUsd": 78,
    "priceLabel": "$78/year",
    "type": "print",
    "interval": "year",
    "checkoutUrl": "https://buy.stripe.com/eVq6oA2Ky4jZ6CQfMAfrW0M",
    "sourceVersion": "2026.10.02",
    "sourceBlob": "3320aba92a67d42325e1b33c50ac868aa00de012",
    "liveVerified": false
  },
  {
    "id": "wrc-digital-monthly",
    "publication": "wrc",
    "name": "Online — monthly",
    "amountUsd": 10,
    "priceLabel": "$10/month",
    "type": "digital",
    "interval": "month",
    "checkoutUrl": "https://buy.stripe.com/5kQeV60Cq03J6CQ7g4frW0L",
    "sourceVersion": "2026.10.02",
    "sourceBlob": "3320aba92a67d42325e1b33c50ac868aa00de012",
    "liveVerified": false
  },
  {
    "id": "villager-print-annual",
    "publication": "villager",
    "name": "Print — 1 year",
    "amountUsd": 85,
    "priceLabel": "$85/year",
    "type": "print",
    "interval": "year",
    "checkoutUrl": "https://buy.stripe.com/7sY00l76V5eU8OT2d1gUM01",
    "sourceVersion": "2026.10.02",
    "sourceBlob": "3320aba92a67d42325e1b33c50ac868aa00de012",
    "liveVerified": false
  },
  {
    "id": "villager-digital-monthly",
    "publication": "villager",
    "name": "Online — monthly",
    "amountUsd": 10,
    "priceLabel": "$10/month",
    "type": "digital",
    "interval": "month",
    "checkoutUrl": "https://buy.stripe.com/3cI28t0Ix8r6aX19FtgUM00",
    "sourceVersion": "2026.10.02",
    "sourceBlob": "3320aba92a67d42325e1b33c50ac868aa00de012",
    "liveVerified": false
  }
]);
  const artworkSource = Object.freeze({
    library_file_id: 'libfile_bcaeef0e30708191ae747fe0eafb2968',
    package: 'READY_TO_REVIEW.zip',
    member: null,
    status: 'blocked-transfer-uninspected',
  });
  const concepts = Object.freeze([
    { key: 'villager-hall-of-fame', title: 'Celebrate The Villager publisher Hall of Fame',
      publications: ['villager'], brief: 'Celebrate our publishers and support local journalism with a Villager subscription.',
      blockers: ['Verify award copy and photo rights', 'Inspect package artwork'] },
    { key: 'villager-high-school-sports', title: 'Follow local high-school sports',
      publications: ['villager'], brief: 'Keep up with local high-school sports in The Villager.',
      blockers: ['Approved sports photo missing; artwork cannot be send-ready', 'Inspect package artwork'] },
    { key: 'villager-wrc-pairing', title: 'Support your community newspaper',
      publications: ['villager', 'wrc'], brief: 'Stay connected to your community with a subscription to your local newspaper.',
      blockers: ['Villager/WRC brand pairing and return address unapproved', 'Inspect package artwork'] },
  ]);
  function createDraft(key, publication, published = new Date().toISOString().slice(0, 10), offerId = publication + '-print-annual') {
    const concept = concepts.find(item => item.key === key);
    const brand = publications[publication];
    if (!concept || !brand || !concept.publications.includes(publication)) {
      throw new Error('Choose a supported concept and publication.');
    }
    const offer = offers.find(item => item.id === offerId && item.publication === publication);
    if (!offer) throw new Error('Choose a supported publication offer.');
    const copy = concept.brief + ' ' + offer.name + ': ' + offer.priceLabel + '.';
    return {
      concept: key, publication, title: concept.title, published,
      campaignType: 'subscription', status: 'draft', sent: false,
      offerId: offer.id, offer, brief: copy, output: copy, readmore: offer.checkoutUrl,
      subscribePage: brand.url,
      creative_key: concept.key + ':' + offer.id,
      followup: { routing_key: concept.key + ':' + offer.id, workflow_ref: null, status: 'unmapped' },
      artwork: { ...artworkSource, creative_key: concept.key + ':' + offer.id },
      postcard: { publication: brand.name, art: null, size: '4x6',
        page_size: '6in 4in', renew_url: brand.url, tagline: copy,
        offer_id: offer.id, product_checkout_url: offer.checkoutUrl,
        default_note: '', print_side: 'both', status: 'draft', bleed: false },
      pictureMessage: { orientation: 'vertical', art: null, qr_url: offer.checkoutUrl,
        qr_status: 'asset-unavailable', clickable_url: offer.checkoutUrl, copy: copy + ' Subscribe: ' + offer.checkoutUrl },
      blockers: [...concept.blockers, 'Print bleed required before mailing',
        'Email sender and unsubscribe integration required', 'Product payment link is source-mapped; live Stripe status unverified',
        'Offer-specific artwork and follow-up workflow mapping require review'],
    };
  }
  function normalizeHandoff(handoff, fallbackPublication) {
    const publication = publications[handoff.publication] ? handoff.publication : fallbackPublication;
    const subscription = handoff.campaignType === 'subscription';
    const offer = handoff.offerId && offers.find(item => item.id === handoff.offerId && item.publication === publication);
    if (handoff.offerId && !offer) throw new Error('Publication and offer do not match.');
    // Legacy subscription handoffs retain the frozen general subscription door.
    const url = subscription ? (offer?.checkoutUrl || publications[publication].url) : handoff.readmore;
    return {
      ...handoff, publication, readmore: url,
      villagerUrl: publication === 'villager' ? url : undefined,
      wrcUrl: publication === 'wrc' ? url : undefined,
      kicker: subscription ? 'Subscription Invitation'
        : handoff.campaignType === 'editorial' ? 'Community News' : 'Sponsored Message',
      subject: (handoff.title || 'Local campaign') + ' — ' + publications[publication].name,
      ctaLabel: subscription ? 'Subscribe' : 'Continue reading',
    };
  }
  // Subscription doors are frozen: no newsletter tracking query is added.
  function storyUrl(story, publication, fallback) {
    if (story.campaignType === 'subscription') {
      const offer = story.offerId && offers.find(item => item.id === story.offerId && item.publication === publication);
      if (story.offerId && !offer) throw new Error('Publication and offer do not match.');
      return offer?.checkoutUrl || publications[publication].url;
    }
    return story[publication === 'villager' ? 'villagerUrl' : 'wrcUrl'] || story.readmore || fallback;
  }
  // A portable adapter proposal only: no contact values are collected or stored.
  function conversionHandoff(draft, channel, consent) {
    if (!['email', 'picture-text', 'qr'].includes(channel)) throw new Error('Unsupported channel.');
    const optedIn = channel === 'qr' ? null : consent === true;
    return {
      schemaVersion: 1, campaign: draft.concept, publication: draft.publication,
      offer_id: draft.offerId, creative_key: draft.creative_key, followup: draft.followup,
      channel, campaign_url: draft.offer.checkoutUrl,
      consent: { required: channel !== 'qr', confirmed: optedIn,
        evidence_ref: null, capture_required_at_enrollment: true },
      enrollment: { status: 'unavailable', reason: 'SATCOM/HubSpot enrollment adapter is not connected',
        contact_ref: null, workflow_ref: null, enrolled: false },
      subscriber_record: 'unverified', paid_status: 'unverified',
      delivery: { status: 'draft', sent: false },
      blockers: [...draft.blockers, ...(channel !== 'qr' && !optedIn ? ['Channel opt-in must be verified'] : []),
        'Consent evidence and approved workflow mapping required before real enrollment'],
    };
  }
  root.SubscriptionCampaigns = Object.freeze({ publications, offers, concepts, createDraft, normalizeHandoff, storyUrl, conversionHandoff });
})(globalThis);
