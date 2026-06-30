#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultCsv = join(repoRoot, 'stans-auto-sales-campaign-kit', 'prospects', 'top-20-prospects.csv');

const args = parseArgs(process.argv.slice(2));
const csvPath = resolve(args.csv || defaultCsv);
const outputRoot = resolve(args.outDir || join(repoRoot, 'generated-campaign-kits'));
const rows = parseCsv(readFileSync(csvPath, 'utf8'));
const selected = selectRow(rows, args);
const kit = buildKitModel(selected.row, selected.index);
const folderName = `${kit.slug}-campaign-kit`;
const kitDir = join(outputRoot, folderName);

if (existsSync(kitDir) && !args.force) {
  fail(`${kitDir} already exists. Re-run with --force to replace generated files.`);
}

writeKit(kitDir, folderName, kit);

console.log(JSON.stringify({
  ok: true,
  input: csvPath,
  row: selected.index,
  id: kit.id,
  title: kit.title,
  output: kitDir,
  publicUrl: kit.publicUrl,
  files: kit.files.length
}, null, 2));

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--force') {
      parsed.force = true;
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) fail(`Missing value for ${arg}`);
      parsed[key] = value;
      i += 1;
    } else {
      fail(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function parseCsv(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(Boolean);
  if (lines.length < 2) fail('CSV must include a header and at least one prospect row.');
  const header = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    return Object.fromEntries(header.map((key, index) => [key, cells[index] || '']));
  });
}

function splitCsvLine(line) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      cells.push(cell);
      cell = '';
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells.map((value) => value.trim());
}

function selectRow(rows, options) {
  if (options.id) {
    const index = rows.findIndex((row) => row.id === options.id);
    if (index < 0) fail(`No prospect found for id ${options.id}`);
    return { row: rows[index], index: index + 1 };
  }
  const rowNumber = Number(options.row || 1);
  if (!Number.isInteger(rowNumber) || rowNumber < 1 || rowNumber > rows.length) {
    fail(`--row must be between 1 and ${rows.length}`);
  }
  return { row: rows[rowNumber - 1], index: rowNumber };
}

function buildKitModel(row, index) {
  const id = value(row.id, `prospect-${String(index).padStart(2, '0')}`);
  const title = value(row.business_name, row.client_name, row.title, `Prospect ${index}`);
  const category = value(row.category, row.title, 'Local business');
  const fit = value(row.fit, 'Local visibility campaign');
  const contactName = value(row.contact_name, row.approval_contact, 'Approval contact pending');
  const phone = value(row.phone, row.main_phone, 'Phone pending');
  const email = value(row.email, row.owner_email, 'Email pending');
  const website = value(row.website, row.business_url, row.client_url, '');
  const prospectUrl = value(row.web_url, row.prospect_url, '');
  const serviceArea = value(row.service_area, 'Local market');
  const offer = value(row.best_offer, row.offer, fit);
  const slug = slugify(value(row.slug, `${id}-${title}`));
  const publicUrl = `https://copress-dashboard.vercel.app/generated-campaign-kits/${slug}-campaign-kit/`;

  return {
    id,
    title,
    category,
    fit,
    contactName,
    phone,
    email,
    website,
    prospectUrl,
    serviceArea,
    offer,
    slug,
    publicUrl,
    emailSubject: value(row.email_subject, `${title} campaign kit preview`),
    smsPrompt: value(row.sms_prompt, `${title} campaign kit preview`),
    files: []
  };
}

function writeKit(root, folderName, kit) {
  const dirs = [
    'audio',
    'banners',
    'crm',
    'editorial',
    'email',
    'handoff',
    'landing-pages',
    'pricing',
    'print',
    'seo',
    'social'
  ];
  mkdirSync(root, { recursive: true });
  for (const dir of dirs) mkdirSync(join(root, dir), { recursive: true });

  const deliverables = {
    showcase: 'index.html',
    banners: [
      'banners/banner-leaderboard-728x90.html',
      'banners/banner-medium-rect-300x250.html',
      'banners/banner-skyscraper-160x600.html',
      'banners/banner-half-page-300x600.html',
      'banners/banner-mobile-320x50.html',
      'banners/banner-social-square-1080x1080.html'
    ],
    email: ['email/newsletter-feature.html'],
    editorial: [
      'editorial/campaign-copy.md',
      'editorial/sponsored-editorial-sample.md',
      'editorial/social-media-copy.md'
    ],
    social: [
      'social/social-card-local-search.html',
      'social/social-card-weekend-reminder.html'
    ],
    landingPages: [`landing-pages/${kit.slug}-5280-menu.html`],
    pricing: ['pricing/menu-pricing.md'],
    print: ['print/service-card.md', 'print/direct-mail-postcard.md'],
    audio: ['audio/radio-spot.md'],
    crm: ['crm/drip-sequence.md'],
    handoff: [
      'handoff/owner-sms.txt',
      'handoff/owner-email.md',
      'handoff/production-kanban.json',
      'handoff/linear-kanban-manus-template.md',
      'handoff/linear-kanban-manus-template.json'
    ],
    seo: ['seo/meta.json', 'seo/jsonld.json']
  };

  const manifest = {
    campaign: `${kit.title} - Local Visibility Campaign`,
    brand: kit.title,
    version: '0.1.0',
    created: new Date().toISOString().slice(0, 10),
    sourcePattern: "Stan's Auto Sales campaign kit generator",
    sourceProspectId: kit.id,
    sourceUrl: kit.website,
    sourceProspectUrl: kit.prospectUrl,
    audience: [
      `${kit.serviceArea} customers`,
      'Local readers comparing trusted providers',
      'Prospects who need a simple call, click, or visit path'
    ],
    positioning: kit.fit,
    deliverables,
    contact: {
      name: kit.contactName,
      phone: kit.phone,
      email: kit.email,
      website: kit.website,
      prospectUrl: kit.prospectUrl
    },
    claimGuidance: claimGuardrail(kit),
    modelPolicy: 'free-local-models',
    artRoute: 'Use owner-approved photos or category-safe placeholders before publication.'
  };

  write(root, kit, 'manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
  write(root, kit, 'index.html', indexHtml(kit, deliverables));
  write(root, kit, 'editorial/campaign-copy.md', campaignCopy(kit));
  write(root, kit, 'editorial/social-media-copy.md', socialCopy(kit));
  write(root, kit, 'editorial/sponsored-editorial-sample.md', sponsoredEditorial(kit));
  write(root, kit, 'email/newsletter-feature.html', emailHtml(kit));
  write(root, kit, `landing-pages/${kit.slug}-5280-menu.html`, landingHtml(kit));
  write(root, kit, 'pricing/menu-pricing.md', pricingMarkdown(kit));
  write(root, kit, 'print/service-card.md', serviceCard(kit));
  write(root, kit, 'print/direct-mail-postcard.md', directMail(kit));
  write(root, kit, 'audio/radio-spot.md', radioSpot(kit));
  write(root, kit, 'crm/drip-sequence.md', dripSequence(kit));
  write(root, kit, 'handoff/owner-sms.txt', ownerSms(kit));
  write(root, kit, 'handoff/owner-email.md', ownerEmail(kit));
  write(root, kit, 'handoff/production-kanban.json', `${JSON.stringify(kanban(kit), null, 2)}\n`);
  write(root, kit, 'handoff/linear-kanban-manus-template.md', linearTemplateMarkdown(kit));
  write(root, kit, 'handoff/linear-kanban-manus-template.json', `${JSON.stringify(linearTemplateJson(kit), null, 2)}\n`);
  write(root, kit, 'seo/meta.json', `${JSON.stringify(metaJson(kit, folderName), null, 2)}\n`);
  write(root, kit, 'seo/jsonld.json', `${JSON.stringify(jsonLd(kit), null, 2)}\n`);

  const banners = [
    ['banner-leaderboard-728x90.html', 728, 90, 'Local visibility starts here'],
    ['banner-medium-rect-300x250.html', 300, 250, 'A local campaign built for action'],
    ['banner-skyscraper-160x600.html', 160, 600, 'Trusted local route'],
    ['banner-half-page-300x600.html', 300, 600, 'Claim-safe campaign kit'],
    ['banner-mobile-320x50.html', 320, 50, 'Call, click, or visit'],
    ['banner-social-square-1080x1080.html', 1080, 1080, 'Shop local with confidence']
  ];
  for (const [file, width, height, line] of banners) {
    write(root, kit, `banners/${file}`, bannerHtml(kit, width, height, line));
  }

  write(root, kit, 'social/social-card-local-search.html', socialCardHtml(kit, 'Local search, clearer next step'));
  write(root, kit, 'social/social-card-weekend-reminder.html', socialCardHtml(kit, 'This week: verify, approve, publish'));
}

function write(root, kit, relativePath, content) {
  const path = join(root, relativePath);
  writeFileSync(path, cleanContent(content));
  kit.files.push(relativePath);
}

function cleanContent(content) {
  return `${String(content).replace(/[ \t]+$/gm, '').replace(/\n*$/, '')}\n`;
}

function indexHtml(kit, deliverables) {
  const rows = [
    ['Showcase', deliverables.showcase],
    ['Banners', `${deliverables.banners.length} formats`],
    ['Newsletter', deliverables.email[0]],
    ['Pricing', deliverables.pricing[0]],
    ['Kanban', 'handoff/production-kanban.json'],
    ['Owner handoff', 'owner SMS and email']
  ];
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(kit.title)} Campaign Kit</title>
  <style>
    :root{--ink:#172024;--paper:#f7f2e9;--line:#d7ccbc;--accent:#2f7f65;--gold:#c79635}
    *{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;background:var(--paper);color:var(--ink);line-height:1.55}
    header,section,footer{padding:48px max(24px,calc((100vw - 1040px)/2))}
    header{background:#11191c;color:#fff}h1{font-size:clamp(40px,6vw,76px);line-height:.95;margin:18px 0}h2{font-size:32px;margin:0 0 18px}
    .eyebrow,.label{font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--gold);font-size:12px}
    .actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px}.button{display:inline-block;padding:12px 16px;border:1px solid currentColor;color:inherit;text-decoration:none;font-weight:800}
    .button.primary{background:var(--accent);border-color:var(--accent);color:#fff}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}
    .card{border:1px solid var(--line);background:#fffaf2;padding:18px}.card b{display:block;margin-bottom:8px}.band{background:#fffaf2}.notice{border-left:5px solid var(--accent);padding:18px;background:#fff;margin-top:24px}
    pre{white-space:pre-wrap;background:#11191c;color:#fff;padding:18px;overflow:auto}.list{padding-left:20px}.small{font-size:14px;color:#536066}
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">Generated Stans-style campaign kit</div>
    <h1>${esc(kit.title)}</h1>
    <p>${esc(kit.fit)}</p>
    <div class="actions">
      ${kit.prospectUrl ? `<a class="button primary" href="${attr(kit.prospectUrl)}" target="_blank" rel="noopener">Open Prospect Link</a>` : ''}
      ${kit.website ? `<a class="button" href="${attr(kit.website)}" target="_blank" rel="noopener">Open Website</a>` : ''}
      <a class="button" href="./handoff/owner-email.md">Owner Email</a>
      <a class="button" href="./pricing/menu-pricing.md">Pricing</a>
    </div>
  </header>
  <section>
    <div class="grid">
      <article class="card"><span class="label">Category</span><b>${esc(kit.category)}</b><span>${esc(kit.offer)}</span></article>
      <article class="card"><span class="label">Contact</span><b>${esc(kit.contactName)}</b><span>${esc(kit.phone)}<br>${esc(kit.email)}</span></article>
      <article class="card"><span class="label">Service area</span><b>${esc(kit.serviceArea)}</b><span>Confirm actual geography before publishing.</span></article>
    </div>
    <div class="notice">${esc(claimGuardrail(kit))}</div>
  </section>
  <section class="band">
    <h2>Deliverables</h2>
    <div class="grid">
      ${rows.map(([label, detail]) => `<article class="card"><b>${esc(label)}</b><span>${esc(detail)}</span></article>`).join('\n      ')}
    </div>
  </section>
  <section>
    <h2>Submission Handoff</h2>
    <p>Send one public preview link, then ask the owner to approve facts, offer language, contact routing, and the first placement lane.</p>
    <pre>${esc(ownerSms(kit))}</pre>
  </section>
  <footer>
    <span class="small">Generated from ${esc(kit.id)}. Review every claim before publication.</span>
  </footer>
</body>
</html>
`;
}

function bannerHtml(kit, width, height, line) {
  const font = width <= 320 ? 15 : width >= 1000 ? 56 : 24;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(kit.title)} ${width}x${height}</title>
  <style>
    body{margin:0;display:grid;place-items:center;min-height:100vh;background:#ece5d8;font-family:Arial,Helvetica,sans-serif}
    .ad{width:${width}px;height:${height}px;max-width:100vw;max-height:100vh;background:#142126;color:#fff;border:1px solid #d2a446;display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;padding:${Math.max(8, Math.round(width / 24))}px;overflow:hidden}
    h1{font-size:${font}px;line-height:.95;margin:0}.tag{font-weight:800;color:#e2b04d;text-transform:uppercase;font-size:${Math.max(10, Math.round(font / 2.8))}px}.cta{background:#2f7f65;color:#fff;padding:8px 10px;font-weight:800;white-space:nowrap}
  </style>
</head>
<body>
  <section class="ad" aria-label="${attr(kit.title)} campaign ad">
    <div><div class="tag">${esc(kit.category)}</div><h1>${esc(line)}</h1></div>
    <div class="cta">Verify + approve</div>
  </section>
</body>
</html>
`;
}

function socialCardHtml(kit, line) {
  return bannerHtml(kit, 1080, 1080, line).replace('Verify + approve', 'Shop local');
}

function emailHtml(kit) {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${esc(kit.title)} Newsletter Feature</title></head>
<body style="margin:0;background:#f7f2e9;font-family:Arial,Helvetica,sans-serif;color:#172024">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px">
    <table role="presentation" width="620" cellpadding="0" cellspacing="0" style="max-width:100%;background:#fff;border:1px solid #d7ccbc">
      <tr><td style="padding:28px">
        <p style="text-transform:uppercase;font-weight:800;color:#b47b2c;font-size:12px">${esc(kit.category)}</p>
        <h1 style="font-size:34px;line-height:1;margin:0 0 14px">${esc(kit.title)}</h1>
        <p>${esc(kit.fit)}</p>
        <p><strong>Next step:</strong> approve the contact route, current offer, and any regulated or time-sensitive claims before this block runs.</p>
        ${kit.prospectUrl ? `<p><a href="${attr(kit.prospectUrl)}" style="background:#2f7f65;color:#fff;padding:12px 16px;text-decoration:none;font-weight:800">Open prospect link</a></p>` : ''}
        ${kit.website ? `<p><a href="${attr(kit.website)}">Open website</a></p>` : ''}
      </td></tr>
    </table>
  </td></tr></table>
</body>
</html>
`;
}

function landingHtml(kit) {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(kit.title)} Local Landing</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;margin:0;background:#f7f2e9;color:#172024">
  <main style="max-width:760px;margin:0 auto;padding:56px 24px">
    <p style="font-weight:800;text-transform:uppercase;color:#b47b2c">${esc(kit.category)}</p>
    <h1>${esc(kit.title)}</h1>
    <p>${esc(kit.fit)}</p>
    <p>${esc(claimGuardrail(kit))}</p>
    ${kit.prospectUrl ? `<p><a href="${attr(kit.prospectUrl)}">Open prospect link</a></p>` : ''}
    ${kit.website ? `<p><a href="${attr(kit.website)}">Open website</a></p>` : ''}
  </main>
</body>
</html>
`;
}

function campaignCopy(kit) {
  return `# ${kit.title} Campaign Copy

Campaign ID: ${kit.id}
Category: ${kit.category}
Positioning: ${kit.fit}

## Core Offer

${kit.offer}

## Audience

- Local customers in ${kit.serviceArea}
- Readers comparing trusted providers
- Prospects who need a simple call, click, or visit path

## CTA

Approve the public source link, contact route, and first placement lane.

## Claim Guardrail

${claimGuardrail(kit)}
`;
}

function socialCopy(kit) {
  return `# ${kit.title} Social Copy

Short:
${kit.title} now has a local campaign kit ready for owner review.

Trust:
Before anything publishes, the owner verifies the current offer, contact path, and any time-sensitive claims.

CTA:
Review the kit, approve the facts, and pick the first placement lane.
`;
}

function sponsoredEditorial(kit) {
  return `# Sponsored Editorial Draft: ${kit.title}

${kit.title} fits a practical local visibility lane: ${kit.fit}

The campaign should stay useful and claim-safe. Lead with the category, service area, contact path, and owner-approved offer. Avoid guarantees, rates, prices, inventory, availability, or regulated claims unless the business confirms them before publication.
`;
}

function pricingMarkdown() {
  return `# Campaign Placement Pricing

## Monthly Plan

Unlimited Queue - $50/month

Includes up to 10 approved posts per month after SATCOM review.

## Immediate Menu

| Placement | Price | Notes |
| --- | ---: | --- |
| Social post/card | $5 | One social card or Shop Local update |
| Banner placement | $15 | Leaderboard, mobile, or display slot |
| Newsletter block | $20 | Sponsored feature block |
| Sponsored editorial | $25 | Web article or advertorial draft |
| Radio/audio read | $15 | 15s or 30s read/script placement |
| Landing-page update | $35 | 5280.menu style web update |
| Print/direct mail | $20 | Service card, postcard, or counter insert |

All claims require owner approval before publication.
`;
}

function serviceCard(kit) {
  return `# ${kit.title} Service Card

${kit.category}

Offer focus:
${kit.offer}

Contact:
${kit.contactName}
${kit.phone}
${kit.email}

Verification:
${claimGuardrail(kit)}
`;
}

function directMail(kit) {
  return `# ${kit.title} Direct Mail Postcard

Front:
${kit.title}
${kit.fit}

Back:
Review the current offer, contact path, and service area before this postcard is printed or mailed.

Contact:
${kit.contactName} | ${kit.phone} | ${kit.email}
`;
}

function radioSpot(kit) {
  return `# ${kit.title} Radio / Audio Spot

Length: 15 seconds

Looking for a local option in ${kit.serviceArea}? ${kit.title} is preparing a claim-safe local campaign for ${kit.category}. Check the current offer, confirm details, and contact ${kit.contactName}. Details must be verified before publication.
`;
}

function dripSequence(kit) {
  return `# ${kit.title} CRM Drip Sequence

Day 0 - Owner review:
Share the campaign kit and request approval on contact, offer, and claim guardrails.

Day 2 - Category proof:
Confirm why ${kit.category} is a good fit for the local campaign lane.

Day 5 - First placement:
Pick newsletter, banner, social, landing page, print, or audio.

Day 8 - Claim check:
Reconfirm all time-sensitive details before scheduling.

Day 12 - Publish or pause:
Publish approved assets or move the kit back to owner review.
`;
}

function ownerSms(kit) {
  return `${kit.contactName}, here is the ${kit.title} campaign kit preview: ${kit.publicUrl} It includes the showcase, banners, newsletter block, pricing route, production kanban, SEO, and owner handoff files. Please review the contact info, current offer, service area, and claim guardrail before anything publishes.`;
}

function ownerEmail(kit) {
  return `# ${kit.title} Campaign Kit Handoff

Subject: ${kit.emailSubject}

${kit.contactName},

Here is the ${kit.title} campaign kit preview:

${kit.publicUrl}

The kit includes the owner-facing showcase, banner set, newsletter block, pricing route, production kanban, SEO files, and handoff copy. Before anything publishes, please approve:

- Business/category positioning
- Contact route
- Current offer
- Service area
- Any regulated, price, inventory, availability, or time-sensitive claim

Verification note:
${claimGuardrail(kit)}
`;
}

function kanban(kit) {
  return {
    campaign: kit.title,
    columns: [
      { name: 'Ready', cards: ['Owner review link', 'Initial category positioning', 'Claim guardrail'] },
      { name: 'Design', cards: ['Showcase page', 'Banner set', 'Newsletter block'] },
      { name: 'Copy', cards: ['Campaign copy', 'Social copy', 'Owner email'] },
      { name: 'Send', cards: ['Choose pricing route', 'Attach approved assets', 'Schedule first placement'] },
      { name: 'Track', cards: ['Owner approval', 'Claim check', 'Billing lane'] }
    ]
  };
}

function linearTemplateMarkdown(kit) {
  return `# Linear / Kanban Template: ${kit.title}

Use this template to route the generated campaign kit through SATCOM/CoMSAT.

- Prospect ID: ${kit.id}
- Category: ${kit.category}
- Contact: ${kit.contactName}
- Public preview: ${kit.publicUrl}
- Guardrail: ${claimGuardrail(kit)}
`;
}

function linearTemplateJson(kit) {
  return {
    template: 'generated-stans-style-kit',
    prospectId: kit.id,
    title: `${kit.title} campaign kit`,
    labels: ['campaign-kit', 'owner-review', 'claim-check'],
    checklist: [
      'Owner approves contact route',
      'Owner approves offer',
      'Claim check complete',
      'Pricing route selected',
      'First placement scheduled'
    ]
  };
}

function metaJson(kit, folderName) {
  return {
    title: `${kit.title} Campaign Kit`,
    description: kit.fit,
    canonical: `https://copress-dashboard.vercel.app/generated-campaign-kits/${folderName}/`,
    status: 'draft-review',
    claimGuardrail: claimGuardrail(kit)
  };
}

function jsonLd(kit) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: `${kit.title} Campaign Kit`,
    about: kit.category,
    description: kit.fit,
    url: kit.publicUrl,
    isBasedOn: kit.website || kit.prospectUrl || undefined
  };
}

function claimGuardrail(kit) {
  return `Do not publish prices, guarantees, regulated claims, availability, inventory, financing, warranties, coverage, service-area promises, or time-sensitive offers for ${kit.title} unless the owner verifies them before publication.`;
}

function value(...values) {
  return values.find((item) => typeof item === 'string' && item.trim())?.trim() || '';
}

function slugify(valueToSlug) {
  return valueToSlug
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function esc(valueToEscape) {
  return String(valueToEscape)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function attr(valueToEscape) {
  return esc(valueToEscape).replace(/`/g, '&#96;');
}

function fail(message) {
  console.error(`generate-campaign-kit: ${message}`);
  process.exit(1);
}
