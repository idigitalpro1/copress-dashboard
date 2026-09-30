import crypto from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { NewsflowError, requireNewsflowConfig } from './crypto.js';

type AuthorizedRequest = { config: ReturnType<typeof requireNewsflowConfig>; bearerDigest: Buffer };
type AuthorizerOptions = { maxFailuresPerAddress?: number; maxFailuresTotal?: number; windowMs?: number; maxTrackedAddresses?: number };
const bounded = (value: number | undefined, fallback: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, Math.floor(value!))) : fallback;

function duplicateHeader(req: IncomingMessage, name: string) {
  let count = 0;
  for (let index = 0; index < req.rawHeaders.length; index += 2) {
    if (req.rawHeaders[index].toLowerCase() === name) count++;
  }
  return count > 1;
}

function trustedHost(req: IncomingMessage, config: AuthorizedRequest['config']) {
  const supplied = req.headers.host;
  if (!supplied || supplied.length > 255 || duplicateHeader(req, 'host')) return false;
  try {
    const url = new URL(`http://${supplied}`);
    // Reject URL syntax, alternate numeric IP forms, trailing dots and ambiguous authorities.
    const canonical = url.host + (supplied.toLowerCase() === `${url.host}:80` ? ':80' : '');
    if (canonical !== supplied.toLowerCase() || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return false;
    if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      return Number(url.port || 80) === req.socket.localPort;
    }
    // Additional hosts require an explicit trusted origin, including its exact port.
    return config.allowedOrigins.some(origin => new URL(origin).host === supplied.toLowerCase());
  } catch { return false; }
}

/** One bounded abuse state shared by REST and MCP, with no forwarding-header trust or timers. */
export function createNewsflowRequestAuthorizer(options: AuthorizerOptions = {}) {
  const maxPerAddress = bounded(options.maxFailuresPerAddress, 20, 1, 100);
  const maxTotal = bounded(options.maxFailuresTotal, 60, 1, 1000);
  const windowMs = bounded(options.windowMs, 60_000, 25, 60_000);
  const maxAddresses = bounded(options.maxTrackedAddresses, 128, 1, 256);
  const successful = new WeakMap<IncomingMessage, AuthorizedRequest>();
  const failures = new Map<string, number>();
  let windowStart = 0;
  let totalFailures = 0;
  return function authorize(req: IncomingMessage): AuthorizedRequest {
    const cached = successful.get(req);
    if (cached) return cached;
    const config = requireNewsflowConfig();
    const authorization = req.headers.authorization;
    const match = typeof authorization === 'string' ? /^Bearer ([!-~]{32,4096})$/i.exec(authorization) : null;
    const bearerDigest = crypto.createHash('sha256').update(match?.[1] || '').digest();
    const expectedDigest = crypto.createHash('sha256').update(config.token).digest();
    // Authentication is checked even when previous failures have exhausted their budget.
    const authenticated = crypto.timingSafeEqual(bearerDigest, expectedDigest) && Boolean(match);
    if (!authenticated) {
      const now = Date.now();
      if (now - windowStart >= windowMs) { windowStart = now; totalFailures = 0; failures.clear(); }
      totalFailures++;
      const address = req.socket.remoteAddress || 'unknown';
      const count = (failures.get(address) || 0) + 1;
      if (failures.has(address) || failures.size < maxAddresses) failures.set(address, count);
      if (count > maxPerAddress || totalFailures > maxTotal) {
        const error = new NewsflowError('Authentication request limit reached. Try again shortly.', 429);
        Object.assign(error, { retryAfterSeconds: Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000)) });
        throw error;
      }
      throw new NewsflowError('Authentication is required.', 401);
    }
    for (const header of ['authorization', 'origin', 'content-type', 'content-encoding', 'accept']) {
      if (duplicateHeader(req, header)) throw new NewsflowError('Duplicate security headers are not accepted.', 400);
    }
    if (!trustedHost(req, config)) throw new NewsflowError('This request host is not permitted.', 403);
    const origin = req.headers.origin;
    if (origin && !config.allowedOrigins.includes(origin)) throw new NewsflowError('This origin is not permitted.', 403);
    const authorized = { config, bearerDigest };
    successful.set(req, authorized);
    return authorized;
  };
}

export const authorizeNewsflowRequest = createNewsflowRequestAuthorizer();

export function assertJsonMediaType(req: IncomingMessage) {
  if (!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(req.headers['content-type'] || '')) {
    throw new NewsflowError('Use application/json with UTF-8 encoding.', 415);
  }
  const encoding = req.headers['content-encoding'];
  if (encoding && !/^identity$/i.test(encoding)) throw new NewsflowError('Compressed request bodies are not accepted.', 415);
}

export function assertBoundedJson(value: unknown, { maxBytes, maxDepth = 24, maxNodes = 10_000 }: { maxBytes: number; maxDepth?: number; maxNodes?: number }) {
  const stack = [{ value, depth: 0 }];
  let nodes = 0;
  while (stack.length) {
    const current = stack.pop()!;
    if (++nodes > maxNodes || current.depth > maxDepth) throw new NewsflowError('The JSON structure exceeds the supported limits.', 400);
    const item = current.value;
    if (item === null || typeof item === 'string' || typeof item === 'boolean') continue;
    if (typeof item === 'number' && Number.isFinite(item)) continue;
    if (!item || typeof item !== 'object') throw new NewsflowError('The JSON message contains an unsupported value.', 400);
    const prototype = Object.getPrototypeOf(item);
    if (prototype !== Object.prototype && prototype !== Array.prototype && prototype !== null) throw new NewsflowError('The JSON message contains an unsupported object.', 400);
    const entries = Object.entries(item);
    if (entries.length + stack.length + nodes > maxNodes) throw new NewsflowError('The JSON structure exceeds the supported limits.', 400);
    for (const [key, child] of entries) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new NewsflowError('The JSON message contains an unsupported property.', 400);
      stack.push({ value: child, depth: current.depth + 1 });
    }
  }
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new NewsflowError('A JSON message is required.', 400);
    if (Buffer.byteLength(serialized) > maxBytes) throw new NewsflowError('The request body exceeds the supported limit.', 413);
  } catch (error) {
    if (error instanceof NewsflowError) throw error;
    throw new NewsflowError('The JSON message could not be parsed safely.', 400);
  }
}
