import express from 'express';
import crypto from 'node:crypto';
import { encryptApiKey, decryptApiKey, maskKey, NewsflowError, requireNewsflowConfig } from './server/crypto.js';
import { getAllKeys, saveAllKeys, findKeyById, getAllPrompts, saveAllPrompts,
  getAllSecurityLogs, clearSecurityLogs, recordSecurityEvent, safeKeyMetadata, type VaultKeyItem, type SystemPromptItem } from './server/storage.js';
import { validateApiKey, type Provider } from './server/providers.js';
import { importKeysFromEnv } from './server/env-importer.js';
import { executePromptRequest } from './server/execution.js';

const providers = new Set(['gemini', 'openai', 'anthropic', 'custom']);
const categories = new Set(['headline-byline', 'column-layout', 'wire-normalizer', 'sports-scores', 'caption-parser', 'custom']);
const formats = new Set(['json', 'markdown', 'text']);
function text(value: unknown, max: number, fallback = '') {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || value.length > max || /\u0000/.test(value)) throw new NewsflowError('A text field is invalid or exceeds its supported limit.');
  return value;
}
function rawKey(value: unknown) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 16384 || /[\s\u0000-\u001f\u007f]/.test(value)) throw new NewsflowError('Provide one complete credential of a supported length.');
  return value;
}
function provider(value: unknown): Provider {
  if (value === undefined) return 'custom';
  if (typeof value !== 'string' || !providers.has(value)) throw new NewsflowError('Select a supported provider.');
  return value as Provider;
}
function noCustomEndpoint(body: any) {
  if (body.customEndpointUrl || body.customHeader) throw new NewsflowError('Custom endpoints and credential headers are disabled in this beta.');
}
function keyById(id: string) {
  const key = findKeyById(id);
  if (!key) throw new NewsflowError('The requested key was not found.', 404);
  return key;
}
function untested(provider: Provider) {
  return { provider, isValid: false, latencyMs: 0, message: 'Saved without contacting the provider. Run Test explicitly before execution.' };
}
function temperature(value: unknown, fallback = 0.2) {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 2) throw new NewsflowError('Temperature must be between 0 and 2.');
  return value;
}
function mappedKey(value: unknown, fallback: string | null = null) {
  if (value === undefined) return fallback;
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !findKeyById(value)) throw new NewsflowError('Select an existing vault key.');
  return value;
}
function promptFields(body: any, existing?: SystemPromptItem) {
  const title = text(body.title, 200, existing?.title).trim();
  const systemPrompt = text(body.systemPrompt, 30000, existing?.systemPrompt);
  if (!title || !systemPrompt.trim()) throw new NewsflowError('Title and system prompt are required.');
  const category = body.category ?? existing?.category ?? 'custom';
  const targetFormat = body.targetFormat ?? existing?.targetFormat ?? 'json';
  if (!categories.has(category) || !formats.has(targetFormat)) throw new NewsflowError('The prompt category or format is unsupported.');
  const tags = body.tags ?? existing?.tags ?? [];
  if (!Array.isArray(tags) || tags.length > 20 || tags.some(tag => typeof tag !== 'string' || tag.length > 60)) throw new NewsflowError('Prompt tags exceed their supported limits.');
  return { title, systemPrompt, description: text(body.description, 2000, existing?.description), category, targetFormat,
    userTemplate: text(body.userTemplate, 30000, existing?.userTemplate), recommendedModel: text(body.recommendedModel, 100, existing?.recommendedModel || 'gemini-3.5-flash'),
    mappedKeyId: mappedKey(body.mappedKeyId, existing?.mappedKeyId), temperature: temperature(body.temperature, existing?.temperature), tags };
}

export function createNewsflowApp() {
  const app = express();
  app.disable('x-powered-by');
  // Authentication and explicit origin policy precede all body parsing and storage.
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const config = requireNewsflowConfig();
      const supplied = /^Bearer ([^\s]+)$/.exec(req.get('authorization') || '')?.[1] || '';
      const digest = (value: string) => crypto.createHash('sha256').update(value).digest();
      if (!supplied || supplied.length > 4096 || !crypto.timingSafeEqual(digest(supplied), digest(config.token))) throw new NewsflowError('Authentication is required.', 401);
      const origin = req.get('origin');
      if (origin && !config.allowedOrigins.includes(origin)) throw new NewsflowError('This origin is not permitted.', 403);
      next();
    } catch (error) { next(error); }
  });
  const json = express.json({ limit: '512kb', strict: true });
  app.use((req, res, next) => {
    if (/^\/api\/newsflow\/mcp(?:\/|$)/.test(req.path) || req.path === '/message' || req.path === '/sse') return next();
    return json(req, res, next);
  });
  const route = (handler: (req: any, res: any) => unknown) => (req: any, res: any, next: any) => {
    try { Promise.resolve(handler(req, res)).catch(next); } catch (error) { next(error); }
  };

  app.get('/api/vault/keys', route((_req, res) => res.json({ keys: getAllKeys().map(safeKeyMetadata) })));
  app.get('/api/vault/environment-status', route((_req, res) => res.json({ hasEnvGeminiKey: false, hasMasterKey: true,
    encryptionAlgorithm: 'AES-256-GCM', executionEnabled: process.env.NEWSFLOW_ALLOW_EXECUTION === '1', detectedKeys: [], newCandidatesCount: 0, totalFound: 0 })));
  app.get('/api/vault/env-candidates', route(() => { throw new NewsflowError('Server environment discovery is disabled.', 410); }));
  app.post('/api/vault/import-selected-env', route(() => { throw new NewsflowError('Server environment import is disabled. Upload explicitly selected credentials.', 410); }));
  app.post('/api/vault/import-env', route((req, res) => res.json(importKeysFromEnv(req.body))));

  app.post('/api/vault/test-key', route(async (req, res) => {
    noCustomEndpoint(req.body);
    const key = rawKey(req.body.rawKey);
    recordSecurityEvent('VALIDATION_ATTEMPT', 'info');
    const validation = await validateApiKey(key, provider(req.body.providerHint));
    const auditRecorded = recordSecurityEvent(validation.isValid ? 'VALIDATION_SUCCESS' : 'VALIDATION_FAILED', validation.isValid ? 'success' : 'failure');
    res.json({ validation, maskedKey: maskKey(key), auditRecorded });
  }));
  app.post('/api/vault/validate-and-save', route((req, res) => {
    noCustomEndpoint(req.body);
    const raw = rawKey(req.body.rawKey);
    const selectedProvider = provider(req.body.providerHint);
    const label = text(req.body.label, 120, selectedProvider + ' key').trim() || selectedProvider + ' key';
    if (label.includes(raw)) throw new NewsflowError('Use a descriptive label that does not contain the credential.');
    const envVarName = req.body.sourceEnvVar ?? req.body.envVarName;
    if (envVarName !== undefined && (typeof envVarName !== 'string' || !/^[A-Z][A-Z0-9_]{1,63}$/.test(envVarName) || /^(NEWSFLOW_|VAULT_|AWS_)/.test(envVarName))) throw new NewsflowError('The source environment name is not supported.');
    if (envVarName?.includes(raw)) throw new NewsflowError('Use an environment name that does not contain the credential.');
    const keys = getAllKeys();
    const duplicate = keys.find(key => key.provider === selectedProvider && decryptApiKey(key.encryptedData) === raw);
    if (duplicate) return res.json({ key: safeKeyMetadata(duplicate), validation: untested(selectedProvider), message: 'This credential is already stored.', duplicate: true });
    const now = new Date().toISOString();
    const validation = untested(selectedProvider);
    const key: VaultKeyItem = { id: 'key-' + crypto.randomUUID(), label, provider: selectedProvider, envVarName,
      maskedKey: maskKey(raw), encryptedData: encryptApiKey(raw), status: 'untested', validationMessage: validation.message,
      isDefault: false, usageCount: 0, createdAt: now, updatedAt: now };
    saveAllKeys([...keys, key]);
    const auditRecorded = recordSecurityEvent('KEY_CREATED', 'success', key.id);
    res.status(201).json({ key: safeKeyMetadata(key), validation, auditRecorded, message: 'Credential encrypted and saved. Provider connection has not been tested.' });
  }));
  app.post('/api/vault/ping/:id', route(async (req, res) => {
    const snapshot = keyById(req.params.id);
    if (snapshot.status === 'revoked') throw new NewsflowError('Reactivate this key before validating it.', 409);
    recordSecurityEvent('VALIDATION_ATTEMPT', 'info', snapshot.id);
    const validation = await validateApiKey(decryptApiKey(snapshot.encryptedData), snapshot.provider);
    const keys = getAllKeys();
    const key = keys.find(item => item.id === snapshot.id);
    if (!key || key.encryptedData !== snapshot.encryptedData || key.status === 'revoked') throw new NewsflowError('The key changed during validation. Run Test again.', 409);
    key.status = validation.isValid ? 'active' : 'invalid';
    key.validationMessage = validation.message; key.latencyMs = validation.latencyMs;
    key.lastValidatedAt = new Date().toISOString(); key.updatedAt = key.lastValidatedAt;
    saveAllKeys(keys);
    const auditRecorded = recordSecurityEvent(validation.isValid ? 'VALIDATION_SUCCESS' : 'VALIDATION_FAILED', validation.isValid ? 'success' : 'failure', key.id);
    res.json({ key: safeKeyMetadata(key), validation, auditRecorded });
  }));
  app.post('/api/vault/rotate/:id', route((req, res) => {
    const raw = rawKey(req.body.newRawKey);
    const keys = getAllKeys(); const key = keys.find(item => item.id === req.params.id);
    if (!key) throw new NewsflowError('The requested key was not found.', 404);
    if (key.label.includes(raw) || key.envVarName?.includes(raw)) throw new NewsflowError('The replacement credential must not occur in its public metadata.');
    key.encryptedData = encryptApiKey(raw); key.maskedKey = maskKey(raw); key.status = 'untested';
    key.validationMessage = untested(key.provider).message; key.updatedAt = new Date().toISOString();
    delete key.lastValidatedAt; delete key.latencyMs;
    saveAllKeys(keys);
    const auditRecorded = recordSecurityEvent('KEY_ROTATED', 'success', key.id);
    res.json({ key: safeKeyMetadata(key), validation: untested(key.provider), auditRecorded, message: 'Credential rotated. Run Test explicitly before execution.' });
  }));
  app.post('/api/vault/revoke/:id', route((req, res) => {
    const keys = getAllKeys(); const key = keys.find(item => item.id === req.params.id);
    if (!key) throw new NewsflowError('The requested key was not found.', 404);
    key.status = key.status === 'revoked' ? 'untested' : 'revoked';
    key.validationMessage = key.status === 'revoked' ? 'Revoked by the authenticated operator.' : untested(key.provider).message;
    key.updatedAt = new Date().toISOString(); saveAllKeys(keys);
    const auditRecorded = recordSecurityEvent(key.status === 'revoked' ? 'KEY_REVOKED' : 'KEY_REACTIVATED', 'success', key.id);
    res.json({ key: safeKeyMetadata(key), auditRecorded });
  }));
  app.post('/api/vault/set-default/:id', route((req, res) => {
    keyById(req.params.id);
    const now = new Date().toISOString();
    const keys = getAllKeys().map(key => {
      const isDefault = key.id === req.params.id;
      return key.isDefault === isDefault ? key : { ...key, isDefault, updatedAt: now };
    });
    saveAllKeys(keys);
    const auditRecorded = recordSecurityEvent('DEFAULT_SET', 'success', req.params.id);
    res.json({ keys: keys.map(safeKeyMetadata), auditRecorded });
  }));
  app.delete('/api/vault/keys/:id', route((req, res) => {
    keyById(req.params.id);
    const prompts = getAllPrompts().map(prompt => prompt.mappedKeyId === req.params.id ? { ...prompt, mappedKeyId: null } : prompt);
    saveAllPrompts(prompts); saveAllKeys(getAllKeys().filter(key => key.id !== req.params.id));
    const auditRecorded = recordSecurityEvent('KEY_DELETED', 'success', req.params.id);
    res.json({ message: 'Credential deleted.', unlinkedPrompts: true, auditRecorded });
  }));
  const logs = route((req, res) => {
    let items = getAllSecurityLogs();
    for (const name of ['action', 'status', 'trigger']) if (req.query[name] && req.query[name] !== 'all') items = items.filter(item => item[name as keyof typeof item] === req.query[name]);
    const search = text(req.query.search, 200).trim().toLowerCase();
    const searchFields = ['action', 'details', 'keyLabel', 'keyId', 'provider'] as const;
    if (search) items = items.filter(item => searchFields.some(field => typeof item[field] === 'string' && item[field].toLowerCase().includes(search)));
    const requestedLimit = typeof req.query.limit === 'string' ? Number(req.query.limit) : NaN;
    const limit = Number.isFinite(requestedLimit) ? Math.min(500, Math.max(1, Math.floor(requestedLimit))) : 100;
    res.json({ success: true, logs: items.slice(0, limit), stats: { total: items.length,
      validations: items.filter(item => item.action === 'VALIDATION_ATTEMPT').length,
      rotations: items.filter(item => item.action === 'KEY_ROTATED').length,
      revocations: items.filter(item => item.action === 'KEY_REVOKED').length,
      failures: items.filter(item => item.status === 'failure').length, avgLatency: null } });
  });
  app.get('/api/vault/security-logs', logs); app.get('/api/vault/audit-logs', logs);
  app.post('/api/vault/security-logs/clear', route((_req, res) => { clearSecurityLogs(); res.json({ success: true, logs: [] }); }));

  app.get('/api/prompts', route((_req, res) => res.json({ prompts: getAllPrompts() })));
  app.post('/api/prompts', route((req, res) => {
    const fields = promptFields(req.body); const now = new Date().toISOString();
    const prompt: SystemPromptItem = { ...fields, id: 'prompt-' + crypto.randomUUID(), currentVersion: '1.0.0', createdAt: now, updatedAt: now,
      versions: [{ version: '1.0.0', systemPrompt: fields.systemPrompt, userTemplate: fields.userTemplate, createdAt: now,
        notes: text(req.body.initialNotes, 2000, 'Initial version'), author: text(req.body.author, 100, 'Authenticated editor') }] };
    saveAllPrompts([...getAllPrompts(), prompt]); res.status(201).json({ prompt });
  }));
  app.put('/api/prompts/:id', route((req, res) => {
    const prompts = getAllPrompts(); const index = prompts.findIndex(prompt => prompt.id === req.params.id);
    if (index < 0) throw new NewsflowError('The requested prompt was not found.', 404);
    const current = prompts[index]; if (current.versions.length >= 100) throw new NewsflowError('Prompt version limit reached.');
    const fields = promptFields(req.body, current); const now = new Date().toISOString();
    const version = '1.' + current.versions.length + '.0';
    const updated = { ...current, ...fields, currentVersion: version, updatedAt: now,
      versions: [...current.versions, { version, systemPrompt: fields.systemPrompt, userTemplate: fields.userTemplate, createdAt: now,
        notes: text(req.body.versionNotes, 2000, 'Prompt updated'), author: text(req.body.author, 100, 'Authenticated editor') }] };
    prompts[index] = updated; saveAllPrompts(prompts); res.json({ prompt: updated });
  }));
  app.post('/api/prompts/:id/restore-version', route((req, res) => {
    const prompts = getAllPrompts(); const prompt = prompts.find(item => item.id === req.params.id);
    const historical = prompt?.versions.find(version => version.version === req.body.targetVersion);
    if (!prompt || !historical) throw new NewsflowError('The requested prompt version was not found.', 404);
    if (prompt.versions.length >= 100) throw new NewsflowError('Prompt version limit reached.');
    prompt.systemPrompt = historical.systemPrompt; prompt.userTemplate = historical.userTemplate;
    prompt.updatedAt = new Date().toISOString(); prompt.currentVersion = '1.' + prompt.versions.length + '.0';
    prompt.versions.push({ version: prompt.currentVersion, systemPrompt: prompt.systemPrompt, userTemplate: prompt.userTemplate,
      notes: text(req.body.notes, 2000, 'Restored previous version'), author: 'Authenticated editor', createdAt: prompt.updatedAt });
    saveAllPrompts(prompts); res.json({ prompt });
  }));
  app.post('/api/prompts/:id/map-key', route((req, res) => {
    const prompts = getAllPrompts(); const prompt = prompts.find(item => item.id === req.params.id);
    if (!prompt) throw new NewsflowError('The requested prompt was not found.', 404);
    prompt.mappedKeyId = mappedKey(req.body.mappedKeyId);
    prompt.recommendedModel = text(req.body.recommendedModel, 100, prompt.recommendedModel);
    prompt.updatedAt = new Date().toISOString(); saveAllPrompts(prompts); res.json({ prompt });
  }));
  app.delete('/api/prompts/:id', route((req, res) => { saveAllPrompts(getAllPrompts().filter(prompt => prompt.id !== req.params.id)); res.json({ message: 'Prompt deleted.' }); }));
  app.post('/api/prompts/execute', route(async (req, res) => res.json(await executePromptRequest(req.body))));

  app.get('/api/newsflow/samples', route((_req, res) => res.json({ samples: [
    { id: 'sample-local-news', title: 'Local news OCR sample', description: 'A fictional short extraction sample.', category: 'headline-byline',
      content: 'Council approves new library hours\nBy Staff Reporter\nThe city council approved expanded Saturday library hours during its Tuesday meeting.' },
    { id: 'sample-caption', title: 'Caption sample', description: 'A fictional photo cutline.', category: 'caption-parser',
      content: 'Library volunteers sort donated books on Saturday. Photo by Staff Photographer.' },
  ] })));
  app.use((error: any, _req: any, res: any, next: any) => {
    if (res.headersSent) return next(error);
    const code = error instanceof NewsflowError ? error.statusCode : error?.type === 'entity.too.large' ? 413 : error instanceof SyntaxError ? 400 : 500;
    res.status(code).json({ error: error instanceof NewsflowError ? error.message : code === 413 ? 'Request body exceeds the supported limit.' : code === 400 ? 'The request body is invalid.' : 'The requested operation could not be completed.' });
  });
  return app;
}
