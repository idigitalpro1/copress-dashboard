# Sept. 24 weekly email review packet

Status: implemented locally for review; not deployed; not sent.

## Weekly Register-Call

- Issue: Sept. 24, 2026
- PDF: https://registercall.com/issues/wrc-2026-09-24.pdf
- Front page: https://registercall.com/issues/wrc-2026-09-24-frontpage.png
- UTM campaign: `wrc-2026-09-24-weekly`
- Loaded stories: exactly three verified front-page leads
  1. `BH: No Briggs Lot, no collaboration`
  2. `Despite Central vs. RCI court case, it’s business as usual`
  3. `Floyd Hill I-70 project enters its fourth construction season`
- Link policy: all three story links and the full-issue CTA open the published issue PDF.

## The Villager

- Issue label: Sept. 24, 2026
- UTM campaign: `villager-2026-09-24-weekly`
- Loaded stories:
  1. Hall of Fame Sept. 24 column
  2. Centennial Chalk Art Festival winners
  3. Magic of the Jack O’Lanterns at Hudson Gardens
  4. Arapahoe County District 2 commissioner candidates
  5. Arapahoe County District 4 commissioner candidates
- Link policy: each story opens its maintained `thevillager.today/article/...` route.

## Operator gate

Before any external delivery, an operator must confirm:

1. The issue/date and all destinations still resolve.
2. The final subject and preview text are approved.
3. From name, from email and reply-to are correct for the selected publication.
4. The intended subscriber lists and total recipient count are correct.
5. A one-recipient proof has been reviewed on desktop and mobile.
6. Live Sendy delivery has been explicitly connected and authorized elsewhere.

The current studio cannot perform a subscriber-list send. Browser-local Sendy
credentials enable configuration persistence only; preview and HTML export remain
the safe handoff. Exported templates retain Sendy's `[unsubscribe]` and
`[webversion]` replacement tags; verify both in the one-recipient proof.
