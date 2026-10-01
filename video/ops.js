const $ = id => document.getElementById(id);
async function request(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options });
  const result = await response.json();
  if (response.status === 401) { $('login').hidden = false; $('desk').hidden = true; }
  if (!response.ok) throw new Error(result.error || 'Request unavailable.');
  return result;
}
function render(data) {
  $('login').hidden = true; $('desk').hidden = false;
  $('coverage').textContent = `Coverage: ${data.coverage} · Checked ${new Date(data.checked_at).toLocaleString()}`;
  $('checks').replaceChildren();
  for (const check of data.checks) {
    const card = document.createElement('div'); card.className = 'check';
    const name = document.createElement('strong'); name.textContent = check.name.replaceAll('_', ' ');
    const details = document.createElement('p');
    details.textContent = Object.entries(check).filter(([key]) => key !== 'name').map(([key, value]) => `${key.replaceAll('_', ' ')}: ${typeof value === 'object' ? JSON.stringify(value) : value}`).join('\n');
    card.append(name, details); $('checks').append(card);
  }
  if (data.gemini?.text) $('diagnosis').textContent = data.gemini.text;
  else if (data.gemini?.status === 'unavailable') $('diagnosis').textContent = `Gemini unavailable: ${data.gemini.reason || 'Google identity is not configured.'}`;
  $('status').textContent = 'Read-only checks. Unavailable checks do not establish health.';
}
async function load(diagnose = false) {
  $('refresh').disabled = $('diagnose').disabled = true;
  $('status').textContent = diagnose ? 'Checking evidence and requesting Gemini diagnosis…' : 'Reading cloud status…';
  try { render(await request('/api/studio/cloud-ops', diagnose ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Studio-Request': '1' }, body: JSON.stringify({ op: 'diagnose' }) } : {})); }
  catch (error) { $('status').textContent = error.message; }
  finally { $('refresh').disabled = $('diagnose').disabled = false; }
}
$('login').addEventListener('submit', async event => {
  event.preventDefault();
  try { await request('/api/studio', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Studio-Request': '1' }, body: JSON.stringify({ op: 'login', password: $('password').value }) }); $('password').value = ''; await load(); }
  catch (error) { $('status').textContent = error.message; }
});
$('refresh').addEventListener('click', () => load());
$('diagnose').addEventListener('click', () => load(true));
load();
