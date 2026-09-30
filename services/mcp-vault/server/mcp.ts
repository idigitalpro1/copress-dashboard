import crypto from 'node:crypto';
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { JSONRPCMessageSchema, CancelledNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { getAllKeys, getAllPrompts, findPromptById } from './storage.js';
import { executePromptRequest } from './execution.js';
import { NewsflowError } from './crypto.js';
import { resolveExecutionModel } from './providers.js';
import { authorizeNewsflowRequest, assertJsonMediaType, assertBoundedJson } from './http-security.js';

const MCP_PATH = '/api/newsflow/mcp';
const MAX_INPUT_LENGTH = 100_000;
const MAX_BODY_BYTES = 256 * 1024;
const idSchema = z.string().trim().min(1).max(200);
const readOnlyAnnotations = {
  readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false,
};
const result = (value: Record<string, unknown>) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value) }], structuredContent: value,
});
const toolError = (message: string) => ({
  isError: true, content: [{ type: 'text' as const, text: message }],
});

function promptSummary(prompt: ReturnType<typeof getAllPrompts>[number]) {
  return {
    id: prompt.id, title: prompt.title, description: prompt.description, category: prompt.category,
    currentVersion: prompt.currentVersion, targetFormat: prompt.targetFormat,
    recommendedModel: prompt.recommendedModel, mappedKeyId: prompt.mappedKeyId,
    temperature: prompt.temperature, tags: prompt.tags, updatedAt: prompt.updatedAt,
  };
}

function buildNewsflowServer(onPipelineSettled?: (requestId: string | number) => void) {
  const server = new McpServer({ name: 'newsflow-vault', version: '0.1.0-beta' });
  server.registerTool('newsflow_vault_status', {
    title: 'NewsFlow vault status',
    description: 'Read masked key metadata and execution readiness. Never reveals a credential or ciphertext.',
    inputSchema: {}, annotations: readOnlyAnnotations,
  }, async () => {
    try {
      const keys = getAllKeys().map(key => ({
        id: key.id, label: key.label, provider: key.provider,
        maskedKey: '••••••••••••',
        status: key.status, isDefault: key.isDefault, usageCount: key.usageCount,
        lastValidatedAt: key.lastValidatedAt, createdAt: key.createdAt, updatedAt: key.updatedAt,
      }));
      return result({ total: keys.length, keys, executionEnabled: process.env.NEWSFLOW_ALLOW_EXECUTION === '1' });
    } catch {
      return toolError('Vault metadata is unavailable.');
    }
  });
  server.registerTool('newsflow_list_prompts', {
    title: 'NewsFlow saved prompts', description: 'Read summaries of saved editorial prompts, without executing them.',
    inputSchema: {
      offset: z.number().int().min(0).max(10_000).default(0),
      limit: z.number().int().min(1).max(100).default(50),
    }, annotations: readOnlyAnnotations,
  }, async ({ offset, limit }) => {
    try {
      const prompts = getAllPrompts();
      return result({ total: prompts.length, prompts: prompts.slice(offset, offset + limit).map(promptSummary) });
    } catch {
      return toolError('Saved prompts are unavailable.');
    }
  });
  server.registerTool('newsflow_get_prompt', {
    title: 'NewsFlow prompt content', description: 'Read the current version of one saved prompt. Does not execute it.',
    inputSchema: { promptId: idSchema }, annotations: readOnlyAnnotations,
  }, async ({ promptId }) => {
    try {
      const prompt = findPromptById(promptId);
      if (!prompt) return toolError('Saved prompt was not found.');
      return result({ prompt: { ...promptSummary(prompt), systemPrompt: prompt.systemPrompt, userTemplate: prompt.userTemplate } });
    } catch {
      return toolError('Saved prompt is unavailable.');
    }
  });
  server.registerTool('execute_newspaper_pipeline', {
    title: 'Run a newspaper draft pipeline',
    description: 'Run one to three explicitly selected saved prompts in order, feeding each draft output into the next. Requires NEWSFLOW_ALLOW_EXECUTION=1 and an active mapped vault key. Calls external model providers and returns drafts only; never publishes or sends.',
    inputSchema: {
      promptIds: z.array(idSchema).min(1).max(3), inputText: z.string().min(1).max(MAX_INPUT_LENGTH),
      model: z.string().trim().min(1).max(100).optional(),
      temperature: z.number().min(0).max(2).optional(), mappedKeyId: idSchema.optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, async ({ promptIds, inputText, model, temperature, mappedKeyId }, { signal, requestId }) => {
    if (process.env.NEWSFLOW_ALLOW_EXECUTION !== '1') return toolError('NewsFlow execution is disabled. No provider call was made.');
    if (new Set(promptIds).size !== promptIds.length) return toolError('Select distinct saved prompts for the pipeline.');
    try {
      // Validate the entire plan before the first provider request.
      const prompts = promptIds.map(id => findPromptById(id));
      if (prompts.some(prompt => !prompt)) return toolError('A selected saved prompt was not found. No provider call was made.');
      const keys = getAllKeys();
      for (const prompt of prompts) {
        const key = keys.find(candidate => candidate.id === (mappedKeyId || prompt!.mappedKeyId));
        if (!key || key.status !== 'active' || !['gemini', 'openai', 'anthropic'].includes(key.provider)) {
          return toolError('Every stage requires an active key for a supported provider. No provider call was made.');
        }
        try { resolveExecutionModel(key.provider, model ?? prompt!.recommendedModel); }
        catch { return toolError('Every stage requires a model compatible with its mapped provider. No provider call was made.'); }
      }
      const stages = [];
      let draftText = inputText;
      for (const promptId of promptIds) {
        if (signal.aborted) return toolError('Draft pipeline was cancelled. Remaining stages were not run.');
        if (draftText.length > MAX_INPUT_LENGTH) return toolError('An intermediate draft exceeds the pipeline input limit. Remaining stages were not run.');
        const execution = await executePromptRequest({
          promptId, inputText: draftText, modelOverride: model, temperature, keyId: mappedKeyId,
        });
        stages.push({ promptId, ...execution });
        draftText = execution.result.output;
      }
      return result({ draftOnly: true, stages, finalOutput: draftText });
    } catch {
      // Upstream exceptions can contain request data, credentials, or provider response bodies.
      return toolError('Draft execution failed. The pipeline stopped; no content was published or sent.');
    } finally {
      // The SDK suppresses a cancelled request's response, so its transport send hook cannot release the slot.
      onPipelineSettled?.(requestId);
    }
  });
  return server;
}

interface LegacySession {
  server: McpServer;
  transport: SSEServerTransport;
  bearerDigest: Buffer;
  origin: string | undefined;
  createdAt: number;
  pending: Set<string | number>;
  timer?: NodeJS.Timeout;
  closed: boolean;
}

export interface NewsflowMcpOptions {
  /** Bounded override for local tests or a smaller operator deployment. */
  maxLegacySessions?: number;
  legacySessionTtlMs?: number;
  legacySessionMaxAgeMs?: number;
  maxRequestsPerWindow?: number;
  requestWindowMs?: number;
  maxConcurrentRequests?: number;
  maxPendingLegacyRequests?: number;
  bodyReadTimeoutMs?: number;
}

function boundedOption(value: number | undefined, fallback: number, min: number, max: number) {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.floor(value!))) : fallback;
}

function accepts(req: Request, mediaType: string, wildcard = false) {
  return (req.headers.accept || '').split(',').some(range => {
    const [type, ...parameters] = range.trim().toLowerCase().split(';');
    const quality = parameters.filter(parameter => parameter.trim().startsWith('q='));
    if (quality.length > 1) return false;
    const q = quality.length ? Number(quality[0].trim().slice(2)) : 1;
    return q > 0 && q <= 1 && (type.trim() === mediaType || (wildcard && ['*/*', 'text/*'].includes(type.trim())));
  });
}

/** Mount after the secured app factory, before any catch-all handler. */
export function mountNewsflowMcp(app: Express, options: NewsflowMcpOptions = {}) {
  const maxSessions = boundedOption(options.maxLegacySessions, 20, 1, 100);
  const ttlMs = boundedOption(options.legacySessionTtlMs, 600_000, 25, 3_600_000);
  const maxAgeMs = boundedOption(options.legacySessionMaxAgeMs, 1_800_000, 25, 3_600_000);
  const maxRequests = boundedOption(options.maxRequestsPerWindow, 240, 1, 1000);
  const windowMs = boundedOption(options.requestWindowMs, 60_000, 25, 60_000);
  const maxConcurrent = boundedOption(options.maxConcurrentRequests, 8, 1, 32);
  const maxPending = boundedOption(options.maxPendingLegacyRequests, 8, 1, 32);
  const bodyReadTimeoutMs = boundedOption(options.bodyReadTimeoutMs, 10_000, 25, 10_000);
  const sessions = new Map<string, LegacySession>();
  let windowStart = 0;
  let requestCount = 0;
  let activeRequests = 0;
  let disposed = false;

  function authorize(req: Request, res: Response, next: NextFunction) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      res.locals.newsflowMcpBearerDigest = authorizeNewsflowRequest(req).bearerDigest;
    } catch (error) {
      const status = error instanceof NewsflowError ? error.statusCode : 503;
      if (status === 401) res.setHeader('WWW-Authenticate', 'Bearer realm="newsflow"');
      if (status === 429) res.setHeader('Retry-After', String((error as NewsflowError & { retryAfterSeconds?: number }).retryAfterSeconds || 1));
      return res.status(status).json({ error: error instanceof NewsflowError ? error.message : 'NewsFlow MCP is unavailable.' });
    }
    if (disposed) return res.status(503).json({ error: 'NewsFlow MCP is unavailable.' });
    const now = Date.now();
    if (now - windowStart >= windowMs) { windowStart = now; requestCount = 0; }
    if (++requestCount > maxRequests) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000))));
      return res.status(429).json({ error: 'MCP request limit reached. Try again shortly.' });
    }
    next();
  }

  function admitRequest(_req: Request, res: Response, next: NextFunction) {
    if (activeRequests >= maxConcurrent) return res.setHeader('Retry-After', '1').status(429).json({ error: 'MCP request capacity reached.' });
    activeRequests++;
    let released = false;
    const release = () => { if (!released) { released = true; activeRequests--; } };
    res.once('close', release);
    res.once('finish', release);
    next();
  }

  const parseJson = express.json({ limit: MAX_BODY_BYTES, inflate: false });
  function validateMessage(req: Request, res: Response, next: NextFunction) {
    try { assertJsonMediaType(req); }
    catch { return res.status(415).json({ error: 'Use uncompressed application/json with UTF-8 encoding.' }); }
    const size = Number(req.headers['content-length']);
    if (size > MAX_BODY_BYTES) return res.status(413).json({ error: 'MCP message exceeds the size limit.' });
    const readTimer = setTimeout(() => {
      if (!res.headersSent) res.status(408).json({ error: 'MCP request body timed out.' });
      req.destroy();
    }, bodyReadTimeoutMs);
    readTimer.unref();
    res.once('close', () => clearTimeout(readTimer));
    parseJson(req, res, error => {
      clearTimeout(readTimer);
      if (res.writableEnded || res.destroyed) return;
      if (error) return res.status(error.type === 'entity.too.large' ? 413 : error.status === 415 ? 415 : 400).json({ error: 'Invalid MCP JSON message.' });
      try { assertBoundedJson(req.body, { maxBytes: MAX_BODY_BYTES }); }
      catch (error) { return res.status(error instanceof NewsflowError ? error.statusCode : 400).json({ error: 'MCP JSON message exceeds the supported limits.' }); }
      if (!JSONRPCMessageSchema.safeParse(req.body).success || (typeof req.body.id === 'string' && req.body.id.length > 128)) return res.status(400).json({ error: 'Invalid MCP message.' });
      next();
    });
  }

  async function closeSession(session: LegacySession) {
    if (session.closed) return;
    session.closed = true;
    sessions.delete(session.transport.sessionId);
    clearTimeout(session.timer);
    session.pending.clear();
    await session.server.close().catch(() => {});
  }
  function touchSession(session: LegacySession) {
    clearTimeout(session.timer);
    session.timer = setTimeout(() => { void closeSession(session); }, Math.min(ttlMs, Math.max(0, session.createdAt + maxAgeMs - Date.now())));
    session.timer.unref();
  }

  app.all(MCP_PATH, authorize);
  app.post(MCP_PATH, admitRequest, validateMessage, (req, res, next) => {
    if (!accepts(req, 'application/json') || !accepts(req, 'text/event-stream')) return res.status(406).json({ error: 'Accept must include application/json and text/event-stream.' });
    next();
  }, async (req, res) => {
    const server = buildNewsflowServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.once('close', () => { void server.close().catch(() => {}); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'MCP request failed.' } });
      await server.close().catch(() => {});
    }
  });
  app.all(MCP_PATH, (_req, res) => res.setHeader('Allow', 'POST').status(405).json({ error: 'Use Streamable HTTP POST.' }));

  app.all('/sse', authorize);
  app.get('/sse', async (req, res) => {
    // Express also routes HEAD to GET handlers; it must not allocate an unreadable stream.
    if (req.method !== 'GET') return res.setHeader('Allow', 'GET').status(405).json({ error: 'Use legacy SSE GET.' });
    if (!accepts(req, 'text/event-stream', true)) return res.status(406).json({ error: 'Accept must permit text/event-stream.' });
    if (Number(req.headers['content-length']) > 0 || req.headers['transfer-encoding']) return res.status(400).json({ error: 'Legacy SSE GET does not accept a body.' });
    if (sessions.size >= maxSessions) return res.status(429).json({ error: 'Legacy MCP session capacity reached.' });
    const pending = new Set<string | number>();
    const server = buildNewsflowServer(requestId => pending.delete(requestId));
    const transport = new SSEServerTransport('/message', res);
    const session: LegacySession = {
      server, transport, bearerDigest: res.locals.newsflowMcpBearerDigest,
      origin: req.headers.origin, createdAt: Date.now(), pending, closed: false,
    };
    sessions.set(transport.sessionId, session);
    res.once('close', () => { void closeSession(session); });
    touchSession(session);
    const send = transport.send.bind(transport);
    transport.send = async message => {
      try { await send(message); }
      finally { if ('id' in message && !('method' in message)) session.pending.delete(message.id!); }
    };
    try {
      await server.connect(transport);
    } catch {
      if (!res.headersSent) res.status(500).json({ error: 'Legacy MCP connection failed.' });
      await closeSession(session);
    }
  });
  app.all('/sse', (_req, res) => res.setHeader('Allow', 'GET').status(405).json({ error: 'Use legacy SSE GET.' }));

  app.all('/message', authorize);
  app.post('/message', admitRequest, validateMessage, async (req, res) => {
    const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : '';
    const session = sessions.get(sessionId);
    if (!session || session.closed) return res.status(404).json({ error: 'Legacy MCP session was not found.' });
    if (Date.now() - session.createdAt >= maxAgeMs) { await closeSession(session); return res.status(404).json({ error: 'Legacy MCP session expired.' }); }
    if (!crypto.timingSafeEqual(session.bearerDigest, res.locals.newsflowMcpBearerDigest) || session.origin !== req.headers.origin) {
      return res.status(403).json({ error: 'Legacy MCP session credentials do not match.' });
    }
    if (req.body.method === 'notifications/cancelled' && !CancelledNotificationSchema.safeParse(req.body).success) {
      return res.status(400).json({ error: 'Invalid MCP cancellation notification.' });
    }
    const requestId = typeof req.body.method === 'string' && req.body.id !== undefined ? req.body.id : undefined;
    // SDK 1.30 ignores cancellation for falsy IDs; never start a paid pipeline with an uncancellable ID.
    if (!requestId && req.body.method === 'tools/call' && req.body.params?.name === 'execute_newspaper_pipeline') {
      return res.status(400).json({ error: 'Legacy draft pipelines require a nonzero, nonempty request ID.' });
    }
    if (requestId !== undefined) {
      if (session.pending.has(requestId)) return res.status(409).json({ error: 'This legacy request ID is already pending.' });
      if (session.pending.size >= maxPending) return res.setHeader('Retry-After', '1').status(429).json({ error: 'Legacy MCP request capacity reached.' });
      session.pending.add(requestId);
    }
    touchSession(session);
    try {
      // Prevalidation above prevents the legacy SDK's invalid-message response from echoing request data.
      await session.transport.handlePostMessage(req, res, req.body);
    } catch {
      if (requestId !== undefined) session.pending.delete(requestId);
      if (!res.headersSent) res.status(500).json({ error: 'Legacy MCP message failed.' });
    }
  });
  app.all('/message', (_req, res) => res.setHeader('Allow', 'POST').status(405).json({ error: 'Use legacy message POST.' }));

  return {
    async close() {
      disposed = true;
      await Promise.all([...sessions.values()].map(closeSession));
    },
  };
}
