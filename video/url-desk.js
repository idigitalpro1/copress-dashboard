// URL-to-video desk (admin). Uses the Studio session; the server fetches the page and drafts
// copy with Gemini (GEMINI_KEY_COPY). Output is saved as a draft only.
const $ = id => document.getElementById(id);
const WS_KEY = 'satcom-studio-workspace';
const state = { workspace: new URLSearchParams(location.search).get('workspace') || localStorage.getItem(WS_KEY) || 'my-properties', status: null };

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'class') node.className = v; else if (v !== undefined && v !== null) node.setAttribute(k, v); }
  for (const c of children) node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return node;
}
function setStatus(id, text, isError = false) { const n = $(id); n.textContent = text; n.classList.toggle('error', isError); }

async function api(op, payload = {}) {
  const response = await fetch('/api/studio', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Studio-Request': '1' },
    body: JSON.stringify({ op, workspace: state.workspace, ...payload }),
  });
  let body = {};
  try { body = await response.json(); } catch { /* ignore */ }
  if (response.status === 401 && op !== 'login') showGate(true);
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

function showGate(needLogin, message) {
  $('gate').hidden = false; $('desk').hidden = true; $('logout').hidden = true;
  $('login-form').hidden = !needLogin;
  $('gate-status').textContent = message || (needLogin ? 'Sign in with the studio password.' : '');
}

async function boot() {
  let status;
  try {
    const r = await fetch(`/api/studio?workspace=${encodeURIComponent(state.workspace)}`, { credentials: 'same-origin' });
    status = r.status === 400 ? await (await fetch('/api/studio', { credentials: 'same-origin' })).json() : await r.json();
  } catch { return showGate(false, 'The studio API is unavailable.'); }
  if (!status.enabled) return showGate(false, status.note || 'Video Studio is disabled.');
  if (!status.authenticated) return showGate(true);
  state.status = status; state.workspace = status.workspace;
  $('gate').hidden = true; $('desk').hidden = false; $('logout').hidden = false;
  $('workspace').replaceChildren(...status.workspaces.map(w => el('option', { value: w.id }, w.label + (w.kind === 'client' ? ' (client)' : ''))));
  $('workspace').value = state.workspace;
  $('brand').replaceChildren(el('option', { value: '' }, 'None'), ...status.brands.map(b => el('option', { value: b.id }, b.label)));
  $('notes').replaceChildren(...status.notes.filter(n => /GEMINI|Cloudinary/.test(n)).map(n => el('li', {}, n)));
  const ok = status.features.url_desk;
  $('go').disabled = !ok;
  if (!ok) setStatus('status', 'The desk needs Cloudinary and GEMINI_KEY_COPY on the server.', true);
}

function section(title, ...children) { return el('div', {}, el('h3', {}, title), ...children); }

function renderResult(r) {
  const d = r.draft;
  const hook = d.video_generation || {};
  $('result').hidden = false;
  $('result').replaceChildren(
    el('h2', {}, 'Draft saved'),
    el('p', { class: 'callout' }, `${r.note} Workspace: ${d.workspace}. Status: ${d.status}, published: ${d.published}. YouTube privacy when published later: ${d.youtube.privacy}.`),
    section('Title', el('p', {}, d.title)),
    section('Description', el('p', {}, d.description)),
    section('Tags', el('p', {}, d.tags.join(', ') || '(none)')),
    section(`Script · about ${d.target_seconds}s`,
      el('p', {}, el('strong', {}, 'Hook: '), d.script.hook),
      el('ol', {}, ...d.script.scenes.map(s => el('li', {}, el('div', {}, s.narration), el('div', { class: 'muted small' }, `On screen: ${s.visual}`)))),
      el('p', {}, el('strong', {}, 'Outro: '), d.script.outro)),
    el('p', { class: 'disclosure' }, `${d.disclosure.line} Any video made from this script keeps YouTube's altered/synthetic disclosure on.`),
    el('p', { class: 'muted small' }, `Video generation: ${hook.status || 'not_requested'}${hook.note ? ' · ' + hook.note : ''}`),
    el('p', { class: 'muted small' }, `Source: ${d.source.url}. ${d.review.note}`),
    el('p', {}, el('a', { class: 'button', href: `/video/studio?workspace=${encodeURIComponent(d.workspace)}` }, 'Open the review queue in Studio')),
  );
}

function wire() {
  $('login-form').addEventListener('submit', async e => {
    e.preventDefault(); setStatus('login-error', '');
    try { await api('login', { password: $('password').value }); $('password').value = ''; await boot(); }
    catch (err) { setStatus('login-error', err.message, true); }
  });
  $('logout').addEventListener('click', async () => { await api('logout').catch(() => {}); showGate(true); });
  $('workspace').addEventListener('change', e => { state.workspace = e.target.value; localStorage.setItem(WS_KEY, state.workspace); $('result').hidden = true; });
  $('desk-form').addEventListener('submit', async e => {
    e.preventDefault();
    $('go').disabled = true; setStatus('status', 'Fetching the page and drafting…');
    try {
      const r = await api('url-desk-draft', {
        url: $('url').value, brand: $('brand').value || undefined, seconds: Number($('seconds').value) || 30,
        angle: $('angle').value, request_video: $('request-video').checked,
      });
      setStatus('status', 'Draft saved.'); renderResult(r);
    } catch (err) { setStatus('status', err.message, true); }
    finally { $('go').disabled = !state.status?.features?.url_desk; }
  });
}

wire();
boot();
