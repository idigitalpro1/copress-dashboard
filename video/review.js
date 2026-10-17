const status = document.getElementById('status');
const list = document.getElementById('list');
let csrf = '';

function message(text) {
  status.textContent = text;
}

function player(item) {
  const screen = document.createElement('div');
  screen.className = 'screen';
  const playback = item.playback || {};
  if (playback.type === 'youtube' && playback.video_id) {
    const frame = document.createElement('iframe');
    frame.src = `https://www.youtube-nocookie.com/embed/${playback.video_id}`;
    frame.title = item.title;
    frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    frame.allowFullscreen = true;
    screen.append(frame);
  } else if (playback.url) {
    const video = document.createElement('video');
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    if (item.poster_url) video.poster = item.poster_url;
    video.src = playback.url;
    screen.append(video);
  } else {
    const empty = document.createElement('p');
    empty.textContent = 'No preview is available.';
    screen.append(empty);
  }
  return screen;
}

function card(item) {
  const box = document.createElement('article');
  box.className = 'card';
  const heading = document.createElement('h2');
  heading.textContent = item.title;
  const meta = document.createElement('p');
  meta.className = 'muted';
  meta.textContent = `${item.credit} · code ${item.short_code}`;
  const description = document.createElement('p');
  description.textContent = item.description || '';
  const reason = document.createElement('textarea');
  reason.rows = 2;
  reason.placeholder = 'Optional reason';
  const actions = document.createElement('div');
  const approve = document.createElement('button');
  approve.type = 'button';
  approve.className = 'approve';
  approve.textContent = 'Approve';
  const reject = document.createElement('button');
  reject.type = 'button';
  reject.className = 'reject';
  reject.textContent = 'Reject';
  async function decide(decision) {
    approve.disabled = reject.disabled = true;
    const response = await fetch('/api/video-review-decide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, decision, reason: reason.value, csrf }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      message(body.error || 'Could not record that decision.');
      approve.disabled = reject.disabled = false;
      return;
    }
    box.remove();
    message(`${item.title} is ${body.video.status}.`);
    if (!list.children.length) render([]);
  }
  approve.addEventListener('click', () => decide('approve'));
  reject.addEventListener('click', () => decide('reject'));
  actions.append(approve, reject);
  box.append(heading, meta, description, player(item), reason, actions);
  return box;
}

function render(items) {
  list.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No videos are waiting for review.';
    list.append(empty);
    return;
  }
  items.forEach(item => list.append(card(item)));
}

async function load() {
  const response = await fetch('/api/video-review-pending');
  const body = await response.json().catch(() => ({}));
  if (response.status === 401) {
    message(body.error || 'Open the secure link from your SMS and tap Continue.');
  } else if (!response.ok) {
    message(body.error || 'Video review is not configured on this deployment.');
  } else {
    csrf = body.csrf;
    message(body.count ? `${body.count} waiting for review.` : 'No videos are waiting for review.');
    render(body.items || []);
  }
}
load();
