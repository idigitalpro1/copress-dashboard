# CoNews Contributor Onboarding CTA Pattern

Status: PROV-505 build artifact  
Generated: 2026-05-14  
Canonical public intake: `https://onboarding.copress.news`  
Scope: writers, photographers, videographers, event submitters, community tips

## Goal

Give every town page a clear, first-screen path for people to send Colorado News Press photos, video, tips, events, letters, and draft story material without relying on local/internal links.

## Primary CTA

Label:
`Upload Photos, Video, or Story`

URL:
`https://onboarding.copress.news`

Placement:
- Top of contributor, submit, events, sports, photo, and visitor-guide pages.
- Above long instructions.
- Repeated near the bottom after requirements.

Support text:
`Send photos, video, captions, event notes, or story tips to Colorado News Press for editorial review.`

## Secondary CTAs

| Label | Use | Route |
|---|---|---|
| Submit a News Tip | civic, schools, public safety, local business tips | `https://onboarding.copress.news` |
| Upload Event Photos | sports, concerts, festivals, community events | `https://onboarding.copress.news` |
| Send Apple Photos / Video | iPhone photo/video handoff | `https://onboarding.copress.news` |
| Submit an Event | calendar and RSVP candidates | `https://onboarding.copress.news` |
| Send a Letter | LTO and opinion queue | `https://onboarding.copress.news` |

## Upload Instructions

Ask contributors to include:

- name
- email
- phone
- town
- date
- location
- people pictured, if known
- caption notes
- credit line
- article or event topic
- permission/rights note

Supported file guidance:

- Photos: JPG, PNG, HEIC export acceptable if converted by intake system.
- Video: MP4 or MOV preferred.
- Documents: DOCX, PDF, TXT, or pasted text.
- Apple Photos: export originals when possible before uploading.

## Editorial Review Rule

Nothing submitted through the CTA publishes directly.

Required states:

1. received
2. needs caption/source review
3. approved for editorial use
4. scheduled or published
5. rejected/archived

## Safety Rules

- Do not expose local file paths.
- Do not expose private upload tokens.
- Do not use personal phone numbers as public upload links.
- Do not promise publication.
- Do not mark delivery confirmed unless the provider or editor confirms receipt.

## Town Page Implementation

Every town can reuse the same CTA object, but should pass local metadata:

- `town`
- `canonicalHost`
- `editorialLead`
- `primaryPillars`
- `defaultAssignmentQueue`

Example intro:

`Have Morrison / Red Rocks photos, video, tips, or event notes? Upload them to Colorado News Press for review. Include captions, names, location, date, and credit line.`

## SATCOM Acceptance

- CTA path is visible in the first screen of contributor surfaces.
- CTA uses the reviewed public onboarding route.
- Upload guidance mentions Apple Photos export originals.
- Photo/video/editorial/LTO/event lanes are separated.
- No secrets, private local links, or unreviewed phone/SMS paths are published.
