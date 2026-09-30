import crypto from 'node:crypto';
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { JSONRPCMessageSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { getAllKeys, getAllPrompts, findPromptById } from './storage.js';
import { executePromptRequest } from './execution.js';
import { requireNewsflowConfig } from './crypto.js';
import { resolveExecutionModel } from './providers.js';

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

function buildNewsflowServer() {
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
  }, async ({ promptIds, inputText, model, temperature, mappedKeyId }) => {
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
    }
  });
  return server;
}

interface LegacySession {
  server: McpServer;
  transport: SSEServerTransport;
  bearerDigest: Buffer;
  origin: string | undefined;
  timer?: NodeJS.Timeout;
  closed: boolean;
}

export interface NewsflowMcpOptions {
  /** Bounded override for local tests or a smaller operator deployment. */
  maxLegacySessions?: number;
  legacySessionTtlMs?: number;
}

/** Mount after the secured app factory, before any catch-all handler. */
export function mountNewsflowMcp(app: Express, options: NewsflowMcpOptions = {}) {
  const maxSessions = Math.max(1, Math.min(100, Math.floor(options.maxLegacySessions || 20)));
  const ttlMs = Math.max(25, Math.min(3_600_000, Math.floor(options.legacySessionTtlMs || 600_000)));
  const sessions = new Map<string, LegacySession>();
  let disposed = false;

  function authorize(req: Request, res: Response, next: NextFunction) {
    let configuration: ReturnType<typeof requireNewsflowConfig>;
    try { configuration = requireNewsflowConfig(); }
    catch { return res.status(503).json({ error: 'NewsFlow MCP is not configured.' }); }
    const expected = configuration.token;
    if (expected.length > 4096) return res.status(503).json({ error: 'NewsFlow MCP is not configured.' });
    const authorization = req.headers.authorization;
    const match = typeof authorization === 'string' ? /^Bearer ([!-~]{32,4096})$/i.exec(authorization) : null;
    const digest = crypto.createHash('sha256').update(match?.[1] || '').digest();
    const expectedDigest = crypto.createHash('sha256').update(expected).digest();
    if (!crypto.timingSafeEqual(digest, expectedDigest) || !match) {
      res.setHeader('WWW-Authenticate', 'Bearer realm="newsflow"');
      return res.status(401).json({ error: 'Authentication required.' });
    }
    const origin = req.headers.origin;
    if (origin && !configuration.allowedOrigins.includes(origin)) return res.status(403).json({ error: 'Origin is not allowed.' });
    if (disposed) return res.status(503).json({ error: 'NewsFlow MCP is unavailable.' });
    res.locals.newsflowMcpBearerDigest = digest;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  }

  const parseJson = express.json({ limit: MAX_BODY_BYTES });
  function validateMessage(req: Request, res: Response, next: NextFunction) {
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) return res.status(415).json({ error: 'Content-Type must be application/json.' });
    const size = Number(req.headers['content-length']);
    if (size > MAX_BODY_BYTES) return res.status(413).json({ error: 'MCP message exceeds the size limit.' });
    parseJson(req, res, error => {
      if (error) return res.status(error.type === 'entity.too.large' ? 413 : 400).json({ error: 'Invalid MCP JSON message.' });
      if (!JSONRPCMessageSchema.safeParse(req.body).success) return res.status(400).json({ error: 'Invalid MCP message.' });
      next();
    });
  }

  async function closeSession(session: LegacySession) {
    if (session.closed) return;
    session.closed = true;
    sessions.delete(session.transport.sessionId);
    clearTimeout(session.timer);
    await session.server.close().catch(() => {});
  }
  function touchSession(session: LegacySession) {
    clearTimeout(session.timer);
    session.timer = setTimeout(() => { void closeSession(session); }, ttlMs);
    session.timer.unref();
  }

  app.all(MCP_PATH, authorize);
  app.post(MCP_PATH, validateMessage, async (req, res) => {
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
    if (sessions.size >= maxSessions) return res.status(429).json({ error: 'Legacy MCP session capacity reached.' });
    const server = buildNewsflowServer();
    const transport = new SSEServerTransport('/message', res);
    const session: LegacySession = {
      server, transport, bearerDigest: res.locals.newsflowMcpBearerDigest,
      origin: req.headers.origin, closed: false,
    };
    sessions.set(transport.sessionId, session);
    res.once('close', () => { void closeSession(session); });
    touchSession(session);
    try {
      await server.connect(transport);
    } catch {
      if (!res.headersSent) res.status(500).json({ error: 'Legacy MCP connection failed.' });
      await closeSession(session);
    }
  });
  app.all('/sse', (_req, res) => res.setHeader('Allow', 'GET').status(405).json({ error: 'Use legacy SSE GET.' }));

  app.all('/message', authorize);
  app.post('/message', validateMessage, async (req, res) => {
    const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : '';
    const session = sessions.get(sessionId);
    if (!session || session.closed) return res.status(404).json({ error: 'Legacy MCP session was not found.' });
    if (!crypto.timingSafeEqual(session.bearerDigest, res.locals.newsflowMcpBearerDigest) || session.origin !== req.headers.origin) {
      return res.status(403).json({ error: 'Legacy MCP session credentials do not match.' });
    }
    touchSession(session);
    try {
      // Prevalidation above prevents the legacy SDK's invalid-message response from echoing request data.
      await session.transport.handlePostMessage(req, res, req.body);
    } catch {
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
