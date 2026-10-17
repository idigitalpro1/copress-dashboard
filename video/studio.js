// SATCOM Video Studio (preview). All credentials stay on the server; the browser only
// receives short-lived upload signatures and signed Cloudinary delivery URLs.
const $ = id => document.getElementById(id);
const WS_KEY = 'satcom-studio-workspace';
const queryWorkspace = new URLSearchParams(location.search).get('workspace');
const state = { status: null, source: null, image: null, outputs: [], brandedImages: [], cues: [], sidecar: null, assetTags: [], publishVersion: null,
  workspace: queryWorkspace || localStorage.getItem(WS_KEY) || 'my-properties' };
const CHUNK = 20 * 1024 * 1024;

async function api(op, payload = {}) {
  const response = await fetch('/api/studio', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Studio-Request': '1' },
    // Every call is scoped to the active workspace; the server re-checks asset ownership.
    body: JSON.stringify({ op, workspace: state.workspace, ...payload }),
  });
  let body = {};
  try { body = await response.json(); } catch { /* ignore */ }
  if (response.status === 401 && op !== 'login') { showGate(true); }
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

function setStatus(id, text, isError = false) { const el = $(id); el.textContent = text; el.classList.toggle('error', isError); }
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v; else if (k.startsWith('on')) node.addEventListener(k.slice(2), v); else if (v !== undefined && v !== null) node.setAttribute(k, v);
  }
  for (const c of children) node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return node;
}
async function busy(button, fn) { button.disabled = true; try { return await fn(); } finally { button.disabled = false; } }

function showGate(needLogin, message) {
  $('gate').hidden = false; $('studio').hidden = true; $('logout').hidden = true;
  $('login-form').hidden = !needLogin;
  $('gate-status').textContent = message || (needLogin ? 'Sign in with the studio password.' : '');
}

async function boot() {
  let status;
  try {
    const r = await fetch(`/api/studio?workspace=${encodeURIComponent(state.workspace)}`, { credentials: 'same-origin' });
    // A stale/unknown saved workspace falls back to My properties instead of locking the page.
    status = r.status === 400 ? await (await fetch('/api/studio', { credentials: 'same-origin' })).json() : await r.json();
  } catch { return showGate(false, 'The studio API is unavailable.'); }
  if (!status.enabled) return showGate(false, status.note || 'Video Studio is disabled.');
  if (!status.authenticated) return showGate(true);
  state.status = status;
  state.workspace = status.workspace || 'my-properties';
  localStorage.setItem(WS_KEY, state.workspace);
  $('gate').hidden = true; $('studio').hidden = false; $('logout').hidden = false;
  renderSetup();
}

function currentWorkspace() { return (state.status?.workspaces || []).find(w => w.id === state.workspace) || { id: state.workspace, label: state.workspace, kind: 'own' }; }

function renderWorkspaces() {
  const list = state.status.workspaces || [];
  const select = $('workspace');
  select.replaceChildren(...list.map(w => el('option', { value: w.id, ...(w.id === state.workspace ? { selected: '' } : {}) },
    `${w.label}${w.kind === 'client' ? ' (client)' : ''}${w.youtube_connected ? ' · YouTube connected' : ''}`)));
  select.value = state.workspace;
  const w = currentWorkspace();
  $('workspace-note').textContent = `${w.description || ''} Uploads, review queue, publish queue and YouTube channel here are separate from the other workspaces.`;
  document.querySelectorAll('[data-ws-name]').forEach(n => { n.textContent = w.label; });
  // Client workspaces start from the client's creator/credit so drafts are never filed under the wrong name.
  if (w.default_creator) { $('draft-creator').value = w.default_creator; $('draft-credit').value = w.default_credit || ''; $('pub-name').value = ''; }
  $('url-desk-link').href = `/video/url-desk?workspace=${encodeURIComponent(state.workspace)}`;
}

function resetForWorkspace() {
  // Clear anything tied to the previous workspace before loading the new one.
  Object.assign(state, { source: null, image: null, outputs: [], brandedImages: [], cues: [], sidecar: null, assetTags: [], publishVersion: null, social: {}, hashtags: [] });
  $('source-video').removeAttribute('src'); $('source-video').load();
  $('source-meta').textContent = 'Select or upload a clip.';
  for (const id of ['pub-title', 'pub-desc', 'pub-tags', 'pub-captions', 'draft-title', 'draft-desc', 'captions-text']) $(id).value = '';
  for (const id of ['rev-title', 'rev-desc', 'rev-captions', 'rev-tags', 'pub-consent']) $(id).checked = false;
  $('pub-jobs').replaceChildren(); $('draft-list').replaceChildren(); $('suggest-result').replaceChildren(); setStatus('suggest-status', '');
}

function renderSetup() {
  const s = state.status;
  renderWorkspaces();
  $('notes').replaceChildren(...s.notes.map(n => el('li', {}, n)));
  $('formats').replaceChildren(...Object.entries(s.video_formats).map(([id, f], i) => el('label', {}, el('input', { type: 'checkbox', value: id, ...(i === 0 ? { checked: '' } : {}) }), f.label)));
  $('img-formats').replaceChildren(...Object.entries(s.image_formats).map(([id, f], i) => el('label', {}, el('input', { type: 'checkbox', value: id, ...(i === 0 ? { checked: '' } : {}) }), f.label)));
  $('draft-format').replaceChildren(...Object.entries(s.video_formats).map(([id, f]) => el('option', { value: id }, f.label)));
  $('brand').replaceChildren(...s.brands.map(b => el('option', { value: b.id }, b.label)));
  $('img-aspect').replaceChildren(...s.image_aspects.map(a => el('option', { value: a }, a)));
  syncBrandDefaults();
  const f = s.features;
  const toggles = {
    'upload-video': f.cloudinary, 'library-go': f.cloudinary, 'upload-logo': f.cloudinary, render: f.cloudinary, prerender: f.cloudinary,
    'draft-save': f.drafts, 'draft-refresh': f.drafts, 'transcribe-grok': f.transcribe && f.grok, 'transcribe-gemini': f.transcribe && f.gemini,
    'ai-grok': f.assist && f.grok, 'ai-gemini': f.assist && f.gemini, 'img-run': f.images, 'upload-image': f.cloudinary, 'img-library': f.cloudinary,
    'img-brand-go': f.cloudinary, 'img-brand-save': f.cloudinary, 'generated-refresh': f.generated || f.cloudinary,
    'creator-refresh': f.cloudinary,
    'youtube-connect': f.youtube && !f.youtube_connected, 'youtube-disconnect': f.youtube_connected,
    'pub-approve': f.publish && f.youtube_connected, 'pub-refresh-jobs': f.cloudinary,
    'suggest-all': f.suggest, 'suggest-title': f.suggest, 'suggest-description': f.suggest, 'suggest-tags': f.suggest,
    'queue-refresh': f.publish || f.cloudinary,
  };
  for (const [id, on] of Object.entries(toggles)) { $(id).disabled = !on; if (!on) $(id).title = 'Disabled: see the configuration notes at the top.'; }
  if (!f.images) setStatus('img-status', 'Grok image tools are disabled: set XAI_API_KEY (and Cloudinary) on the server.');
  if (!f.assist) setStatus('ai-status', 'AI assist is disabled: set XAI_API_KEY and/or GEMINI_KEY_COPY (and Cloudinary) on the server.');
  if (!f.transcribe) setStatus('transcribe-status', 'Auto-transcription is disabled without an AI key; type or paste captions instead.');
  if (!f.suggest) setStatus('suggest-status', 'AI suggestions are disabled: set GEMINI_KEY_COPY on the server. You can still type every field.');
  if (f.cloudinary) { loadLibrary(); loadGenerated(); loadCreatorUploads(); loadDrafts(); }
  loadPublishQueue();
  setupPublish();
}

function syncBrandDefaults() {
  const b = state.status.brands.find(x => x.id === $('brand').value);
  if (b) $('draft-pubs').value = b.publications.join(',');
}

// ---------- clip selection ----------
async function loadLibrary() {
  $('library').replaceChildren(el('p', { class: 'muted small' }, 'Loading library…'));
  try {
    const { items } = await api('library', { kind: 'video', query: $('library-q').value, scope: $('library-studio').checked ? 'studio' : 'all' });
    $('library').replaceChildren(...(items.length ? items.map(item => el('button', { class: 'thumb', type: 'button', 'aria-pressed': 'false', onclick: e => selectSource(item, e.currentTarget) },
      el('img', { src: item.thumb_url, alt: '', loading: 'lazy' }), el('span', {}, `${item.title} · ${Math.round(item.duration || 0)}s`))) : [el('p', { class: 'muted small' }, 'No videos found.')]));
  } catch (e) { $('library').replaceChildren(el('p', { class: 'error' }, e.message)); }
}

async function loadGenerated() {
  $('generated').replaceChildren(el('p', { class: 'muted small' }, 'Loading generated clips…'));
  try {
    const { items, note } = await api('generated-list');
    setStatus('generated-status', note || '');
    $('generated').replaceChildren(...(items.length ? items.map(item => el('button', { class: 'thumb', type: 'button', 'aria-pressed': 'false', onclick: e => openGenerated(item, e.currentTarget) },
      el('img', { src: item.thumb_url, alt: '', loading: 'lazy' }), el('span', {}, `${item.title} · ${Math.round(item.duration || 0)}s · private draft`))) : [el('p', { class: 'muted small' }, 'No generated drafts yet. Patrick\'s queue uploads to satcom/generated/.')]));
  } catch (e) { $('generated').replaceChildren(el('p', { class: 'error' }, e.message)); }
}

async function loadCreatorUploads() {
  $('creator-uploads').replaceChildren(el('p', { class: 'muted small' }, 'Loading creator uploads…'));
  try {
    const { items, note } = await api('creator-uploads');
    setStatus('creator-status', note || '');
    $('creator-uploads').replaceChildren(...(items.length ? items.map(item => el('button', { class: 'thumb', type: 'button', 'aria-pressed': 'false', onclick: e => openCreatorUpload(item, e.currentTarget) },
      el('img', { src: item.thumb_url, alt: '', loading: 'lazy' }), el('span', {}, `${item.title} · ${Math.round(item.duration || 0)}s · ${item.creator || 'creator'} · draft`))) : [el('p', { class: 'muted small' }, 'No creator uploads yet. Paul\'s phone link lands in satcom/paul-hill/incoming.')]));
  } catch (e) { $('creator-uploads').replaceChildren(el('p', { class: 'error' }, e.message)); }
}

async function openCreatorUpload(item, button) {
  state.sidecar = null;
  state.assetTags = item.tags || ['draft', 'creator-upload'];
  setStatus('creator-status', `${item.creator ? item.creator + ' · ' : ''}Private creator upload. Review before publishing.`);
  await selectSource({ ...item, type: 'private' }, button);
}

async function openGenerated(item, button) {
  const detail = await api('generated-get', { public_id: item.public_id }).catch(() => item);
  const sidecar = detail.sidecar || {};
  state.sidecar = sidecar;
  state.assetTags = detail.tags || item.tags || ['satcom-generated', 'ai-generated', 'gemini-omni', 'draft'];
  const meta = [sidecar.model, sidecar.resolution, sidecar.aspect, sidecar.duration ? `${sidecar.duration}s` : ''].filter(Boolean).join(' · ');
  setStatus('generated-status', `${detail.note || 'Opened private draft.'}${meta ? ' ' + meta : ''}${sidecar.synthid_note ? ' ' + sidecar.synthid_note : ''}`);
  await selectSource({ ...item, ...detail, type: 'private' }, button);
}

async function selectSource(item, button) {
  document.querySelectorAll('#library .thumb, #generated .thumb, #creator-uploads .thumb').forEach(t => t.setAttribute('aria-pressed', 'false'));
  button?.setAttribute('aria-pressed', 'true');
  if (!item.sidecar && !String(item.public_id || '').startsWith('satcom/generated/')) { state.sidecar = null; state.assetTags = item.tags || []; }
  state.source = { public_id: item.public_id, type: item.type, duration: item.duration, width: item.width, height: item.height };
  const preview = item.preview_url || (await api('source', { source: state.source })).preview_url;
  $('source-video').src = preview;
  $('trim-start').value = 0; $('trim-end').value = item.duration ? item.duration.toFixed(1) : '';
  $('source-meta').textContent = `${item.public_id} · ${item.width || '?'}×${item.height || '?'} · ${item.duration ? item.duration.toFixed(1) + 's' : 'duration unknown'} · ${item.type}`;
  state.outputs = []; $('outputs').replaceChildren();
  updateTrimInfo();
  syncPublishFromDraft();
  loadPublishPreview();
}

async function uploadFile(file, kind, extra = {}) {
  const signed = await api('sign-upload', { kind, ...extra });
  const fields = { ...signed.params, api_key: signed.apiKey, timestamp: signed.timestamp, signature: signed.signature };
  const uniqueId = crypto.randomUUID();
  let result;
  for (let start = 0; start < file.size || start === 0; start += CHUNK) {
    const end = Math.min(file.size, start + CHUNK);
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    form.append('file', file.slice(start, end), file.name);
    result = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', signed.upload_url);
      if (file.size > CHUNK) { xhr.setRequestHeader('X-Unique-Upload-Id', uniqueId); xhr.setRequestHeader('Content-Range', `bytes ${start}-${end - 1}/${file.size}`); }
      xhr.upload.onprogress = e => { if (e.lengthComputable) { $('upload-progress').hidden = false; $('upload-progress').value = ((start + e.loaded) / file.size) * 100; } };
      xhr.onload = () => { let b = {}; try { b = JSON.parse(xhr.responseText); } catch {} xhr.status < 300 ? resolve(b) : reject(new Error(b?.error?.message || `Upload failed (${xhr.status})`)); };
      xhr.onerror = () => reject(new Error('Upload failed (network).'));
      xhr.send(form);
    });
    if (end >= file.size) break;
  }
  $('upload-progress').hidden = true;
  return result;
}

// ---------- trim ----------
function edit() {
  const end = parseFloat($('trim-end').value);
  return {
    start: Math.max(0, parseFloat($('trim-start').value) || 0),
    ...(Number.isFinite(end) && end > 0 ? { end } : {}),
    formats: [...document.querySelectorAll('#formats input:checked')].map(i => i.value),
    gravity: $('gravity').value,
    brand: { preset: $('brand').value, bug: $('bug').value, lower_name: $('lower-name').value, lower_title: $('lower-title').value, lower_mode: $('lower-mode').value },
    captions: { enabled: $('captions-on').checked, size: parseInt($('captions-size').value, 10) || 64, position: $('captions-pos').value },
  };
}
function cues() { return parseSrt($('captions-text').value); }
function parseSrt(text) {
  const time = v => { const m = String(v).trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/); return m ? (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3]) + (+(m[4] || '0').padEnd(3, '0')) / 1000 : NaN; };
  return text.replace(/\r/g, '').split(/\n{2,}/).map(block => {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean); const i = lines.findIndex(l => l.includes('-->'));
    if (i < 0) return null; const [a, b] = lines[i].split('-->');
    return { start: time(a), end: time(b.trim().split(/\s+/)[0]), text: lines.slice(i + 1).join(' ') };
  }).filter(c => c && Number.isFinite(c.start) && Number.isFinite(c.end) && c.end > c.start && c.text);
}
function updateTrimInfo() {
  const e = edit(); const end = e.end ?? state.source?.duration;
  $('trim-info').textContent = end ? `Selection ${e.start.toFixed(1)}s → ${end.toFixed(1)}s (${(end - e.start).toFixed(1)}s)` : '';
}
function requireSource() { if (!state.source) throw new Error('Select or upload a clip first.'); return state.source; }

// ---------- wiring ----------
function wire() {
  $('login-form').addEventListener('submit', async e => {
    e.preventDefault(); setStatus('login-error', '');
    try { await api('login', { password: $('password').value }); $('password').value = ''; await boot(); }
    catch (err) { setStatus('login-error', err.message, true); }
  });
  $('logout').addEventListener('click', async () => { await api('logout').catch(() => {}); showGate(true); });
  $('workspace').addEventListener('change', async e => {
    state.workspace = e.target.value; localStorage.setItem(WS_KEY, state.workspace);
    resetForWorkspace();
    history.replaceState(null, '', location.pathname);
    await boot();
  });
  for (const field of ['all', 'title', 'description', 'tags']) $(`suggest-${field}`).addEventListener('click', e => busy(e.currentTarget, () => suggestFields(field)));
  $('queue-refresh').addEventListener('click', loadPublishQueue);
  document.querySelectorAll('[role=tab]').forEach(tab => tab.addEventListener('click', () => {
    document.querySelectorAll('[role=tab]').forEach(t => t.setAttribute('aria-selected', String(t === tab)));
    document.querySelectorAll('.tab').forEach(p => { p.hidden = p.dataset.panel !== tab.dataset.tab; });
  }));
  $('library-go').addEventListener('click', loadLibrary);
  $('generated-refresh').addEventListener('click', loadGenerated);
  $('creator-refresh').addEventListener('click', loadCreatorUploads);
  $('brand').addEventListener('change', syncBrandDefaults);
  $('upload-video').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    setStatus('upload-status', `Uploading ${file.name}…`);
    try {
      const r = await uploadFile(file, 'video');
      setStatus('upload-status', `Uploaded ${r.public_id}.`);
      await selectSource({ public_id: r.public_id, type: r.type === 'authenticated' ? 'authenticated' : 'upload', duration: r.duration, width: r.width, height: r.height });
      loadLibrary();
    } catch (err) { setStatus('upload-status', err.message, true); }
    e.target.value = '';
  });
  $('upload-logo').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    try { const r = await uploadFile(file, 'logo', { brand: $('brand').value }); alert(`Logo saved for ${$('brand').selectedOptions[0].text} (${r.public_id}). Choose “Uploaded logo” as the corner mark.`); }
    catch (err) { alert(err.message); }
    e.target.value = '';
  });
  const video = $('source-video');
  $('set-in').addEventListener('click', () => { $('trim-start').value = video.currentTime.toFixed(1); updateTrimInfo(); });
  $('set-out').addEventListener('click', () => { $('trim-end').value = video.currentTime.toFixed(1); updateTrimInfo(); });
  ['trim-start', 'trim-end'].forEach(id => $(id).addEventListener('input', updateTrimInfo));
  $('play-sel').addEventListener('click', () => {
    const e = edit(); video.currentTime = e.start; video.play();
    const stop = () => { if (e.end && video.currentTime >= e.end) { video.pause(); video.removeEventListener('timeupdate', stop); } };
    video.addEventListener('timeupdate', stop);
  });
  video.addEventListener('loadedmetadata', () => {
    if (state.source && !state.source.duration && Number.isFinite(video.duration)) { state.source.duration = video.duration; if (!$('trim-end').value) $('trim-end').value = video.duration.toFixed(1); updateTrimInfo(); }
  });

  for (const provider of ['grok', 'gemini']) {
    $(`transcribe-${provider}`).addEventListener('click', e => busy(e.currentTarget, async () => {
      try {
        const source = requireSource(); setStatus('transcribe-status', `Transcribing with ${provider}…`);
        const r = await api('transcribe', { provider, source, edit: edit() });
        $('captions-text').value = r.srt; $('captions-on').checked = true;
        setStatus('transcribe-status', `${r.cues.length} cues from ${r.provider}. ${r.note}`);
      } catch (err) { setStatus('transcribe-status', err.message, true); }
    }));
    $(`ai-${provider}`).addEventListener('click', e => busy(e.currentTarget, async () => {
      try {
        const source = requireSource(); setStatus('ai-status', `Asking ${provider}…`);
        const r = await api('assist', { provider, source, edit: edit(), cues: cues(), notes: $('ai-notes').value });
        renderAssist(r); setStatus('ai-status', `${r.provider} (${r.model}). ${r.note}`);
      } catch (err) { setStatus('ai-status', err.message, true); }
    }));
  }

  $('render').addEventListener('click', e => busy(e.currentTarget, async () => {
    try {
      const source = requireSource(); setStatus('render-status', 'Building Cloudinary renders…');
      const r = await api('render', { source, edit: edit(), cues: cues() });
      state.outputs = r.outputs; renderOutputs(); setStatus('render-status', r.note);
    } catch (err) { setStatus('render-status', err.message, true); }
  }));
  $('prerender').addEventListener('click', e => busy(e.currentTarget, async () => {
    try { const r = await api('prerender', { source: requireSource(), edit: edit(), cues: cues() }); setStatus('render-status', r.note); }
    catch (err) { setStatus('render-status', err.message, true); }
  }));
  $('draft-save').addEventListener('click', e => busy(e.currentTarget, async () => {
    try {
      const source = requireSource(); setStatus('draft-status', 'Saving draft…');
      const split = v => v.split(',').map(s => s.trim()).filter(Boolean);
      const poster = $('draft-poster').value;
      const r = await api('draft-save', {
        source, edit: edit(), cues: cues(), format: $('draft-format').value,
        ...(poster !== 'frame' ? { poster_url: poster } : {}),
        meta: { title: $('draft-title').value, description: $('draft-desc').value, creator: $('draft-creator').value.trim(), credit: $('draft-credit').value,
          publications: split($('draft-pubs').value), towns: split($('draft-towns').value), social: state.social || {}, hashtags: state.hashtags || [] },
      });
      $('draft-json').hidden = false; $('draft-json').textContent = JSON.stringify(r.draft ?? r.entry, null, 2);
      setStatus('draft-status', `${r.note} ${r.ready_to_publish ? 'Entry passes the public schema.' : 'Before publishing fix: ' + r.issues.join('; ')}`);
      loadDrafts();
    } catch (err) { setStatus('draft-status', err.message, true); }
  }));
  $('draft-refresh').addEventListener('click', loadDrafts);
  $('youtube-connect').addEventListener('click', e => busy(e.currentTarget, async () => {
    try {
      const r = await api('youtube-oauth-start');
      location.href = r.url;
    } catch (err) { setStatus('pub-status', err.message, true); }
  }));
  $('youtube-disconnect').addEventListener('click', e => busy(e.currentTarget, async () => {
    try { await api('youtube-disconnect'); setStatus('pub-status', 'YouTube disconnected.'); await boot(); }
    catch (err) { setStatus('pub-status', err.message, true); }
  }));
  $('pub-approve').addEventListener('click', e => busy(e.currentTarget, async () => {
    try {
      requireSource();
      setStatus('pub-status', 'Submitting review…');
      const r = await api('publish-approve', publishBody());
      state.publishVersion = r.version;
      const queued = (r.jobs || []).find(j => j.status === 'queued');
      setStatus('pub-status', queued ? `YouTube ${queued.error || 'queued until tomorrow'}.` : 'Publish jobs updated.');
      renderJobs(r.jobs || []);
      loadPublishQueue();
    } catch (err) { setStatus('pub-status', err.message, true); }
  }));
  $('pub-refresh-jobs').addEventListener('click', loadJobs);
  $('pub-synthetic').addEventListener('click', e => {
    const tags = state.assetTags || [];
    if (tags.includes('ai-generated') || tags.includes('gemini-omni')) { e.preventDefault(); e.currentTarget.checked = true; }
  });

  // images
  $('img-mode').addEventListener('change', () => { $('img-source-row').hidden = $('img-mode').value !== 'edit-image'; });
  $('upload-image').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    try { const r = await uploadFile(file, 'image'); state.image = { public_id: r.public_id, type: 'upload' }; setStatus('img-source', `Source image: ${r.public_id}`); addImageResult({ public_id: r.public_id, type: 'upload', thumb_url: r.secure_url, title: file.name }); }
    catch (err) { setStatus('img-source', err.message, true); }
    e.target.value = '';
  });
  $('img-library').addEventListener('click', async () => {
    try {
      const { items } = await api('library', { kind: 'image', scope: 'all' });
      $('img-library-list').replaceChildren(...items.map(item => el('button', { class: 'thumb', type: 'button', onclick: () => { state.image = { public_id: item.public_id, type: item.type }; setStatus('img-source', `Source image: ${item.public_id}`); selectImage(item); } },
        el('img', { src: item.thumb_url, alt: '', loading: 'lazy' }), el('span', {}, item.title))));
    } catch (err) { setStatus('img-source', err.message, true); }
  });
  $('img-run').addEventListener('click', e => busy(e.currentTarget, async () => {
    try {
      const mode = $('img-mode').value;
      const payload = { prompt: $('img-prompt').value, aspect_ratio: $('img-aspect').value, resolution: $('img-res').value, brand: $('brand').value, brand_style: $('img-brand-style').checked };
      let op = 'image-generate';
      if (mode === 'edit-frame') { op = 'image-edit'; payload.frame = { source: requireSource(), t: $('source-video').currentTime || 0 }; }
      if (mode === 'edit-image') { op = 'image-edit'; if (!state.image) throw new Error('Upload or choose a source image first.'); payload.image = state.image; }
      setStatus('img-status', 'Grok Imagine is working…');
      const r = await api(op, payload);
      r.images.forEach(addImageResult); if (r.images[0]) selectImage(r.images[0]);
      setStatus('img-status', r.note);
    } catch (err) { setStatus('img-status', err.message, true); }
  }));
  $('img-brand-go').addEventListener('click', e => busy(e.currentTarget, () => brandImage('image-brand')));
  $('img-brand-save').addEventListener('click', e => busy(e.currentTarget, () => brandImage('image-save')));
}

function addImageResult(item) {
  $('img-results').prepend(el('button', { class: 'thumb', type: 'button', onclick: () => selectImage(item) }, el('img', { src: item.thumb_url || item.url, alt: '' }), el('span', {}, item.title || item.public_id)));
}
function selectImage(item) {
  state.image = { public_id: item.public_id, type: item.type || 'upload' };
  $('img-brand-panel').hidden = false;
  setStatus('img-status', `Selected ${item.public_id} for branding.`);
}
function imageSpec() {
  const e = edit();
  return { formats: [...document.querySelectorAll('#img-formats input:checked')].map(i => i.value), gravity: 'auto', headline: $('img-headline').value, brand: e.brand };
}
async function brandImage(op) {
  try {
    if (!state.image) throw new Error('Select an image first.');
    const r = await api(op, { image: state.image, spec: imageSpec() });
    if (op === 'image-brand') {
      state.brandedImages = r.outputs;
      $('img-brand-out').replaceChildren(...r.outputs.map(o => el('div', { class: 'output' }, el('strong', {}, o.label), el('img', { src: o.url, alt: `Branded ${o.label}` }),
        el('div', { class: 'links' }, el('a', { href: o.download_url }, 'Download JPG'), el('a', { href: o.url, target: '_blank', rel: 'noopener' }, 'Open')))));
      const opts = [el('option', { value: 'frame' }, 'Branded video frame'), ...r.outputs.map(o => el('option', { value: o.url }, `Branded image · ${o.format}`))];
      $('draft-poster').replaceChildren(...opts);
    } else {
      setStatus('img-status', `Saved ${r.saved.length} branded graphic(s) to Cloudinary (satcom-studio/social).`);
    }
  } catch (err) { setStatus('img-status', err.message, true); }
}

function renderOutputs() {
  $('outputs').replaceChildren(...state.outputs.map(o => el('div', { class: 'output' },
    el('strong', {}, `${o.label} · ${o.window.duration}s`),
    el('video', { src: o.preview_url, poster: o.poster_url, controls: '', playsinline: '', preload: 'none' }),
    el('div', { class: 'links' }, el('a', { href: o.download_url }, 'Download MP4'), el('a', { href: o.mp4_url, target: '_blank', rel: 'noopener' }, 'Full-size MP4'), el('a', { href: o.poster_url, target: '_blank', rel: 'noopener' }, 'Poster JPG')))));
}

function renderAssist(r) {
  state.social = r.social; state.hashtags = r.hashtags;
  const use = (label, fn) => el('button', { class: 'ghost', type: 'button', onclick: fn }, label);
  const blocks = [];
  if (r.titles.length) blocks.push(el('div', { class: 'ai-block' }, el('h4', {}, 'Titles'), ...r.titles.map(t => el('p', {}, t, use('Use', () => { $('draft-title').value = t; $('pub-title').value = t; })))));
  if (r.description) blocks.push(el('div', { class: 'ai-block' }, el('h4', {}, 'Description'), el('p', {}, r.description, use('Use', () => { $('draft-desc').value = r.description; $('pub-desc').value = r.description; }))));
  if (r.caption_hook) blocks.push(el('div', { class: 'ai-block' }, el('h4', {}, 'On-screen hook'), el('p', {}, r.caption_hook, use('Use as lower third', () => { $('lower-title').value = r.caption_hook.slice(0, 100); }), use('Use as graphic headline', () => { $('img-headline').value = r.caption_hook; }))));
  if (r.highlight) blocks.push(el('div', { class: 'ai-block' }, el('h4', {}, 'Suggested highlight'), el('p', {}, `${r.highlight.start}s → ${r.highlight.end}s · ${r.highlight.reason}`,
    use('Apply trim', () => { $('trim-start').value = r.highlight.start; $('trim-end').value = r.highlight.end; updateTrimInfo(); }))));
  for (const [platform, copy] of Object.entries(r.social)) if (copy) blocks.push(el('div', { class: 'ai-block' }, el('h4', {}, platform.replace('_', ' ')), el('p', {}, copy, use('Copy', () => navigator.clipboard?.writeText(copy)))));
  if (r.hashtags.length) blocks.push(el('div', { class: 'ai-block' }, el('h4', {}, 'Hashtags'), el('p', {}, r.hashtags.map(h => `#${h}`).join(' '))));
  $('ai-result').replaceChildren(...blocks);
}

async function loadDrafts() {
  try {
    const { drafts } = await api('draft-list');
    $('draft-list').replaceChildren(...(drafts.length ? drafts.map(d => el('li', {}, `${d.title || d.id} · ${d.kind === 'url-script' ? 'URL script' : d.format} · ${new Date(d.created_at).toLocaleString()}`,
      el('button', { class: 'ghost', type: 'button', onclick: async () => { const r = await api('draft-get', { id: d.id, kind: d.kind }); $('draft-json').hidden = false; $('draft-json').textContent = JSON.stringify(r.draft, null, 2); } }, 'View JSON'))) : [el('li', { class: 'muted' }, 'No drafts in this workspace yet.')]));
  } catch (err) { $('draft-list').replaceChildren(el('li', { class: 'error' }, err.message)); }
}

// Publish queue for the active workspace (all clips, not just the selected one).
async function loadPublishQueue() {
  try {
    const { jobs } = await api('publish-queue');
    $('queue-list').replaceChildren(...(jobs.length ? jobs.map(j => el('li', {}, `${j.target} · ${j.status} · ${j.asset_public_id.split('/').pop()}${j.error ? ' — ' + j.error : ''}`)) : [el('li', { class: 'muted' }, 'Nothing queued or published in this workspace.')]));
  } catch (err) { $('queue-list').replaceChildren(el('li', { class: 'error' }, err.message)); }
}

// ---------- AI field help (title / description / tags) ----------
// Suggestions are text only. Accepting one fills the field and CLEARS its "reviewed" box so a
// human still has to read it; nothing is saved or published from here.
async function suggestFields(field) {
  setStatus('suggest-status', 'Asking Gemini…'); $('suggest-result').replaceChildren();
  try {
    const r = await api('suggest-fields', {
      field, source: state.source || undefined, brand: $('brand').value,
      notes: $('ai-notes').value, transcript: $('pub-captions').value || $('captions-text').value,
      current: { title: $('pub-title').value, description: $('pub-desc').value, tags: $('pub-tags').value },
    });
    const accept = (inputId, reviewId, value) => { $(inputId).value = value; $(reviewId).checked = false; setStatus('suggest-status', 'Filled. Read it, edit if needed, then tick its reviewed box.'); $(inputId).focus(); };
    const rows = [];
    for (const title of r.titles || []) rows.push(el('li', {}, el('span', {}, title), el('button', { class: 'ghost', type: 'button', onclick: () => accept('pub-title', 'rev-title', title) }, 'Use title')));
    if (r.description) rows.push(el('li', {}, el('span', {}, r.description), el('button', { class: 'ghost', type: 'button', onclick: () => accept('pub-desc', 'rev-desc', r.description) }, 'Use description')));
    if (r.tags?.length) rows.push(el('li', {}, el('span', {}, r.tags.join(', ')), el('button', { class: 'ghost', type: 'button', onclick: () => accept('pub-tags', 'rev-tags', r.tags.join(', ')) }, 'Use tags')));
    $('suggest-result').replaceChildren(...(rows.length ? rows : [el('li', { class: 'muted' }, 'No suggestion came back. Try again.')]));
    setStatus('suggest-status', r.note);
  } catch (err) { setStatus('suggest-status', err.message, true); }
}

wire();
boot();

function youtubeQueryNote() {
  const q = new URLSearchParams(location.search).get('youtube');
  if (!q) return;
  const messages = {
    connected: 'YouTube channel connected.',
    denied: 'YouTube access was denied.',
    error: 'YouTube connect failed.',
    signin: 'Sign in to the studio, then connect YouTube again.',
    norefresh: 'Google did not return a refresh token. Reconnect with consent.',
    disabled: 'YouTube env vars are not set on this deployment.',
  };
  setStatus('pub-status', messages[q] || q, q !== 'connected');
}

function setupPublish() {
  const p = state.status.publish || {};
  const f = state.status.features;
  const banner = $('publish-banner');
  if (!f.publish) {
    banner.textContent = 'Publishing is not connected. Set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET and YOUTUBE_TOKEN_ENC_KEY on the Preview project, then connect the channel. The review gate stays visible and disabled. See docs/youtube.md.';
    banner.classList.remove('ready');
  } else if (!f.youtube_connected) {
    banner.textContent = p.notes?.find(n => n.includes('channel')) || 'YouTube env is set. Connect the channel (one-time) before approving a publish.';
    banner.classList.remove('ready');
  } else {
    banner.textContent = `YouTube connected${p.channel_title ? ' · ' + p.channel_title : ''}. satcom.conews.press/video ${f.satcom ? 'ready' : 'needs Cloudinary'}.`;
    banner.classList.add('ready');
  }
  const q = p.quota || { used: 0, cap: 6, remaining: 6 };
  const units = q.units;
  const unitsNote = units
    ? ` Other API calls ${units.used}/${units.limit} units (separate 10,000-unit pool).`
    : '';
  $('publish-quota').textContent = q.queued_until
    ? `Editorial upload cap ${q.used}/${q.cap} today (our limit, not Google's). Further uploads are queued until tomorrow (${q.queued_until}).${unitsNote}`
    : `Editorial upload cap ${q.used}/${q.cap} today (${q.remaining} remaining). This is our daily limit, not a Google quota. Default privacy: ${p.default_privacy || 'unlisted'}.${unitsNote}`;
  $('pub-privacy').value = p.default_privacy || 'unlisted';
  if (!$('pub-name').value) $('pub-name').value = $('draft-credit').value || 'Paul Hill';
  if (!$('pub-date').value) $('pub-date').value = new Date().toISOString().slice(0, 10);
  youtubeQueryNote();
  applySyntheticLock();
}

function syncPublishFromDraft() {
  if (!$('pub-title').value) $('pub-title').value = $('draft-title').value;
  if (!$('pub-desc').value) $('pub-desc').value = $('draft-desc').value;
  $('pub-captions').value = $('captions-text').value;
  if (state.hashtags?.length && !$('pub-tags').value) $('pub-tags').value = state.hashtags.join(', ');
  applySyntheticLock();
}

function applySyntheticLock() {
  const tags = state.assetTags || [];
  const model = state.sidecar?.model || '';
  const synthetic = tags.includes('ai-generated') || tags.includes('gemini-omni') || /omni|veo/i.test(model);
  const box = $('pub-synthetic');
  const line = $('pub-disclosure');
  const text = state.status?.publish?.ai_disclosure_line || 'This video includes AI-generated (synthetic) content.';
  if (synthetic) {
    box.checked = true;
    box.disabled = true;
    box.title = 'Locked on for Omni / AI-generated clips.';
    line.hidden = false;
    line.textContent = `${text} YouTube status.containsSyntheticMedia will be true. This cannot be turned off for this clip.`;
    if ($('pub-desc').value && !String($('pub-desc').value).includes('AI-generated')) {
      /* reviewer still controls copy; server appends the line on approve */
    }
  } else {
    box.disabled = !(state.status?.features?.publish && state.status?.features?.youtube_connected);
    box.title = '';
    line.hidden = true;
  }
}

async function loadPublishPreview() {
  if (!state.source || !state.status?.features?.cloudinary) return;
  try {
    const r = await api('publish-preview', { source: state.source, sidecar: state.sidecar || {}, asset_tags: state.assetTags, draft: state.source });
    $('pub-source').src = r.source.preview_url;
    $('pub-source-meta').textContent = `${r.source.note} ${r.source.public_id}`;
    $('pub-draft').src = r.draft.preview_url;
    $('pub-draft-meta').textContent = `${r.draft.kind} · ${r.draft.public_id}`;
    if (r.synthetic) { state.assetTags = state.assetTags.length ? state.assetTags : ['ai-generated']; applySyntheticLock(); }
  } catch (e) { $('pub-source-meta').textContent = e.message; }
}

function publishBody() {
  const split = v => v.split(',').map(s => s.trim()).filter(Boolean);
  const consent = $('pub-consent').checked;
  return {
    source: state.source,
    sidecar: state.sidecar || {},
    asset_tags: state.assetTags,
    title: $('pub-title').value,
    description: $('pub-desc').value,
    tags: split($('pub-tags').value),
    captions: $('pub-captions').value,
    credit_name: $('pub-name').value,
    shoot_date: $('pub-date').value,
    review: { title: $('rev-title').checked, description: $('rev-desc').checked, captions: $('rev-captions').checked, tags: $('rev-tags').checked },
    consent: { people: consent, music: consent, paul_hill: consent },
    contains_synthetic_media: $('pub-synthetic').checked,
    youtube_privacy: $('pub-privacy').value,
    version: state.publishVersion,
  };
}

function renderJobs(jobs) {
  $('pub-jobs').replaceChildren(...(jobs.length ? jobs.map(j => {
    const li = el('li', {}, `${j.target}: ${j.status}${j.error ? ' — ' + j.error : ''}${j.youtube_video_id ? ' · yt ' + j.youtube_video_id : ''}${j.satcom_entry_id ? ' · ' + j.satcom_entry_id : ''}${j.run_after ? ' · queued until ' + j.run_after : ''}`);
    if (j.status === 'failed' || j.status === 'queued') {
      li.append(el('button', { class: 'ghost', type: 'button', onclick: () => retryJob(j.target) }, 'Retry'));
    }
    if (j.status === 'succeeded') {
      li.append(el('button', { class: 'ghost', type: 'button', onclick: () => unpublishJob(j.target, 'private') }, j.target === 'youtube' ? 'Unpublish (private)' : 'Remove from feed'));
      if (j.target === 'youtube') li.append(el('button', { class: 'ghost', type: 'button', onclick: () => unpublishJob(j.target, 'delete') }, 'Delete on YouTube'));
    }
    return li;
  }) : [el('li', { class: 'muted' }, 'No publish jobs yet.')]));
}

async function retryJob(target) {
  try {
    requireSource();
    setStatus('pub-status', `Retrying ${target}…`);
    const r = await api('publish-retry', { ...publishBody(), target, version: state.publishVersion });
    setStatus('pub-status', `${target}: ${r.job.status}${r.job.error ? ' — ' + r.job.error : ''}`);
    loadJobs();
  } catch (e) { setStatus('pub-status', e.message, true); }
}

async function unpublishJob(target, mode) {
  try {
    requireSource();
    const r = await api('publish-unpublish', { ...publishBody(), target, mode, version: state.publishVersion });
    setStatus('pub-status', `${target} ${r.job.status}`);
    loadJobs();
  } catch (e) { setStatus('pub-status', e.message, true); }
}

async function loadJobs() {
  if (!state.source) return;
  try {
    const r = await api('publish-jobs', { public_id: state.source.public_id });
    renderJobs(r.jobs || []);
  } catch (e) { $('pub-jobs').replaceChildren(el('li', { class: 'error' }, e.message)); }
}
