import { parseCredential, planCredentialImport } from './vault-clipboard.mjs';

const input = document.getElementById('clipboard-value');
const message = document.getElementById('clipboard-message');
const menu = document.getElementById('vault-context-menu');
const dialog = document.getElementById('credential-match');
const provider = document.getElementById('credential-provider');
let pending = null;
let busy = false;
const choices = new Map();

// Only non-secret metadata is used to build the provider picker.
for (const api of DEFAULT_APIS) {
  for (const field of api.fields) {
    if (!/(KEY|TOKEN|SECRET)$/.test(field.key)) continue;
    choices.set(field.key, { name: api.name, cat: api.cat, envKey: field.key, label: `${api.name} — ${field.label}` });
  }
}
for (const [name, cat, envKey] of [
  ['xAI / Grok', 'ai', 'XAI_API_KEY'], ['Anthropic', 'ai', 'ANTHROPIC_API_KEY'],
  ['GitHub', 'infra', 'GITHUB_TOKEN'], ['Stripe', 'payments', 'STRIPE_RESTRICTED_KEY'],
]) choices.set(envKey, { name, cat, envKey, label: name + ' — API key / token' });

function status(text) { message.textContent = text; }
function closeMenu() { menu.hidden = true; }
function clearPending() { pending = null; input.value = ''; }
function revealCard(id) {
  currentCat = 'all';
  document.querySelectorAll('.cat-tab, .sidebar-item').forEach(el => el.classList.remove('active'));
  document.querySelector('.cat-tab')?.classList.add('active');
  document.querySelector('.sidebar-item')?.classList.add('active');
  renderGrid('all');
  const card = document.getElementById('card-' + id);
  card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card?.focus({ preventScroll: true });
}

function saveCredential(credential) {
  const plan = planCredentialImport(apis, credential, 'clipboard-' + crypto.randomUUID());
  const previous = apis;
  try {
    if (!plan.duplicate) {
      apis = plan.apis;
      saveVault();
    }
  } catch {
    apis = previous;
    status('The browser could not save this card. Check available storage, then paste again. Existing keys were preserved.');
    clearPending();
    return;
  }
  clearPending();
  dialog.close();
  revealCard(plan.id);
  const text = plan.duplicate
    ? 'This key is already saved in the matched card. No duplicate was created.'
    : `${credential.name} saved to ${credential.envKey}. The full key is masked; connection not tested.`;
  status(text);
  showToast(plan.duplicate ? '✓ Existing key card found' : `✓ ${credential.name} card saved`, 'green');
}

function chooseProvider(credential) {
  pending = credential;
  provider.replaceChildren();
  provider.add(new Option('Choose the provider / key type…', ''));
  for (const [key, choice] of choices) provider.add(new Option(choice.label, key));
  provider.add(new Option('Save as an unassigned key', 'unassigned'));
  provider.value = '';
  document.getElementById('credential-match-reason').textContent = credential.evidence + '. Choose once so this key is saved in the correct field.';
  dialog.showModal();
  provider.focus();
}

function ingest(text) {
  closeMenu();
  input.value = '';
  try {
    const credential = parseCredential(text);
    if (credential.ambiguous) chooseProvider(credential);
    else saveCredential(credential);
  } catch (error) {
    status(error.message);
    input.focus();
  }
}

async function fromClipboard() {
  if (busy) return;
  busy = true;
  closeMenu();
  try {
    if (!navigator.clipboard?.readText) throw new Error('unavailable');
    const text = await navigator.clipboard.readText();
    ingest(text);
  } catch {
    status('Right-click the masked field and choose Paste, or press ⌘V / Ctrl+V. The key will be matched locally.');
    input.scrollIntoView({ block: 'center' });
    input.focus();
  } finally { busy = false; }
}

document.getElementById('clipboard-create').addEventListener('click', fromClipboard);
document.getElementById('clipboard-context-create').addEventListener('click', fromClipboard);
document.getElementById('clipboard-submit').addEventListener('click', () => ingest(input.value));
input.addEventListener('keydown', event => { if (event.key === 'Enter') ingest(input.value); });
input.addEventListener('paste', event => {
  event.preventDefault();
  ingest(event.clipboardData.getData('text/plain'));
});

// Keep the browser's native paste menu inside editable fields.
document.addEventListener('contextmenu', event => {
  if (event.target.closest('input, textarea, select, [contenteditable="true"], a')) return;
  event.preventDefault();
  menu.hidden = false;
  menu.style.left = Math.max(8, Math.min(event.clientX, innerWidth - menu.offsetWidth - 8)) + 'px';
  menu.style.top = Math.max(8, Math.min(event.clientY, innerHeight - menu.offsetHeight - 8)) + 'px';
  document.getElementById('clipboard-context-create').focus();
});
document.addEventListener('click', event => { if (!menu.contains(event.target)) closeMenu(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
window.addEventListener('scroll', closeMenu, true);

// Pasting into an existing key field also uses matching, avoiding wrong-field saves.
document.getElementById('api-grid').addEventListener('paste', event => {
  if (!event.target.matches('.key-input')) return;
  const field = apis.flatMap(api => api.fields.map(f => ({ ...f, inputId: `inp-${api.id}-${f.key}` })))
    .find(f => f.inputId === event.target.id);
  if (!field || !/(KEY|TOKEN|SECRET)$/.test(field.key)) return;
  event.preventDefault();
  ingest(event.clipboardData.getData('text/plain'));
});

document.getElementById('credential-confirm').addEventListener('click', () => {
  if (!pending) return;
  if (!provider.value) { provider.focus(); return; }
  const choice = choices.get(provider.value);
  saveCredential(choice ? { ...pending, ...choice, ambiguous: false } : pending);
});
document.getElementById('credential-cancel').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', clearPending);
dialog.addEventListener('cancel', clearPending);
