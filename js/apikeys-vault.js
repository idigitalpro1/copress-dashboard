// SATCOM API key vault UI (DRAFT). Talks only to the Hetzner gateway; Vercel holds no vault secrets.
(() => {
  const API = 'https://vault.conews.press/v1';
  const $ = (id) => document.getElementById(id);
  const show = (id, on = true) => $(id).classList.toggle('hidden', !on);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function api(path, opts = {}) {
    const r = await fetch(API + path, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && j.error === 'step-up required') { await passkeyAuth(); return api(path, opts); }
    if (!r.ok) throw new Error(j.error || r.status);
    return j;
  }

  // base64url <-> ArrayBuffer for WebAuthn JSON
  const b2a = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0)).buffer;
  const a2b = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const credJSON = (c) => ({ id: c.id, rawId: a2b(c.rawId), type: c.type, clientExtensionResults: c.getClientExtensionResults(),
    authenticatorAttachment: c.authenticatorAttachment,
    response: Object.fromEntries(['clientDataJSON', 'attestationObject', 'authenticatorData', 'signature', 'userHandle']
      .filter((k) => c.response[k]).map((k) => [k, a2b(c.response[k])]).concat(c.response.getTransports ? [['transports', c.response.getTransports()]] : [])) });

  async function passkeyRegister(extra = {}) {
    const o = await api('/webauthn/register/options', { method: 'POST', body: extra });
    o.challenge = b2a(o.challenge); o.user.id = b2a(o.user.id);
    o.excludeCredentials = (o.excludeCredentials || []).map((c) => ({ ...c, id: b2a(c.id) }));
    const c = await navigator.credentials.create({ publicKey: o });
    const r = await api('/webauthn/register/verify', { method: 'POST', body: { response: credJSON(c), label: navigator.platform } });
    if (r.recoveryCodes) { $('codeList').textContent = r.recoveryCodes.join('\n'); show('codes'); }
  }
  async function passkeyAuth() {
    const o = await api('/webauthn/auth/options', { method: 'POST' });
    o.challenge = b2a(o.challenge); o.allowCredentials = (o.allowCredentials || []).map((c) => ({ ...c, id: b2a(c.id) }));
    const c = await navigator.credentials.get({ publicKey: o });
    await api('/webauthn/auth/verify', { method: 'POST', body: { response: credJSON(c) } });
  }

  async function refresh() {
    const st = await api('/webauthn/status');
    show('enroll', !st.enrolled); show('login', st.enrolled && !st.signedIn); show('vault', st.signedIn);
    $('who').textContent = st.signedIn ? 'unlocked' : 'locked';
    if (!st.signedIn) return;
    const { keys } = await api('/keys');
    $('keyRows').innerHTML = keys.map((k) => `<tr><td><code>${esc(k.name)}</code></td><td>${esc(k.service)}</td><td>${esc(k.version)}</td><td class="muted">${esc((k.updated || '').slice(0, 10))}</td>
      <td class="row"><button data-a="reveal" data-k="${esc(k.name)}" class="secondary">View</button><button data-a="copy" data-k="${esc(k.name)}" class="secondary">Copy</button>
      <button data-a="rotate" data-k="${esc(k.name)}" class="secondary">Rotate</button><button data-a="delete" data-k="${esc(k.name)}" class="danger">Delete</button></td></tr>`).join('');
    const { tokens } = await api('/tokens');
    $('tokRows').innerHTML = tokens.map((t) => `<tr><td>${esc(t.name)}</td><td class="muted">${esc(t.scopes.join(', '))}</td><td class="muted">${t.revoked_at ? 'revoked' : 'exp ' + esc((t.expires_at || '').slice(0, 10))}</td>
      <td>${t.revoked_at ? '' : `<button class="danger" data-a="revoke" data-k="${esc(t.id)}">Revoke</button>`}</td></tr>`).join('');
    const { audit } = await api('/audit?limit=50');
    $('auditRows').innerHTML = audit.map((a) => `<tr><td class="muted">${esc(a.ts.replace('T', ' ').slice(0, 19))}Z</td><td>${esc(a.actor)}</td><td>${esc(a.action)}</td><td><code>${esc(a.key_name)}</code></td><td>${esc(a.result)}</td></tr>`).join('');
  }

  document.addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-a]'); if (!b) return;
    const k = b.dataset.k;
    try {
      if (b.dataset.a === 'reveal') { const r = await api(`/keys/${k}/reveal`, { method: 'POST', body: {} }); alert(`${k} (v${r.version}):\n\n${r.value}`); }
      if (b.dataset.a === 'copy') { const r = await api(`/keys/${k}/reveal`, { method: 'POST', body: { copy: true } }); await navigator.clipboard.writeText(r.value); setTimeout(() => navigator.clipboard.writeText('').catch(() => {}), 30_000); b.textContent = 'Copied (clears in 30s)'; }
      if (b.dataset.a === 'rotate') { const v = prompt(`New value for ${k}:`); if (v) await api(`/keys/${k}/rotate`, { method: 'POST', body: { value: v } }); }
      if (b.dataset.a === 'delete' && confirm(`Delete ${k}? (old versions stay recoverable)`)) await api(`/keys/${k}`, { method: 'DELETE' });
      if (b.dataset.a === 'revoke' && confirm('Revoke this bot token?')) await api(`/tokens/${k}`, { method: 'DELETE' });
      refresh();
    } catch (err) { alert('Error: ' + err.message); }
  });
  $('btnEnroll').onclick = async () => { const v = $('enrollToken').value.trim(); await passkeyRegister(/^[0-9a-f]{5}-[0-9a-f]{5}$/.test(v) ? { recoveryCode: v } : { enrollToken: v }).catch((e) => alert(e.message)); refresh(); };
  $('lnkRecover').onclick = (e) => { e.preventDefault(); show('enroll'); show('login', false); };
  $('btnLogin').onclick = () => passkeyAuth().then(refresh).catch((e) => alert(e.message));
  $('btnCodesDone').onclick = () => { $('codeList').textContent = ''; show('codes', false); };
  $('btnAddPasskey').onclick = () => passkeyAuth().then(() => passkeyRegister()).then(refresh).catch((e) => alert(e.message));
  $('btnLogout').onclick = () => api('/webauthn/logout', { method: 'POST' }).then(refresh);
  $('btnAdd').onclick = async () => {
    try { await api('/keys', { method: 'POST', body: { name: $('kName').value.trim(), value: $('kValue').value, service: $('kService').value, owner: $('kOwner').value } });
      $('kValue').value = ''; refresh(); } catch (e) { alert(e.message); }
  };
  $('btnToken').onclick = async () => {
    try { const r = await api('/tokens', { method: 'POST', body: { name: $('tName').value.trim(), scopes: $('tScopes').value.split(',').map((s) => s.trim()).filter(Boolean) } });
      $('tOut').innerHTML = `Copy now, shown once: <code>${esc(r.token)}</code>`; refresh(); } catch (e) { alert(e.message); }
  };
  refresh().catch((e) => { $('who').textContent = 'vault offline: ' + e.message; });
})();
