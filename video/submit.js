const status = document.getElementById('status');
const loginForm = document.getElementById('login');
const submitForm = document.getElementById('submit');
let csrf = '';

function slugs(value) {
  return String(value || '').split(',').map(item => item.trim()).filter(Boolean);
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  const data = new FormData(loginForm);
  const response = await fetch('/api/video-review-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user: data.get('user'), password: data.get('password') }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    status.textContent = body.error || 'Sign-in failed.';
    return;
  }
  csrf = body.csrf;
  loginForm.hidden = true;
  submitForm.hidden = false;
  status.textContent = 'Signed in. Submit an approved playback URL, not a Drive folder.';
});

submitForm.addEventListener('submit', async event => {
  event.preventDefault();
  const data = new FormData(submitForm);
  const type = data.get('playback_type');
  const value = String(data.get('playback_value') || '').trim();
  const playback = type === 'youtube' ? { type: 'youtube', video_id: value } : { type, url: value };
  const video = {
    id: data.get('id'),
    title: data.get('title'),
    description: data.get('description') || '',
    creator: data.get('creator'),
    credit: data.get('credit'),
    publications: slugs(data.get('publications')),
    towns: slugs(data.get('towns')),
    kind: data.get('kind'),
    playback,
  };
  if (data.get('poster_url')) video.poster_url = data.get('poster_url');
  const response = await fetch('/api/video-review-submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csrf, video }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    status.textContent = body.error || 'Submit failed.';
    return;
  }
  status.textContent = `Submitted ${body.id} as ${body.short_code}. Reviewers are notified when SMS is enabled.`;
  submitForm.reset();
});
