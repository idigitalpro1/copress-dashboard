const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const feedUrl = new URL('/api/videos', location.origin);
for (const key of ['creator', 'publication', 'town']) if (params.has(key)) feedUrl.searchParams.set(key, params.get(key));
if (!params.has('creator')) feedUrl.searchParams.set('creator', 'paul-hill');
if (params.get('theme') === 'light') document.body.classList.add('light');
if (feedUrl.searchParams.get('creator') !== 'paul-hill') $('channel-title').textContent = 'Stories from across Colorado';
const motion = matchMedia('(prefers-reduced-motion: reduce)');
let rotating = params.get('rotate') !== 'false' && !motion.matches;
let items = [], index = 0, playing = false, hovered = false, focused = false, inView = true;
let hls, hlsPromise, generation = 0, timer, refreshTimer;

function resize() {
  let origin = '*';
  try { origin = new URL(document.referrer).origin; } catch { /* Direct iframe loads have no referrer. */ }
  if (window.parent !== window) window.parent.postMessage({ type: 'cnp-video:resize', height: document.querySelector('.channel').getBoundingClientRect().height }, origin);
}
new ResizeObserver(resize).observe(document.querySelector('.channel'));
new IntersectionObserver(entries => { inView = entries[0].isIntersecting; }).observe(document.querySelector('.channel'));

function cleanMedia() {
  generation += 1;
  hls?.destroy(); hls = null;
  const video = $('media').querySelector('video');
  if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
  $('media').replaceChildren();
  $('screen').classList.remove('playing');
  playing = false;
}

function badge(item) {
  $('badge').textContent = item.live_status === 'live' ? 'Live' : item.kind === 'live' ? 'Live channel · status unconfirmed' : 'Recorded';
  $('badge').classList.toggle('live', item.live_status === 'live');
}

function thumbnail(item) {
  const box = document.createElement('div'); box.className = 'thumb';
  if (item.poster_url) {
    const img = document.createElement('img'); img.src = item.poster_url; img.alt = ''; img.loading = 'lazy';
    img.addEventListener('error', () => { img.remove(); box.textContent = '▶'; }, { once: true }); box.append(img);
  } else box.textContent = '▶';
  return box;
}

function renderPlaylist() {
  $('playlist').replaceChildren(...items.map((item, i) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'clip';
    button.setAttribute('aria-label', `Select video: ${item.title}`);
    button.setAttribute('aria-current', String(index === i));
    const title = document.createElement('strong'); title.textContent = item.title;
    const credit = document.createElement('small'); credit.textContent = item.credit;
    button.append(thumbnail(item), title, credit); button.addEventListener('click', () => select(i));
    return button;
  }));
}

function rotationLabel() {
  $('rotation').textContent = rotating ? 'Pause slideshow' : 'Start slideshow';
  $('rotation').setAttribute('aria-pressed', String(!rotating));
  $('rotation').disabled = items.length < 2;
}

function details() {
  const item = items[index]; if (!item) return;
  $('title').textContent = item.title; $('description').textContent = item.description;
  $('credit').textContent = item.credit; $('position').textContent = `${index + 1} / ${items.length}`;
  $('play').setAttribute('aria-label', `Play video: ${item.title}`);
  badge(item);
  $('previous').disabled = $('next').disabled = items.length < 2;
  rotationLabel();
}

function select(next) {
  if (!items.length) return;
  cleanMedia(); index = (next + items.length) % items.length;
  const item = items[index];
  $('play').hidden = false;
  if (item.poster_url) {
    const img = document.createElement('img'); img.src = item.poster_url; img.alt = '';
    img.addEventListener('error', () => img.remove(), { once: true }); $('media').append(img);
  }
  details();
  [...$('playlist').children].forEach((button, i) => button.setAttribute('aria-current', String(i === index)));
  const selected = $('playlist').children[index];
  if (selected) $('playlist').scrollTo({ left: $('playlist').scrollLeft + selected.getBoundingClientRect().left - $('playlist').getBoundingClientRect().left, behavior: motion.matches ? 'instant' : 'smooth' });
}

function loadHls() {
  if (window.Hls) return Promise.resolve(window.Hls);
  if (!hlsPromise) hlsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = '/video/vendor/hls.min.js';
    script.onload = () => window.Hls ? resolve(window.Hls) : reject(new Error('Player unavailable'));
    script.onerror = () => { script.remove(); hlsPromise = null; reject(new Error('Player unavailable')); };
    document.head.append(script);
  });
  return hlsPromise;
}

function playbackError(item) {
  cleanMedia(); $('play').hidden = true;
  const box = document.createElement('div'); box.className = 'playback-error';
  const text = document.createElement('p'); text.textContent = 'This video could not play here. Try again or open it directly.';
  const link = document.createElement('a'); link.textContent = 'Open video';
  link.href = item.playback.type === 'youtube' ? `https://www.youtube.com/watch?v=${item.playback.video_id}` : item.playback.url;
  link.target = '_blank'; link.rel = 'noopener noreferrer';
  const retry = document.createElement('button'); retry.textContent = 'Try again'; retry.type = 'button'; retry.addEventListener('click', play);
  box.append(text, link, retry); $('media').append(box);
}

async function play() {
  const item = items[index]; if (!item) return;
  cleanMedia(); const attempt = generation; playing = true;
  $('play').hidden = true; $('screen').classList.add('playing');
  if (item.playback.type === 'youtube') {
    const frame = document.createElement('iframe'); frame.title = item.title;
    frame.src = `https://www.youtube-nocookie.com/embed/${item.playback.video_id}?autoplay=1&rel=0`;
    frame.allow = 'autoplay; fullscreen; picture-in-picture'; frame.allowFullscreen = true;
    $('media').append(frame); return;
  }
  const video = document.createElement('video'); video.controls = true; video.playsInline = true; video.preload = 'metadata';
  if (item.poster_url) video.poster = item.poster_url;
  if (item.captions.length) video.crossOrigin = 'anonymous';
  for (const caption of item.captions) {
    const track = document.createElement('track'); track.kind = 'captions'; track.src = caption.url; track.srclang = caption.language; track.label = caption.label; video.append(track);
  }
  video.addEventListener('error', () => { if (attempt === generation) playbackError(item); });
  // Once a viewer opens a player, only their navigation or the end of a clip moves it.
  video.addEventListener('ended', () => { if (attempt === generation) select(index + 1); });
  $('media').append(video);
  try {
    if (item.playback.type === 'hls' && !video.canPlayType('application/vnd.apple.mpegurl')) {
      const Hls = await loadHls(); if (attempt !== generation) return;
      if (!Hls.isSupported()) throw new Error('HLS unavailable');
      hls = new Hls({ enableWorker: true });
      hls.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal && attempt === generation) playbackError(item); });
      hls.loadSource(item.playback.url); hls.attachMedia(video);
    } else video.src = item.playback.url;
    await video.play().catch(() => { /* Native controls remain available if autoplay is blocked. */ });
  } catch { if (attempt === generation) playbackError(item); }
}

async function refresh() {
  clearTimeout(refreshTimer);
  if (document.hidden) { refreshTimer = setTimeout(refresh, 30000); return; }
  try {
    const response = await fetch(feedUrl, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Feed unavailable');
    const data = await response.json();
    if (!Array.isArray(data.items)) throw new Error('Invalid feed');
    const previous = items[index]; items = data.items;
    const current = items.findIndex(item => item.id === previous?.id);
    const samePlayback = current >= 0 && JSON.stringify(previous.playback) === JSON.stringify(items[current].playback);
    index = current >= 0 ? current : 0;
    $('viewer').hidden = !items.length;
    $('feed-message').textContent = items.length ? '' : 'Paul’s next report will appear here when it is published. There are no videos in this feed yet.';
    $('freshness').textContent = 'Feed updates every 30 seconds';
    renderPlaylist();
    if (!items.length) { cleanMedia(); rotationLabel(); }
    else if (samePlayback) details();
    else select(index);
  } catch {
    $('feed-message').textContent = items.length ? 'Updates are temporarily unavailable. Showing the last received playlist.' : 'Videos are temporarily unavailable. We’ll retry shortly.';
    $('freshness').textContent = 'Feed connection unavailable';
    for (const item of items) if (item.kind === 'live') item.live_status = 'unconfirmed';
    if (items.length) badge(items[index]);
  } finally { resize(); refreshTimer = setTimeout(refresh, 30000); }
}

$('play').addEventListener('click', play);
$('previous').addEventListener('click', () => select(index - 1));
$('next').addEventListener('click', () => select(index + 1));
$('rotation').addEventListener('click', () => { rotating = !rotating; rotationLabel(); });
document.querySelector('.channel').addEventListener('mouseenter', () => { hovered = true; });
document.querySelector('.channel').addEventListener('mouseleave', () => { hovered = false; });
document.querySelector('.channel').addEventListener('focusin', () => { focused = true; });
document.querySelector('.channel').addEventListener('focusout', event => { focused = document.querySelector('.channel').contains(event.relatedTarget); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
motion.addEventListener('change', () => { if (motion.matches) { rotating = false; rotationLabel(); } });
timer = setInterval(() => { if (rotating && !playing && !hovered && !focused && inView && !document.hidden && items.length > 1) select(index + 1); }, 8000);
window.addEventListener('pagehide', () => { clearInterval(timer); clearTimeout(refreshTimer); cleanMedia(); });
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
refresh();
