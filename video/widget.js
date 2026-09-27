(() => {
  const script = document.currentScript;
  if (!script) return;
  const origin = new URL(script.src).origin;
  const url = new URL('/video/embed', origin);
  for (const key of ['creator', 'publication', 'town', 'theme', 'rotate']) {
    if (script.dataset[key]) url.searchParams.set(key, script.dataset[key]);
  }
  if (!url.searchParams.has('creator')) url.searchParams.set('creator', 'paul-hill');
  const frame = document.createElement('iframe');
  frame.title = 'Colorado News Press video carousel';
  frame.src = url.href;
  frame.loading = 'lazy';
  frame.allow = 'autoplay; fullscreen; picture-in-picture';
  frame.allowFullscreen = true;
  frame.style.cssText = 'display:block;width:100%;height:780px;border:0;border-radius:8px;';
  script.before(frame);
  const resize = event => {
    if (event.origin !== origin || event.source !== frame.contentWindow || event.data?.type !== 'cnp-video:resize') return;
    const height = Number(event.data.height);
    if (Number.isFinite(height)) frame.style.height = `${Math.max(180, Math.min(1600, Math.ceil(height)))}px`;
  };
  window.addEventListener('message', resize);
})();
