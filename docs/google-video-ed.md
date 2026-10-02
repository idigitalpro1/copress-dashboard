# Google Video Ed connection

Verified 2026-09-30 against codex LOCKED_DECISIONS.yaml version 1, blob 4c2364174c9065ca2ef3037638035162ee1e25e0.

The Google Cloud project gen-lang-client-0922902605 has ACE Video Ed deployed in us-central1:
- ace-video-tools: private operator API, /videos, /clips, /requests/{request_id}, /drafts/{video_id}, /publish and /feed.
- ace-video-ed-worker: Cloud Run job. Ready; no executions observed.
- ace-video-feed: public read-only approved clip feed at https://ace-video-feed-n6gpuizpja-uc.a.run.app/api/video-feed.

This corrects VIDEO_DESK_PLAN.md's older undeployed survey. Resources exist; new edit processing is not yet end-to-end verified. /videos?limit=5 returned no Drive videos during this check. A direct Vertex Gemini smoke request using the available idigitalpro@gmail.com CLI account returned 403 for aiplatform.endpoints.predict; that does not prove the worker service account lacks access.

## SATCOM player connection

Set these two server-side variables for the reviewed deployment:

    VIDEO_FEED_URL=https://ace-video-feed-n6gpuizpja-uc.a.run.app/api/video-feed
    VIDEO_FEED_FORMAT=google-video-ed

No token is required for this public published-only feed. Never configure this adapter with /videos or /drafts. The adapter projects approved feed records to the existing /api/videos contract, preserving known author credits and rejecting draft flags, non-clip paths, query tokens and invalid metadata. Unknown authors receive the neutral network desk credit until editorial metadata is added. Feed failures return unavailable, never fabricated content. With these variables absent, the existing catalog behavior remains available as rollback.

All sites can keep using the existing SATCOM embed and /api/videos filters; this is one shared catalog. Cloud Run AUTO_PUBLISH remains false. This connection does not call /publish, execute workers, or grant IAM permissions.

## Validation

156 tests and build passed locally. Approved Google feed returned Paul's rodeo clip; its Google Storage MP4 returned HTTP 200 and video/mp4. Preview deployment and browser verification must precede production.
