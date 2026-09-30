import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';

import {
  getAllKeys,
  saveAllKeys,
  findKeyById,
  getDecryptedKeyById,
  getAllPrompts,
  saveAllPrompts,
  findPromptById,
  getAllSecurityLogs,
  addSecurityLogEntry,
  clearSecurityLogs,
  VaultKeyItem,
  SystemPromptItem,
  SecurityLogItem,
} from './server/storage.js';
import { encryptApiKey, maskKey } from './server/crypto.js';
import { validateApiKey, executeLlmPrompt } from './server/providers.js';
import {
  importKeysFromEnv,
  scanServerEnvCandidates,
  importSelectedEnvKeys,
} from './server/env-importer.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Security hardening: Disable x-powered-by header
app.disable('x-powered-by');

// Security hardening: Strict security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// Lightweight In-Memory Rate Limiter for proxy endpoints to prevent brute-force or denial of service
interface RateLimitRecord {
  count: number;
  resetTime: number;
}
const ipRateLimits = new Map<string, RateLimitRecord>();

function createRateLimiter(maxRequests: number, windowMs: number) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.ip || '127.0.0.1';
    const now = Date.now();
    const existing = ipRateLimits.get(clientIp);

    if (!existing || now > existing.resetTime) {
      ipRateLimits.set(clientIp, { count: 1, resetTime: now + windowMs });
      return next();
    }

    if (existing.count >= maxRequests) {
      return res.status(429).json({
        error: 'Too many requests. Please slow down and try again shortly.',
        retryAfterMs: existing.resetTime - now,
      });
    }

    existing.count += 1;
    next();
  };
}

// Clean up stale rate limit entries periodically (every 10 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of ipRateLimits.entries()) {
    if (now > record.resetTime) {
      ipRateLimits.delete(ip);
    }
  }
}, 600000);

// Set sensible body parser limit to avoid memory exhaustion DOS
app.use(express.json({ limit: '2mb' }));

// Apply rate limiting specifically on external API proxy & intake routes
const vaultProxyLimiter = createRateLimiter(60, 60000); // 60 requests per minute
const sandboxExecutionLimiter = createRateLimiter(40, 60000); // 40 execution requests per minute

function sanitizeKey(k: VaultKeyItem) {
  const { encryptedData, ...safeKey } = k;
  return safeKey;
}

// -------------------------------- VAULT API ROUTES --------------------------------

// 1. List all keys (returns masked keys only, never plaintext or internal ciphertext)
app.get('/api/vault/keys', (req, res) => {
  try {
    const keys = getAllKeys().map(sanitizeKey);
    res.json({ keys });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Validate raw key without saving (Intake pre-check)
app.post('/api/vault/test-key', vaultProxyLimiter, async (req, res) => {
  try {
    const { rawKey, providerHint, customEndpointUrl, customHeader } = req.body;
    if (!rawKey) {
      return res.status(400).json({ error: 'rawKey is required' });
    }

    const validation = await validateApiKey(rawKey, providerHint, {
      endpointUrl: customEndpointUrl,
      customHeader,
    });

    res.json({
      validation,
      maskedKey: maskKey(rawKey),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Smart Intake Lane: Validate via Server Proxy & Encrypt at Rest (AES-256)
app.post('/api/vault/validate-and-save', vaultProxyLimiter, async (req, res) => {
  try {
    const {
      rawKey,
      providerHint,
      label,
      customEndpointUrl,
      customHeader,
      allowInvalidSave = false,
    } = req.body;

    if (!rawKey || typeof rawKey !== 'string') {
      return res.status(400).json({ error: 'API key is required' });
    }

    if (rawKey.length > 4096) {
      return res.status(400).json({ error: 'API key exceeds maximum permitted length' });
    }

    if (customEndpointUrl && typeof customEndpointUrl === 'string' && customEndpointUrl.length > 1024) {
      return res.status(400).json({ error: 'Custom endpoint URL exceeds maximum permitted length' });
    }

    const trimmed = rawKey.trim();

    // 1. Server-side lightweight validation ping
    const validation = await validateApiKey(trimmed, providerHint, {
      endpointUrl: customEndpointUrl,
      customHeader,
    });

    if (!validation.isValid && !allowInvalidSave) {
      return res.status(422).json({
        error: 'Key validation failed',
        validation,
        maskedKey: maskKey(trimmed),
      });
    }

    // 2. AES-256 Encryption at Rest
    const encryptedData = encryptApiKey(trimmed);
    const maskedKeyStr = maskKey(trimmed);

    // 3. Determine clean card label if empty
    let cardLabel = label?.trim();
    if (!cardLabel) {
      const providerName = validation.provider.charAt(0).toUpperCase() + validation.provider.slice(1);
      cardLabel = `${providerName} Key (${maskedKeyStr.slice(-4)})`;
    }

    const newKeyItem: VaultKeyItem = {
      id: `key-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      label: cardLabel,
      provider: validation.provider,
      maskedKey: maskedKeyStr,
      encryptedData,
      customEndpointUrl: validation.provider === 'custom' ? customEndpointUrl : undefined,
      customHeader: validation.provider === 'custom' ? customHeader : undefined,
      status: validation.isValid ? 'active' : 'invalid',
      validationMessage: validation.message,
      lastValidatedAt: new Date().toISOString(),
      latencyMs: validation.latencyMs,
      isDefault: getAllKeys().length === 0, // make default if first key
      usageCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const keys = getAllKeys();
    keys.unshift(newKeyItem);
    saveAllKeys(keys);

    addSecurityLogEntry({
      action: 'KEY_CREATED',
      trigger: 'manual',
      keyId: newKeyItem.id,
      keyLabel: newKeyItem.label,
      provider: newKeyItem.provider,
      maskedKey: newKeyItem.maskedKey,
      status: validation.isValid ? 'success' : 'warning',
      actor: 'Intake Pipeline',
      ip: (req.headers['x-forwarded-for'] as string) || req.ip || '127.0.0.1',
      origin: (req.headers['origin'] as string) || 'client-ui',
      details: `New API key validated via proxy and stored with AES-256-GCM. Status: ${validation.isValid ? 'Valid' : 'Invalid'} (${validation.latencyMs}ms).`,
      latencyMs: validation.latencyMs,
      metadata: { isValid: validation.isValid, latencyMs: validation.latencyMs },
    });

    res.status(201).json({
      message: 'Key successfully validated, encrypted with AES-256, and stored in vault.',
      key: sanitizeKey(newKeyItem),
      validation,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Live ping validation for an existing stored key
app.post('/api/vault/ping/:id', vaultProxyLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const keyItem = findKeyById(id);
    if (!keyItem) {
      return res.status(404).json({ error: 'Key not found' });
    }

    const rawKey = getDecryptedKeyById(id);
    if (!rawKey) {
      return res.status(500).json({ error: 'Failed to decrypt key for validation' });
    }

    const validation = await validateApiKey(rawKey, keyItem.provider, {
      endpointUrl: keyItem.customEndpointUrl,
      customHeader: keyItem.customHeader,
    });

    const keys = getAllKeys();
    const idx = keys.findIndex((k) => k.id === id);
    if (idx !== -1) {
      keys[idx].status = validation.isValid ? 'active' : 'invalid';
      keys[idx].validationMessage = validation.message;
      keys[idx].latencyMs = validation.latencyMs;
      keys[idx].lastValidatedAt = new Date().toISOString();
      keys[idx].updatedAt = new Date().toISOString();
      saveAllKeys(keys);

      addSecurityLogEntry({
        action: validation.isValid ? 'VALIDATION_SUCCESS' : 'VALIDATION_FAILED',
        trigger: 'manual',
        keyId: keys[idx].id,
        keyLabel: keys[idx].label,
        provider: keys[idx].provider,
        maskedKey: keys[idx].maskedKey,
        status: validation.isValid ? 'success' : 'failure',
        actor: 'Proxy Validator',
        ip: (req.headers['x-forwarded-for'] as string) || req.ip || '127.0.0.1',
        origin: (req.headers['origin'] as string) || 'client-ui',
        details: `Live health ping check. Status: ${validation.isValid ? 'Verified Active' : 'Invalid / Unreachable'} (${validation.latencyMs || 0}ms). ${validation.message}`,
        latencyMs: validation.latencyMs,
        metadata: { isValid: validation.isValid, latencyMs: validation.latencyMs },
      });
    }

    res.json({
      key: sanitizeKey(keys[idx]),
      validation,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Rotate key (replaces encrypted value, validates new key, keeps prompt mappings)
app.post('/api/vault/rotate/:id', vaultProxyLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const { newRawKey, allowInvalidSave = false } = req.body;

    if (!newRawKey) {
      return res.status(400).json({ error: 'newRawKey is required' });
    }

    const keyItem = findKeyById(id);
    if (!keyItem) {
      return res.status(404).json({ error: 'Key not found' });
    }

    const trimmed = newRawKey.trim();
    const validation = await validateApiKey(trimmed, keyItem.provider, {
      endpointUrl: keyItem.customEndpointUrl,
      customHeader: keyItem.customHeader,
    });

    if (!validation.isValid && !allowInvalidSave) {
      return res.status(422).json({
        error: 'Rotated key validation failed',
        validation,
      });
    }

    const keys = getAllKeys();
    const idx = keys.findIndex((k) => k.id === id);
    if (idx !== -1) {
      const oldMasked = keys[idx].maskedKey;
      keys[idx].encryptedData = encryptApiKey(trimmed);
      keys[idx].maskedKey = maskKey(trimmed);
      keys[idx].status = validation.isValid ? 'active' : 'invalid';
      keys[idx].validationMessage = `Rotated: ${validation.message}`;
      keys[idx].latencyMs = validation.latencyMs;
      keys[idx].lastValidatedAt = new Date().toISOString();
      keys[idx].updatedAt = new Date().toISOString();
      saveAllKeys(keys);

      addSecurityLogEntry({
        action: 'KEY_ROTATED',
        trigger: 'manual',
        keyId: keys[idx].id,
        keyLabel: keys[idx].label,
        provider: keys[idx].provider,
        maskedKey: keys[idx].maskedKey,
        status: validation.isValid ? 'success' : 'warning',
        actor: 'Admin User',
        ip: (req.headers['x-forwarded-for'] as string) || req.ip || '127.0.0.1',
        origin: (req.headers['origin'] as string) || 'client-ui',
        details: `Key rotated. Previous signature: ${oldMasked} -> New signature: ${keys[idx].maskedKey}. Validation: ${validation.isValid ? 'Verified Active' : 'Failed'} (${validation.latencyMs || 0}ms).`,
        latencyMs: validation.latencyMs,
        metadata: { oldMasked, newMasked: keys[idx].maskedKey, latencyMs: validation.latencyMs },
      });
    }

    res.json({
      message: 'Key rotated successfully and encrypted with AES-256.',
      key: sanitizeKey(keys[idx]),
      validation,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Revoke / Deactivate key
app.post('/api/vault/revoke/:id', (req, res) => {
  try {
    const { id } = req.params;
    const keys = getAllKeys();
    const idx = keys.findIndex((k) => k.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Key not found' });
    }

    const currentStatus = keys[idx].status;
    keys[idx].status = currentStatus === 'revoked' ? 'active' : 'revoked';
    keys[idx].validationMessage =
      keys[idx].status === 'revoked'
        ? 'Manually revoked by administrator'
        : 'Re-activated by administrator';
    keys[idx].updatedAt = new Date().toISOString();
    saveAllKeys(keys);

    addSecurityLogEntry({
      action: keys[idx].status === 'revoked' ? 'KEY_REVOKED' : 'KEY_REACTIVATED',
      trigger: 'manual',
      keyId: keys[idx].id,
      keyLabel: keys[idx].label,
      provider: keys[idx].provider,
      maskedKey: keys[idx].maskedKey,
      status: keys[idx].status === 'revoked' ? 'warning' : 'success',
      actor: 'Admin User',
      ip: (req.headers['x-forwarded-for'] as string) || req.ip || '127.0.0.1',
      origin: (req.headers['origin'] as string) || 'client-ui',
      details:
        keys[idx].status === 'revoked'
          ? `Key '${keys[idx].label}' manually revoked. Immediate operational halt enforced.`
          : `Key '${keys[idx].label}' manually re-activated by administrator.`,
      metadata: { previousStatus: currentStatus, newStatus: keys[idx].status },
    });

    res.json({ key: sanitizeKey(keys[idx]) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Delete key
app.delete('/api/vault/keys/:id', (req, res) => {
  try {
    const { id } = req.params;
    let keys = getAllKeys();
    const targetKey = keys.find((k) => k.id === id);
    if (!targetKey) {
      return res.status(404).json({ error: 'Key not found' });
    }

    keys = keys.filter((k) => k.id !== id);
    saveAllKeys(keys);

    // Unlink any prompts mapped to this key
    const prompts = getAllPrompts();
    prompts.forEach((p) => {
      if (p.mappedKeyId === id) {
        p.mappedKeyId = null;
      }
    });
    saveAllPrompts(prompts);

    addSecurityLogEntry({
      action: 'KEY_DELETED',
      trigger: 'manual',
      keyId: id,
      keyLabel: targetKey.label,
      provider: targetKey.provider,
      maskedKey: targetKey.maskedKey,
      status: 'warning',
      actor: 'Admin User',
      ip: (req.headers['x-forwarded-for'] as string) || req.ip || '127.0.0.1',
      origin: (req.headers['origin'] as string) || 'client-ui',
      details: `Key '${targetKey.label}' permanently purged from AES-256 vault. Linked prompts disassociated.`,
      metadata: { purgedKeyId: id },
    });

    res.json({ message: 'Key deleted successfully', unlinkedPrompts: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Set default key
app.post('/api/vault/set-default/:id', (req, res) => {
  try {
    const { id } = req.params;
    const keys = getAllKeys();
    const target = keys.find((k) => k.id === id);
    keys.forEach((k) => {
      k.isDefault = k.id === id;
    });
    saveAllKeys(keys);

    if (target) {
      addSecurityLogEntry({
        action: 'DEFAULT_SET',
        trigger: 'manual',
        keyId: id,
        keyLabel: target.label,
        provider: target.provider,
        maskedKey: target.maskedKey,
        status: 'info',
        actor: 'Admin User',
        ip: (req.headers['x-forwarded-for'] as string) || req.ip || '127.0.0.1',
        origin: (req.headers['origin'] as string) || 'client-ui',
        details: `Key '${target.label}' set as primary default orchestrator credential.`,
      });
    }

    res.json({ keys: keys.map(sanitizeKey) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Check environment status & return detected keys from server environment
app.get('/api/vault/environment-status', async (req, res) => {
  try {
    const hasEnvGeminiKey =
      Boolean(process.env.GEMINI_API_KEY) && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY';
    
    const scanResult = await scanServerEnvCandidates();

    res.json({
      hasEnvGeminiKey,
      hasMasterKey: true,
      encryptionAlgorithm: 'AES-256-GCM',
      detectedKeys: scanResult.candidates || [],
      newCandidatesCount: scanResult.newCandidatesCount || 0,
      totalFound: scanResult.totalFound || 0,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to check environment status' });
  }
});

// 10. Fetch environment variables from the server-side, validate against vault schema
app.get('/api/vault/env-candidates', async (req, res) => {
  try {
    const scanResult = await scanServerEnvCandidates();
    res.json({
      success: true,
      ...scanResult,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to scan server environment' });
  }
});

// 11. Import selected validated environment variables as new active vault keys
app.post('/api/vault/import-selected-env', async (req, res) => {
  try {
    const { selectedKeys } = req.body;
    if (!Array.isArray(selectedKeys) || selectedKeys.length === 0) {
      return res.status(400).json({ error: 'selectedKeys array is required.' });
    }

    const importResult = await importSelectedEnvKeys(selectedKeys);
    const updatedKeys = getAllKeys().map(sanitizeKey);

    res.json({
      success: true,
      importResult,
      keys: updatedKeys,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to import selected keys' });
  }
});

// 12. Batch import keys from .env files or raw .env text and place into vault
app.post('/api/vault/import-env', async (req, res) => {
  try {
    const { envContent } = req.body || {};
    const importResult = await importKeysFromEnv(envContent);
    const updatedKeys = getAllKeys().map(sanitizeKey);

    res.json({
      success: true,
      importResult,
      keys: updatedKeys,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to import from .env' });
  }
});

// 13. Security Audit Logs: Fetch logs with metrics, filtering, and pagination
const handleSecurityAuditLogs = (req: express.Request, res: express.Response) => {
  try {
    const { action, status, trigger, search, limit = '100' } = req.query as {
      action?: string;
      status?: string;
      trigger?: string;
      search?: string;
      limit?: string;
    };

    let logs = getAllSecurityLogs();

    // Compute metrics over all logs before filtering
    const totalCount = logs.length;
    const validationCount = logs.filter(
      (l) => l.action.toUpperCase().includes('VALIDAT') || l.action === 'validation'
    ).length;
    const rotationCount = logs.filter(
      (l) => l.action.toUpperCase().includes('ROTAT') || l.action === 'rotation'
    ).length;
    const revocationCount = logs.filter(
      (l) =>
        l.action.toUpperCase().includes('REVOK') ||
        l.action.toUpperCase().includes('REACTIVAT') ||
        l.action === 'revocation'
    ).length;
    const failureCount = logs.filter(
      (l) => l.status === 'failure' || l.action === 'VALIDATION_FAILED'
    ).length;

    const latencies = logs
      .filter((l) => typeof l.latencyMs === 'number')
      .map((l) => l.latencyMs!);
    const avgLatency =
      latencies.length > 0
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
        : 0;

    // Apply filtering
    if (action && action !== 'all') {
      const qAct = action.toUpperCase();
      logs = logs.filter((l) => {
        const itemAct = l.action.toUpperCase();
        if (qAct === 'VALIDATION' || qAct === 'VALIDATIONS') {
          return itemAct.includes('VALIDAT');
        }
        if (qAct === 'ROTATION' || qAct === 'ROTATIONS') {
          return itemAct.includes('ROTAT');
        }
        if (qAct === 'REVOCATION' || qAct === 'REVOCATIONS') {
          return itemAct.includes('REVOK') || itemAct.includes('REACTIVAT');
        }
        if (qAct === 'IMPORT' || qAct === 'IMPORTS' || qAct === 'ENV_IMPORTED') {
          return itemAct.includes('IMPORT');
        }
        if (qAct === 'CREATION' || qAct === 'KEY_CREATED') {
          return itemAct.includes('CREAT');
        }
        return itemAct === qAct || l.action === action;
      });
    }

    if (status && status !== 'all') {
      logs = logs.filter((l) => l.status.toLowerCase() === status.toLowerCase());
    }

    if (trigger && trigger !== 'all') {
      logs = logs.filter((l) => l.trigger === trigger);
    }

    if (search && search.trim()) {
      const q = search.toLowerCase().trim();
      logs = logs.filter(
        (l) =>
          l.details?.toLowerCase().includes(q) ||
          l.keyLabel?.toLowerCase().includes(q) ||
          l.maskedKey?.toLowerCase().includes(q) ||
          l.provider?.toLowerCase().includes(q) ||
          l.actor?.toLowerCase().includes(q) ||
          l.action?.toLowerCase().includes(q) ||
          l.ip?.toLowerCase().includes(q)
      );
    }

    const parsedLimit = Math.max(1, Math.min(parseInt(limit, 10) || 100, 500));
    const paginatedLogs = logs.slice(0, parsedLimit);

    // Guaranteed Zero-Leak payload: strictly safe fields only
    const sanitizedLogs = paginatedLogs.map((l) => ({
      id: l.id,
      timestamp: l.timestamp,
      action: l.action,
      trigger: l.trigger || 'manual',
      keyId: l.keyId,
      keyLabel: l.keyLabel,
      provider: l.provider,
      maskedKey: l.maskedKey,
      status: l.status,
      actor: l.actor,
      details: l.details,
      latencyMs: l.latencyMs,
      ip: l.ip,
      origin: l.origin,
      metadata: l.metadata,
    }));

    res.json({
      success: true,
      logs: sanitizedLogs,
      stats: {
        total: totalCount,
        validations: validationCount,
        rotations: rotationCount,
        revocations: revocationCount,
        failures: failureCount,
        avgLatency,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch security logs' });
  }
};

app.get('/api/vault/security-logs', handleSecurityAuditLogs);
app.get('/api/vault/audit-logs', handleSecurityAuditLogs);

// Clear or reset security logs
app.post('/api/vault/security-logs/clear', (req, res) => {
  try {
    clearSecurityLogs();
    const logs = getAllSecurityLogs();
    res.json({ success: true, message: 'Security audit logs reset.', logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------- PROMPT MANAGER API ROUTES --------------------------------

// List all prompts
app.get('/api/prompts', (req, res) => {
  try {
    const prompts = getAllPrompts();
    res.json({ prompts });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create new prompt
app.post('/api/prompts', (req, res) => {
  try {
    const {
      title,
      description,
      category = 'custom',
      systemPrompt,
      userTemplate = '',
      targetFormat = 'json',
      recommendedModel = 'gemini-3.8-flash',
      mappedKeyId = null,
      temperature = 0.2,
      tags = [],
      author = 'Newsroom Editor',
      initialNotes = 'Initial version created.',
    } = req.body;

    if (!title || !systemPrompt) {
      return res.status(400).json({ error: 'Title and system prompt are required.' });
    }

    const newPrompt: SystemPromptItem = {
      id: `prompt-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      title: title.trim(),
      description: description?.trim() || '',
      category,
      currentVersion: '1.0.0',
      systemPrompt: systemPrompt.trim(),
      userTemplate: userTemplate.trim(),
      targetFormat,
      recommendedModel,
      mappedKeyId,
      temperature: Number(temperature) || 0.2,
      tags: Array.isArray(tags) ? tags : [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      versions: [
        {
          version: '1.0.0',
          systemPrompt: systemPrompt.trim(),
          userTemplate: userTemplate.trim(),
          notes: initialNotes,
          createdAt: new Date().toISOString(),
          author,
        },
      ],
    };

    const prompts = getAllPrompts();
    prompts.unshift(newPrompt);
    saveAllPrompts(prompts);

    res.status(201).json({ prompt: newPrompt });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update prompt (bumps version or updates in place)
app.put('/api/prompts/:id', (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      category,
      systemPrompt,
      userTemplate,
      targetFormat,
      recommendedModel,
      mappedKeyId,
      temperature,
      tags,
      versionNotes = 'Prompt updated.',
      author = 'Editor',
      bumpVersion = true,
    } = req.body;

    const prompts = getAllPrompts();
    const idx = prompts.findIndex((p) => p.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Prompt not found' });
    }

    const existing = prompts[idx];
    let nextVersion = existing.currentVersion;

    if (bumpVersion) {
      const parts = existing.currentVersion.split('.').map(Number);
      if (parts.length === 3) {
        parts[1] += 1; // bump minor: 1.1.0 -> 1.2.0
        parts[2] = 0;
        nextVersion = parts.join('.');
      } else {
        nextVersion = `1.${existing.versions.length}.0`;
      }
    }

    const updatedPrompt: SystemPromptItem = {
      ...existing,
      title: title ? title.trim() : existing.title,
      description: description !== undefined ? description.trim() : existing.description,
      category: category || existing.category,
      systemPrompt: systemPrompt ? systemPrompt.trim() : existing.systemPrompt,
      userTemplate: userTemplate !== undefined ? userTemplate.trim() : existing.userTemplate,
      targetFormat: targetFormat || existing.targetFormat,
      recommendedModel: recommendedModel || existing.recommendedModel,
      mappedKeyId: mappedKeyId !== undefined ? mappedKeyId : existing.mappedKeyId,
      temperature: temperature !== undefined ? Number(temperature) : existing.temperature,
      tags: Array.isArray(tags) ? tags : existing.tags,
      currentVersion: nextVersion,
      updatedAt: new Date().toISOString(),
      versions: [
        ...existing.versions,
        {
          version: nextVersion,
          systemPrompt: systemPrompt ? systemPrompt.trim() : existing.systemPrompt,
          userTemplate: userTemplate !== undefined ? userTemplate.trim() : existing.userTemplate,
          notes: versionNotes,
          createdAt: new Date().toISOString(),
          author,
        },
      ],
    };

    prompts[idx] = updatedPrompt;
    saveAllPrompts(prompts);

    res.json({ prompt: updatedPrompt });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Restore older version
app.post('/api/prompts/:id/restore-version', (req, res) => {
  try {
    const { id } = req.params;
    const { targetVersion, notes = 'Restored previous version.' } = req.body;

    const prompts = getAllPrompts();
    const idx = prompts.findIndex((p) => p.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Prompt not found' });
    }

    const existing = prompts[idx];
    const historical = existing.versions.find((v) => v.version === targetVersion);
    if (!historical) {
      return res.status(404).json({ error: `Version ${targetVersion} not found in history.` });
    }

    // Bump version as a restore event
    const parts = existing.currentVersion.split('.').map(Number);
    parts[1] += 1;
    const newVersion = parts.join('.');

    existing.currentVersion = newVersion;
    existing.systemPrompt = historical.systemPrompt;
    existing.userTemplate = historical.userTemplate;
    existing.updatedAt = new Date().toISOString();
    existing.versions.push({
      version: newVersion,
      systemPrompt: historical.systemPrompt,
      userTemplate: historical.userTemplate,
      notes: `${notes} (Reverted from ${targetVersion})`,
      createdAt: new Date().toISOString(),
      author: 'Revert Action',
    });

    prompts[idx] = existing;
    saveAllPrompts(prompts);

    res.json({ prompt: existing });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Map prompt to API key
app.post('/api/prompts/:id/map-key', (req, res) => {
  try {
    const { id } = req.params;
    const { mappedKeyId, recommendedModel } = req.body;

    const prompts = getAllPrompts();
    const idx = prompts.findIndex((p) => p.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Prompt not found' });
    }

    if (mappedKeyId) {
      const keyExists = findKeyById(mappedKeyId);
      if (!keyExists) {
        return res.status(404).json({ error: 'Selected API Key not found in vault' });
      }
    }

    prompts[idx].mappedKeyId = mappedKeyId || null;
    if (recommendedModel) {
      prompts[idx].recommendedModel = recommendedModel;
    }
    prompts[idx].updatedAt = new Date().toISOString();
    saveAllPrompts(prompts);

    res.json({ prompt: prompts[idx] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete prompt
app.delete('/api/prompts/:id', (req, res) => {
  try {
    const { id } = req.params;
    let prompts = getAllPrompts();
    prompts = prompts.filter((p) => p.id !== id);
    saveAllPrompts(prompts);
    res.json({ message: 'Prompt deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------- SANDBOX EXECUTION PROXY --------------------------------

app.post('/api/prompts/execute', sandboxExecutionLimiter, async (req, res) => {
  let decryptedKey: string | null = null;
  try {
    const {
      promptId,
      systemPrompt: rawSystemPrompt,
      userTemplate: rawUserTemplate,
      inputText,
      keyId,
      modelOverride,
      temperature,
      outputFormat,
    } = req.body;

    if (!inputText || typeof inputText !== 'string') {
      return res.status(400).json({ error: 'Input text is required for testing.' });
    }

    // Resolve system prompt and user template
    let systemPrompt = rawSystemPrompt;
    let userTemplate = rawUserTemplate || '';
    let targetFormat = outputFormat || 'json';
    let targetModel = modelOverride;
    let resolvedKeyId = keyId;

    if (promptId) {
      const storedPrompt = findPromptById(promptId);
      if (storedPrompt) {
        if (!systemPrompt) systemPrompt = storedPrompt.systemPrompt;
        if (!userTemplate) userTemplate = storedPrompt.userTemplate;
        if (!targetFormat) targetFormat = storedPrompt.targetFormat;
        if (!targetModel) targetModel = storedPrompt.recommendedModel;
        if (!resolvedKeyId) resolvedKeyId = storedPrompt.mappedKeyId;
      }
    }

    // Resolve key
    let keyItem: VaultKeyItem | undefined;

    if (resolvedKeyId) {
      keyItem = findKeyById(resolvedKeyId);
      if (keyItem) {
        if (keyItem.status === 'revoked') {
          return res.status(400).json({
            error: `Mapped API key '${keyItem.label}' is currently Revoked. Please rotate or re-activate the key.`,
          });
        }
        decryptedKey = getDecryptedKeyById(resolvedKeyId);
      }
    }

    // Fallback to default key or environment key if none selected
    if (!decryptedKey) {
      const keys = getAllKeys();
      const defaultKey = keys.find((k) => k.isDefault && k.status === 'active') || keys.find((k) => k.status === 'active');
      if (defaultKey) {
        keyItem = defaultKey;
        decryptedKey = getDecryptedKeyById(defaultKey.id);
      }
    }

    // If still no key, check process.env.GEMINI_API_KEY
    if (!decryptedKey && process.env.GEMINI_API_KEY) {
      decryptedKey = process.env.GEMINI_API_KEY;
      keyItem = {
        id: 'env-gemini',
        label: 'System Environment Gemini Key',
        provider: 'gemini',
        maskedKey: maskKey(decryptedKey),
        encryptedData: '',
        status: 'active',
        validationMessage: 'Auto environment key',
        isDefault: true,
        usageCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    if (!decryptedKey) {
      return res.status(400).json({
        error: 'No active API Key found in vault. Please add or enable a key in the Vault module first.',
      });
    }

    const provider = keyItem?.provider || 'gemini';

    // Increment key usage count
    if (keyItem && keyItem.id) {
      const keys = getAllKeys();
      const kIdx = keys.findIndex((k) => k.id === keyItem!.id);
      if (kIdx !== -1) {
        keys[kIdx].usageCount = (keys[kIdx].usageCount || 0) + 1;
        saveAllKeys(keys);
      }
    }

    const executionResult = await executeLlmPrompt({
      systemPrompt: systemPrompt || 'You are an automated newspaper processing agent.',
      userPrompt: userTemplate,
      inputText,
      provider,
      apiKey: decryptedKey,
      model: targetModel,
      temperature,
      outputFormat: targetFormat,
    });

    res.json({
      success: true,
      result: executionResult,
      keyUsed: {
        id: keyItem?.id,
        label: keyItem?.label,
        provider: keyItem?.provider,
        maskedKey: keyItem?.maskedKey,
      },
    });
  } catch (err: any) {
    console.error('Execution proxy error:', err);
    let safeMessage = err.message || 'Execution error during LLM request';
    // Defense: strip any sensitive credentials if present in error message
    if (decryptedKey && decryptedKey.length > 5) {
      safeMessage = safeMessage.replaceAll(decryptedKey, '[REDACTED_API_KEY]');
    }
    res.status(500).json({
      error: safeMessage,
      providerError: true,
    });
  }
});

// -------------------------------- SAMPLE NEWSPAPER EXTRACTS --------------------------------

app.get('/api/samples', (req, res) => {
  res.json({
    samples: [
      {
        id: 'sample-frontpage-metro',
        title: 'Front Page Metro News (Multi-Column Jumps & Datelines)',
        description: 'Noisy OCR broadsheet front page with banner deck, jump lines, split hyphens, and sidebars.',
        category: 'column-layout',
        content: `THE METROPOLITAN CHRONICLE • VOL. CXLVII No. 51,209 • FRIDAY, OCTOBER 17 • $2.50
[PAGE A1 FRONT BANNER]

CITY COUNCIL APPROVES $4.2B TRANSIT OVERHAUL AMID BITTER DEBATE
Opposition Warns of Ten-Year Tax Assessment; Mayor Pledges Groundbreaking by Spring

BY ELIZABETH VANCE AND MARCUS STERLING
Chronicle Staff Writers

CHICAGO — After a contentious fourteen-hour emergency session stretch-
ing into early Friday morning, the City Council voted 32-18 to author-
ize the largest public transit modernization package in municipal his-
tory. The measure will fund full electrification of sixty-four miles of
rapid transit rail and replace the city's aging diesel bus fleet with zero-
emission vehicles.

"This is an unapologetic investment in our urban infrastructure," Mayor
Helena Rossi said during a 2 a.m. press briefing in the City Hall rotun-
da. "For four decades, our neighborhoods have borne the weight of de-
layed maintenance and crumbling stations. Today, we chose the future."

[CONTINUED ON PAGE A14, COLUMN 2]
[ADVERTISEMENT: METRO FIRST FIDELITY BANK — LOW RATE AUTO LOANS]

Opponents of the ordinance, led by 14th Ward Alderman Raymond Burke,
staged a walkout prior to the roll call, arguing the financing mechanism
relies excessively on a projected 1.25% commercial real estate surtax.

"Small businesses across the western corridors cannot absorb another
unfunded mandate," Burke said, holding up a sheaf of financial pro-
jections prepared by the Civic Federation. "We are mortgaging our eco-
nomic recovery on unproven ridership forecasts."

[PULL QUOTE: "Small businesses across the western corridors cannot absorb another unfunded mandate."]

According to transit authority estimates, construction on the Blue Line
expansion will commence in March 2027, with anticipated phase-one
completion scheduled for autumn 2029. Commuters will face rolling week-
end service curtailments along the Dearborn subway corridor.`,
      },
      {
        id: 'sample-sports-agate',
        title: 'Sports Agate: Baseball Box Score & Lineup Statistics',
        description: 'Dense tabular baseball box score with inning-by-inning runs, pitching lines, and OCR spacing drift.',
        category: 'sports-scores',
        content: `BASEBALL | AMERICAN LEAGUE EAST
FENWAY PARK • ATTENDANCE: 37,422 • TIME: 2:48

NEW YORK YANKEES 6, BOSTON RED SOX 4

New York (A)        AB R H RBI BB SO AVG
Torres 2b           4  1 1 0   1  1  .278
Soto rf             3  2 2 3   2  0  .296
Judge cf            4  1 2 2   1  1  .322
Stanton dh          4  0 0 0   0  2  .241
Wells c             4  0 0 0   0  1  .249
Volpe ss            4  1 1 0   0  1  .252
Totals              35 6 9 5   4  8

Boston (A)          AB R H RBI BB SO AVG
Duran cf            5  1 2 0   0  2  .284
Devers 3b           4  1 1 2   1  1  .292
O'Neill lf          4  1 1 1   0  2  .255
Yoshida dh          4  0 1 0   0  0  .280
Story ss            3  0 0 0   1  1  .232
Totals              33 4 8 4   2  9

New York            0 2 0  0 3 0  1 0 0 — 6 9 1
Boston              1 0 0  2 0 0  0 1 0 — 4 8 0

E: Volpe (12). LOB: New York 7, Boston 6. 2B: Soto (28), Duran 2 (34). HR: Judge (48), Devers (26). SB: Volpe (24).

PITCHING LINES:
New York            IP  H R ER BB SO HR ERA
Cole W, 14-4        6.2 5 3 3  1  7  1  2.88
Weaver H, 18        1.1 2 1 1  0  1  1  3.12
Holmes S, 29        1.0 1 0 0  1  1  0  2.64

Boston              IP  H R ER BB SO HR ERA
Houck L, 11-8       5.0 6 5 5  3  5  1  3.34
Bernardino          2.0 2 1 1  1  2  0  3.80
Jansen              2.0 1 0 0  0  1  0  2.95`,
      },
      {
        id: 'sample-wire-dispatch',
        title: 'Wire Copy: Global Economic Dispatch (AP / Reuters)',
        description: 'Raw international wire dispatch with teletype sluglines, priority flags, and photo captions.',
        category: 'wire-normalizer',
        content: `^BC-EU--CENTRAL-BANKS-INFLATION-ADV28, 4th Ld-Writethru
09-28 0914EDT
URGENT
FINANCIAL - INTERNATIONAL

CENTRAL BANKS SIGNAL EXTENDED PAUSE AS ENERGY COSTS REBOUND
By JURGEN SCHMIDT and VALERIE DUPONT
Associated Press

FRANKFURT, Germany (AP) — The European Central Bank kept its benchmark
deposit rate unchanged at 3.5% on Thursday, echoing recent signals
from the U.S. Federal Reserve that monetary authorities are entering
a protracted observation window following eighteen months of aggressive
tightening.

While headline euro-zone inflation receded to 2.2% last month, ECB
President Christine Lagarde cautioned that volatile crude benchmarks
and persistent wage growth in the services sector prevent policymakers
from declaring complete victory over consumer price pressures.

"We are not pre-committing to a particular rate path," Lagarde stated
at the post-meeting press conference in Frankfurt. "Incoming data will
determine the velocity and magnitude of future recalibrations."

PHOTO CUTLINE: [AP Photo/Michael Probst, File]
European Central Bank President Christine Lagarde gestures during a media
briefing at the bank's headquarters in Frankfurt, Germany, Thursday,
Sept. 28, 2026. Looking on at left is ECB Vice-President Luis de Guindos.

Market reaction was subdued across continental bourses, with the DAX in
Frankfurt slipping 0.15% and Paris's CAC 40 holding flat. Currency
traders pushed the euro marginally higher against the dollar to $1.0845.`,
      },
    ],
  });
});

// -------------------------------- VITE & STATIC HANDLING --------------------------------

async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NewsFlow Orchestrator server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
});
