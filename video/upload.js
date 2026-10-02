const $ = id => document.getElementById(id);
const CHUNK = 20 * 1024 * 1024;
const MAX_BYTES = 4 * 1024 * 1024 * 1024;
const ALLOWED_EXT = /\.(mp4|mov|m4v|webm|3gp|3gpp|mpeg|mpg|avi|qt)$/i;

function tokenFromPath() {
  const parts = location.pathname.replace(/\/+$/, '').split('/');
  if (parts[1] !== 'video' || parts[2] !== 'upload') return '';
  return decodeURIComponent(parts[3] || '');
}

function show(id) {
  for (const section of ['dead-end', 'gate', 'form', 'done']) $(section).hidden = section !== id;
}

function deadEnd() {
  document.title = 'Unavailable | SATCOM';
  show('dead-end');
}

async function api(op, payload = {}) {
  const response = await fetch('/api/creator-upload', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Creator-Upload': '1' },
    body: JSON.stringify({ op, token: tokenFromPath(), ...payload }),
  });
  let body = {};
  try { body = await response.json(); } catch { /* ignore */ }
  if (!response.ok) throw Object.assign(new Error(body.error || 'This link is not available.'), { status: response.status });
  return body;
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) node.setAttribute(k, v);
  }
  for (const child of children) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return node;
}

function fileOk(file) {
  if (!file || file.size <= 0 || file.size > MAX_BYTES) return 'Each video must be under 4 GB.';
  if (!ALLOWED_EXT.test(file.name) && !(file.type || '').startsWith('video/')) return 'Choose a video file (MP4 or MOV works best).';
  return '';
}

function renderFields(files) {
  const box = $('clip-fields');
  box.replaceChildren();
  $('file-summary').textContent = files.length ? `${files.length} video${files.length === 1 ? '' : 's'} selected` : '';
  $('send').disabled = files.length === 0;
  files.forEach((file, i) => {
    const title = file.name.replace(/\.[^.]+$/, '');
    box.append(el('div', { class: 'clip-card' },
      el('strong', {}, file.name),
      el('label', {}, 'Title (optional)', el('input', { id: `title-${i}`, maxlength: '200', value: title })),
      el('label', {}, 'Note for Patrick (optional)', el('textarea', { id: `note-${i}`, maxlength: '400', placeholder: 'What this clip is, where you shot it…' })),
    ));
  });
}

function uploadChunked(file, signed, onProgress) {
  const fields = { ...signed.params, api_key: signed.apiKey, timestamp: signed.timestamp, signature: signed.signature };
  const uniqueId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const sendSlice = start => {
      const end = Math.min(file.size, start + CHUNK);
      const form = new FormData();
      for (const [k, v] of Object.entries(fields)) form.append(k, v);
      form.append('file', file.slice(start, end), file.name);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', signed.upload_url);
      if (file.size > CHUNK) {
        xhr.setRequestHeader('X-Unique-Upload-Id', uniqueId);
        xhr.setRequestHeader('Content-Range', `bytes ${start}-${end - 1}/${file.size}`);
      }
      xhr.upload.onprogress = e => {
        if (e.lengthComputable) onProgress(((start + e.loaded) / file.size) * 100);
      };
      xhr.onload = () => {
        let body = {};
        try { body = JSON.parse(xhr.responseText); } catch { /* ignore */ }
        if (xhr.status >= 300) return reject(new Error(body?.error?.message || 'Upload failed.'));
        if (end >= file.size) resolve(body);
        else sendSlice(end);
      };
      xhr.onerror = () => reject(new Error('Upload failed (network).'));
      xhr.send(form);
    };
    sendSlice(0);
  });
}

async function sendFiles(files) {
  $('form-error').textContent = '';
  const queue = $('queue');
  queue.replaceChildren();
  const received = [];
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    const problem = fileOk(file);
    const row = el('div', { class: 'job' },
      el('p', {}, file.name),
      el('p', { class: 'muted small status' }, problem || 'Preparing…'),
      el('progress', { max: '100', value: '0' }),
    );
    queue.append(row);
    const status = row.querySelector('.status');
    const bar = row.querySelector('progress');
    if (problem) { status.textContent = problem; continue; }
    try {
      const signed = await api('sign', {
        filename: file.name,
        mime: file.type,
        bytes: file.size,
        title: $(`title-${i}`)?.value || '',
        note: $(`note-${i}`)?.value || '',
      });
      status.textContent = 'Uploading…';
      await uploadChunked(file, signed, value => { bar.value = value; });
      bar.value = 100;
      status.textContent = 'Received';
      received.push(file.name);
    } catch (err) {
      status.textContent = err.message || 'Upload failed.';
    }
  }
  if (!received.length) {
    $('form-error').textContent = 'Nothing was received. Check the file and try again.';
    return;
  }
  $('done-detail').textContent = received.length === 1
    ? `${received[0]} is in Patrick’s review queue.`
    : `${received.length} clips are in Patrick’s review queue.`;
  show('done');
}

async function boot() {
  if (!tokenFromPath()) return deadEnd();
  try {
    const session = await api('session');
    document.title = 'Send a clip | SATCOM';
    $('creator-name').textContent = session.creator;
    show('form');
  } catch {
    deadEnd();
  }
}

function wire() {
  $('files').addEventListener('change', () => renderFields([...$('files').files]));
  $('upload-form').addEventListener('submit', async e => {
    e.preventDefault();
    const files = [...$('files').files];
    if (!files.length) return;
    $('send').disabled = true;
    try { await sendFiles(files); } finally { $('send').disabled = files.length === 0; }
  });
  $('send-more').addEventListener('click', () => {
    $('files').value = '';
    renderFields([]);
    $('queue').replaceChildren();
    show('form');
  });
}

wire();
boot();
