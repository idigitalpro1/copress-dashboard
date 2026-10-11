/* Shared SATCOM draft contract. No delivery, billing or subscriber writes. */
(function (root) {
  'use strict';
  const publications = Object.freeze({
    villager: { name: 'The Villager', url: 'https://thevillager.today/subscribe' },
    wrc: { name: 'Weekly Register-Call', url: 'https://registercall.com/subscribe' },
  });
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
  function createDraft(key, publication, published = new Date().toISOString().slice(0, 10)) {
    const concept = concepts.find(item => item.key === key);
    const brand = publications[publication];
    if (!concept || !brand || !concept.publications.includes(publication)) {
      throw new Error('Choose a supported concept and publication.');
    }
    return {
      concept: key, publication, title: concept.title, published,
      campaignType: 'subscription', status: 'draft', sent: false,
      brief: concept.brief, output: concept.brief, readmore: brand.url,
      artwork: artworkSource,
      postcard: { publication: brand.name, art: null, size: '4x6',
        page_size: '6in 4in', renew_url: brand.url, tagline: concept.brief,
        default_note: '', print_side: 'both', status: 'draft', bleed: false },
      pictureMessage: { orientation: 'vertical', art: null, qr_url: brand.url,
        clickable_url: brand.url, copy: concept.brief + ' Subscribe: ' + brand.url },
      blockers: [...concept.blockers, 'Print bleed required before mailing',
        'Email sender and unsubscribe integration required'],
    };
  }
  function normalizeHandoff(handoff, fallbackPublication) {
    const publication = publications[handoff.publication] ? handoff.publication : fallbackPublication;
    const subscription = handoff.campaignType === 'subscription';
    const url = subscription ? publications[publication].url : handoff.readmore;
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
    if (story.campaignType === 'subscription') return publications[publication].url;
    return story[publication === 'villager' ? 'villagerUrl' : 'wrcUrl'] || story.readmore || fallback;
  }
  // A portable adapter proposal only: no contact values are collected or stored.
  function conversionHandoff(draft, channel, consent) {
    if (!['email', 'picture-text', 'qr'].includes(channel)) throw new Error('Unsupported channel.');
    const optedIn = channel === 'qr' ? null : consent === true;
    return {
      schemaVersion: 1, campaign: draft.concept, publication: draft.publication,
      channel, campaign_url: publications[draft.publication].url,
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
  root.SubscriptionCampaigns = Object.freeze({ publications, concepts, createDraft, normalizeHandoff, storyUrl, conversionHandoff });
})(globalThis);
