// SATCOM Clerk browser helper (ClerkJS via Clerk's CDN, per the JavaScript quickstart).
// - On /sign-in: mounts <SignIn/> (or a not-allowlisted notice with sign-out).
// - On gated operator pages: mounts a visible <UserButton/> and keeps the session fresh.
// The publishable key is read at runtime from /api/auth-config (never committed).
(function () {
  const script = document.currentScript;
  const mode = (script && script.dataset.clerkMode) || 'userbutton';

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.async = true; s.crossOrigin = 'anonymous';
      s.onload = resolve; s.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
  }
  function safeRedirect(value) {
    const v = String(value || '');
    return v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/\\') ? v : '/';
  }
  function userButtonHost() {
    let el = document.getElementById('clerk-user');
    if (!el) {
      el = document.createElement('div');
      el.id = 'clerk-user';
      el.setAttribute('aria-label', 'Signed-in account');
      el.style.cssText = 'position:fixed;top:10px;right:12px;z-index:2147483000;display:flex;align-items:center;gap:8px;padding:4px 8px;border-radius:999px;background:rgba(10,14,28,.85);border:1px solid rgba(255,255,255,.15);font:12px system-ui,sans-serif;color:#e8ecf5';
      document.body.appendChild(el);
    }
    return el;
  }
  function setStatus(text) {
    const el = document.getElementById('clerk-status');
    if (el) el.textContent = text;
  }

  async function init() {
    let cfg;
    try {
      const res = await fetch('/api/auth-config', { cache: 'no-store' });
      cfg = await res.json();
      if (!res.ok || !cfg.publishableKey) throw new Error(cfg.error || 'not configured');
    } catch (err) {
      setStatus('Sign-in is not configured on this deployment, so SATCOM stays locked.');
      return;
    }
    const pk = cfg.publishableKey;
    const fapi = atob(pk.split('_')[2]).slice(0, -1);
    await loadScript(`https://${fapi}/npm/@clerk/ui@1/dist/ui.browser.js`);
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `https://${fapi}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`;
      s.async = true; s.crossOrigin = 'anonymous';
      s.setAttribute('data-clerk-publishable-key', pk);
      s.onload = resolve; s.onerror = () => reject(new Error('Failed to load ClerkJS'));
      document.head.appendChild(s);
    });
    const Clerk = window.Clerk;
    await Clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } });

    if (mode === 'signin') {
      const params = new URLSearchParams(location.search);
      const redirect = safeRedirect(params.get('redirect_url'));
      const mount = document.getElementById('sign-in');
      if (params.get('forbidden') === '1' && Clerk.isSignedIn) {
        setStatus('This account is signed in but is not on the SATCOM allowlist. Sign out and use an approved address.');
        const holder = document.getElementById('forbidden-actions');
        if (holder) {
          holder.hidden = false;
          Clerk.mountUserButton(document.getElementById('forbidden-user'));
          document.getElementById('sign-out').onclick = () => Clerk.signOut({ redirectUrl: '/sign-in' });
        }
        return;
      }
      if (Clerk.isSignedIn) { location.replace(redirect); return; }
      setStatus('');
      Clerk.mountSignIn(mount, { forceRedirectUrl: redirect, signUpForceRedirectUrl: redirect });
      return;
    }

    // Operator page: the server already required sign-in; show who is signed in.
    if (Clerk.isSignedIn) {
      Clerk.mountUserButton(userButtonHost(), { afterSignOutUrl: '/sign-in' });
      if (typeof window.enterSatcomGate === 'function' && document.body.classList.contains('satcom-gated')) {
        document.body.classList.remove('satcom-gated');
      }
    } else {
      location.href = '/sign-in?redirect_url=' + encodeURIComponent(location.pathname + location.search);
    }
  }

  init().catch(err => { console.error('SATCOM sign-in:', err); setStatus('Sign-in could not load. Refresh to try again.'); });
})();
