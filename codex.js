document.querySelectorAll('[data-copy]').forEach(button => {
  button.addEventListener('click', async () => {
    const target = document.getElementById(button.dataset.copy);
    const status = document.getElementById('copy-result');
    try {
      await navigator.clipboard.writeText(target.textContent);
      button.textContent = 'Copied';
      status.textContent = 'Copied to clipboard. No agent was started.';
    } catch {
      status.textContent = 'Clipboard is unavailable. Select the displayed text to copy it manually.';
    }
  });
});
document.getElementById('check-health').addEventListener('click', async event => {
  const button = event.currentTarget;
  const status = document.getElementById('health-result');
  button.disabled = true;
  status.textContent = 'Checking the context service…';
  try {
    const response = await fetch('/api/health', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    const data = await response.json();
    if (!response.ok || data.service !== 'satcom-operations' || data.scope !== 'public-read-only-context' || data.ok !== true) throw new Error('Unexpected service response');
    status.textContent = `Context service responding · ${new Date().toLocaleTimeString()} · ${data.version}. Upstream systems were not checked. Use an MCP client to verify tool calls.`;
  } catch {
    status.textContent = 'Context service check failed. No connection is confirmed; retry or inspect deployment logs.';
  } finally {
    button.disabled = false;
  }
});
