import { redact, providerError } from './redact.js';

const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function retryable(status) {
  return status === 429 || (status >= 500 && status <= 599);
}

function backoffSeconds(registry, workload, attempt, retryAfter) {
  const spec = registry.retry || {};
  const table = workload === 'video' ? spec.videoBackoffSeconds : spec.copyBackoffSeconds;
  const seconds = Number(table?.[attempt - 1]) || 2 ** attempt;
  const header = retryAfter && /^\d+$/.test(String(retryAfter)) ? Number(retryAfter) : 0;
  return Math.max(seconds, header);
}

export async function geminiFetch({
  fetchImpl, env, registry, workload, key, method, url, body, stream = false,
  timeoutMs = 55000, sleep = defaultSleep, signal,
}) {
  const maxRetries = Number.isFinite(Number(registry.retry?.maxRetries))
    ? Number(registry.retry.maxRetries)
    : 3;
  let attempt = 0;
  while (true) {
    let response;
    try {
      const headers = { 'x-goog-api-key': key, 'Api-Revision': registry.omni?.apiRevision || '2026-05-20' };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      response = await fetchImpl(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: signal || AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw providerError('Gemini', 0, env, error?.message || 'network error');
    }
    if (response.status < 400) return response;
    const text = await response.text().catch(() => '');
    if (retryable(response.status) && attempt < maxRetries) {
      attempt += 1;
      const wait = backoffSeconds(registry, workload, attempt, response.headers.get('retry-after'));
      await sleep(wait * 1000);
      continue;
    }
    throw providerError('Gemini', response.status, env, redact(text, env).slice(0, 4000));
  }
}
