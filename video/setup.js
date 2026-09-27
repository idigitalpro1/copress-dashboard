const preview = document.getElementById('preview');
document.getElementById('preview-width').addEventListener('change', event => {
  preview.style.width = event.target.value;
});
function update() {
  const publication = document.getElementById('publication').value;
  const rawTown = document.getElementById('town').value.trim();
  const town = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rawTown) ? rawTown : '';
  const theme = document.getElementById('theme').value;
  const query = new URLSearchParams({ creator: 'paul-hill', theme });
  if (publication) query.set('publication', publication);
  if (town) query.set('town', town);
  preview.src = `/video/embed?${query}`;
  document.getElementById('iframe-link').href = preview.src;
  document.getElementById('api-link').href = `/api/videos?${query}`;
  document.getElementById('embed-code').value = `<script src="${location.origin}/video/widget.js" data-creator="paul-hill" data-theme="${theme}"${publication ? ` data-publication="${publication}"` : ''}${town ? ` data-town="${town}"` : ''} defer></script>`;
}
for (const id of ['publication', 'town', 'theme']) document.getElementById(id).addEventListener('change', update);
document.getElementById('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(document.getElementById('embed-code').value); document.getElementById('copy-result').textContent = 'Embed code copied.'; }
  catch { document.getElementById('embed-code').select(); document.getElementById('copy-result').textContent = 'Select and copy the code above.'; }
});
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== preview.contentWindow || event.data?.type !== 'cnp-video:resize') return;
  const height = Number(event.data.height);
  if (Number.isFinite(height)) preview.style.height = `${Math.max(180, Math.min(1600, Math.ceil(height)))}px`;
});
update();
