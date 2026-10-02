import test from 'node:test';
import assert from 'node:assert/strict';
import { publicCatalog, feedQuery, readCatalog, googleVideoCatalog } from '../lib/video-feed.js';
import { createVideoHandler } from '../api/videos.js';

const now = Date.parse('2026-09-27T02:00:00Z');
const clip = overrides => ({
  id: 'field-report', title: 'A report', creator: 'paul-hill', credit: 'Paul Hill',
  publications: ['weekly-register-call'], towns: ['idaho-springs'], status: 'published',
  published_at: '2026-09-26T18:00:00Z', playback: { type: 'mp4', url: 'https://media.example.org/report.mp4' }, ...overrides,
});
const catalog = items => ({ version: 1, items });
const googleClip = overrides => ({id:'field-report',title:'Approved highlight',clip_url:'https://storage.googleapis.com/5280-menu-video-pipeline-bucket/clips/field-report.mp4',created_at:'2026-09-26T18:00:00Z',...overrides});
test('Google approved feed preserves known credits and strips private fields', () => {
  const result=googleVideoCatalog({items:[googleClip({drive_id:'private',notes:'secret'})]},catalog([clip({})]));
  const videos=publicCatalog(result,now);
  assert.equal(videos[0].creator,'paul-hill');
  assert.equal(videos[0].credit,'Paul Hill');
  assert.equal(videos[0].playback.url,googleClip().clip_url);
  assert.doesNotMatch(JSON.stringify(videos),/private|secret|drive_id/);
  assert.deepEqual(googleVideoCatalog({items:[]}).items,[]);
});
test('Google adapter refuses drafts, private paths and malformed publication metadata', () => {
  for(const changes of [{status:'draft'},{published:false},{clip_url:'https://storage.googleapis.com/5280-menu-video-pipeline-bucket/drafts/x.mp4'},{clip_url:'https://other.example/x.mp4'},{created_at:'invalid'},{clip_url:googleClip().clip_url+'?token=secret'}]) {
    assert.throws(()=>googleVideoCatalog({items:[googleClip(changes)]}));
  }
});
function response() {
  return { headers: {}, statusCode: 0, body: undefined, setHeader(k,v) { this.headers[k] = v; }, end(v) { this.body = v; } };
}

test('only published, due items and public fields leave the API', () => {
  const videos = publicCatalog(catalog([
    { status: 'draft', title: 'Private notes', drive_id: 'private-original' },
    clip({ id: 'future', published_at: '2026-10-01T00:00:00Z' }),
    clip({ internal_notes: 'do not publish', source_drive_url: 'private', approval_token: 'secret' }),
  ]), now);
  assert.equal(videos.length, 1);
  assert.equal(videos[0].id, 'field-report');
  assert.doesNotMatch(JSON.stringify(videos), /private|secret|internal_notes|source_drive/);
});
test('live badges expire and future confirmations are rejected as live', () => {
  const videos = publicCatalog(catalog([
    clip({ id:'stale', kind:'live', live_confirmed_at:'2026-09-27T01:57:59Z' }),
    clip({ id:'now', kind:'live', live_confirmed_at:'2026-09-27T01:59:30Z' }),
    clip({ id:'future', kind:'live', live_confirmed_at:'2026-09-27T02:00:30Z' }),
    clip({ id:'no-confirmation', kind:'live' }),
  ]), now);
  assert.equal(videos[0].id, 'now');
  assert.equal(videos[0].live_status, 'live');
  assert.ok(videos.slice(1).every(v => v.live_status === 'unconfirmed'));
  assert.equal(publicCatalog(catalog([clip({kind:'live', live_confirmed_at:'2026-09-27T01:59:30Z'})]), now+120000)[0].live_status,'unconfirmed');
});
test('invalid playback, duplicate IDs and malformed queries fail closed', () => {
  for (const url of ['javascript:alert(1)', 'http://media.example.org/x.mp4', 'https://user:password@example.org/x']) {
    assert.throws(() => publicCatalog(catalog([clip({ playback:{type:'mp4',url} })]),now));
  }
  assert.throws(() => publicCatalog(catalog([clip({}),clip({})]),now));
  assert.throws(() => publicCatalog(catalog([clip({ playback:{type:'youtube',video_id:'bad"onload='} })]),now));
  for (const query of ['limit=51','limit=-1','limit=x','creator=x&creator=y','town=<script>']) assert.throws(() => feedQuery(new URLSearchParams(query)));
});
test('API supports public cross-domain filtering, limits and head requests', async () => {
  const handler = createVideoHandler(async () => ({ catalog:catalog([
    clip({id:'a'}), clip({id:'b',publications:['network']}), clip({id:'c',creator:'another-reporter'}),
  ]), source:'test' }), () => now);
  const res = response(); await handler({method:'GET',url:'/api/videos?creator=paul-hill&publication=the-villager&limit=1'},res);
  assert.equal(res.statusCode,200); assert.equal(res.headers['Access-Control-Allow-Origin'],'*');
  assert.equal(JSON.parse(res.body).items[0].id,'b'); assert.equal(JSON.parse(res.body).count,1);
  const head=response(); await handler({method:'HEAD',url:'/api/videos'},head); assert.equal(head.statusCode,200); assert.equal(head.body,undefined);
  const invalid=response(); await handler({method:'GET',url:'/api/videos?limit=0'},invalid); assert.equal(invalid.statusCode,400);
});
test('write requests never call the source and failures never echo credentials', async () => {
  let reads=0; const handler=createVideoHandler(async()=>{reads++;throw new Error('https://secret:token@example.org');});
  const write=response(); await handler({method:'POST',url:'/api/videos'},write);assert.equal(write.statusCode,405);assert.equal(reads,0);
  const options=response();await handler({method:'OPTIONS',url:'/api/videos'},options);assert.equal(options.statusCode,204);assert.equal(reads,0);
  const fail=response();await handler({method:'GET',url:'/api/videos'},fail);assert.equal(fail.statusCode,503);assert.doesNotMatch(fail.body,/secret|token|example/);
});
test('an empty catalog is honest, not a sample or simulated live broadcast', async () => {
  const handler=createVideoHandler(async()=>({catalog:catalog([]),source:'catalog'}),()=>now);
  const res=response();await handler({method:'GET',url:'/api/videos'},res);
  assert.equal(JSON.parse(res.body).status,'empty');assert.deepEqual(JSON.parse(res.body).items,[]);
});
test('connected feed uses fixed source, bounded bytes, no redirects and server-only token', async () => {
  let request;
  const env={VIDEO_FEED_URL:'https://media.example.org/feed.json',VIDEO_FEED_TOKEN:'server-secret'};
  const result=await readCatalog({env,fetchImpl:async(url,options)=>{request={url,options};return new Response(JSON.stringify(catalog([clip({})])));}});
  assert.equal(result.source,'connected-feed');assert.equal(request.options.redirect,'error');
  assert.equal(request.options.headers.Authorization,'Bearer server-secret');
  await assert.rejects(readCatalog({env,fetchImpl:async()=>new Response('x'.repeat(2_000_001))}));
  await assert.rejects(readCatalog({env,fetchImpl:async()=>new Response('',{status:503})}));
});
