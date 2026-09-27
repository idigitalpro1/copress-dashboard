const el = id => document.getElementById(id);
let token = '', records = [], cursor = null;
async function request(path = '', body) {
  const requestToken = token;
  const response = await fetch('/api/credential-inbox' + path, { method: body ? 'POST' : 'GET', cache: 'no-store', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (token !== requestToken) throw new Error('Inbox was locked. Refresh after unlocking to check the saved entry.');
  if (!response.ok) throw new Error(result.error || 'Operation failed. Keep your input.');
  return result;
}
function render() {
  const query = el('search').value.toLowerCase();
  el('records').replaceChildren();
  for (const record of records.filter(r => JSON.stringify(r).toLowerCase().includes(query))) {
    const card = document.createElement('article');
    const title = document.createElement('h3'); title.textContent = record.label;
    const detail = document.createElement('p'); detail.textContent = `${record.analysis.provider} · ${record.analysis.kind} · Saved / Unassigned · ${record.capturedAt}`;
    const needs = document.createElement('p'); needs.textContent = record.analysis.needs;
    const fields = document.createElement('p'); fields.textContent = `Recognized fields: ${record.analysis.fields.join(', ') || 'Not yet identified; original text preserved.'}`;
    const recover = document.createElement('button'); recover.textContent = 'Recover original (plaintext download)';
    recover.onclick = async () => {
      if (!confirm('Download this one credential, including its secret, as plaintext? Keep the file outside Git.')) return;
      try {
        const result = await request(`?id=${encodeURIComponent(record.id)}`);
        const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = `credential-${record.id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (error) { el('result').textContent = error.message; }
    };
    card.append(title, detail, fields, needs, recover); el('records').append(card);
  }
  el('more').hidden = !cursor;
}
async function refresh(more = false) {
  const data = await request(more && cursor ? `?cursor=${encodeURIComponent(cursor)}` : '');
  records = more ? [...records, ...data.records] : data.records; cursor = data.cursor; render();
}
el('unlock').onclick = async () => {
  token = el('operator').value; el('operator').value = '';
  try { await refresh(); el('connection').textContent = 'Unlocked. Encrypted inbox connected.'; el('save').disabled = false; el('refresh').disabled = false; }
  catch (error) { token = ''; el('save').disabled = true; el('refresh').disabled = true; el('connection').textContent = error.message; }
};
el('lock').onclick = () => { token = ''; records = []; cursor = null; for (const id of ['operator','raw','label','file','search']) el(id).value = ''; render(); el('save').disabled = true; el('refresh').disabled = true; el('connection').textContent = 'Locked. Screen cleared.'; el('result').textContent = 'Ready for a new capture.'; };
el('save').onclick = async () => {
  el('save').disabled = true;
  const submitted = { label: el('label').value, raw: el('raw').value };
  try {
    const data = await request('', submitted);
    records.unshift(data.record); render();
    if (el('raw').value === submitted.raw) { el('raw').value = ''; el('file').value = ''; }
    if (el('label').value === submitted.label) el('label').value = '';
    el('result').textContent = `Saved encrypted. Receipt: ${data.record.id}. Status: Unassigned. No application changed.`;
  } catch (error) { el('result').textContent = error.message; }
  finally { el('save').disabled = !token; }
};
el('file').onchange = async () => {
  const file = el('file').files[0]; if (!file) return;
  if (file.size > 65536) { el('result').textContent = 'File exceeds 64 KB. Current input retained.'; return; }
  if (el('raw').value && !confirm('Replace the current unsaved text with this file?')) return;
  el('raw').value = await file.text();
  if (!el('label').value) el('label').value = file.name;
};
el('refresh').onclick = () => refresh().catch(e => { el('connection').textContent = e.message; });
el('more').onclick = () => refresh(true).catch(e => { el('connection').textContent = e.message; });
el('search').oninput = render;
window.addEventListener('beforeunload', event => { if (el('raw').value) { event.preventDefault(); event.returnValue = ''; } });
