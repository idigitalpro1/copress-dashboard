import crypto from 'node:crypto';
// Shared parser never reads a file, process.env, or a provider endpoint.
// @ts-ignore The shared SATCOM module is plain ESM JavaScript.
import { parseEnvFile } from '../../../js/vault-env.mjs';
import { encryptApiKey, decryptApiKey, maskKey, NewsflowError } from './crypto.js';
import { getAllKeys, saveAllKeys, safeKeyMetadata, recordSecurityEvent, type VaultKeyItem } from './storage.js';
import type { Provider } from './providers.js';

const supported = new Set(['gemini', 'openai', 'anthropic', 'custom']);
const forbidden = /^(?:NEWSFLOW_|VAULT_|AWS_)/i;
const providerNames: Record<string, Provider> = { GOOGLE_AGENT_API_KEY: 'gemini', GEMINI_KEY_COPY: 'gemini',
  GEMINI_KEY_VIDEO: 'gemini', GEMINI_KEY_HEALTH: 'gemini', OPENAI_API_KEY: 'openai', ANTHROPIC_API_KEY: 'anthropic' };

export function scanServerEnvCandidates(): never { throw new NewsflowError('Server environment discovery is disabled.', 410); }
export function importSelectedEnvKeys(): never { throw new NewsflowError('Server environment import is disabled. Upload selected credentials explicitly.', 410); }

export function importKeysFromEnv(payload: any) {
  if (!payload || typeof payload !== 'object') throw new NewsflowError('An explicit import payload is required.');
  let parsed: any;
  if (Array.isArray(payload.entries)) {
    if (!payload.entries.length || payload.entries.length > 200) throw new NewsflowError('Select between 1 and 200 credentials.');
    const names = new Set();
    const lines: string[] = [];
    for (const entry of payload.entries) {
      if (!entry || typeof entry.envVarName !== 'string' || !/^[A-Z][A-Z0-9_]{1,63}$/.test(entry.envVarName)
        || forbidden.test(entry.envVarName) || names.has(entry.envVarName) || typeof entry.value !== 'string'
        || /[\r\n"']/.test(entry.value) || !supported.has(entry.provider)) throw new NewsflowError('A selected credential has an unsupported name, value, or provider.');
      names.add(entry.envVarName);
      lines.push(entry.envVarName + "='" + entry.value + "'");
    }
    parsed = parseEnvFile(lines.join('\n'));
    if (parsed.issues.length || parsed.entries.length !== payload.entries.length) throw new NewsflowError('Selected credentials could not be parsed safely. No keys were imported.');
  } else {
    if (typeof payload.envContent !== 'string') throw new NewsflowError('Explicit .env text or selected entries are required.');
    parsed = parseEnvFile(payload.envContent);
  }
  const entries = parsed.entries.filter((entry: any) => !forbidden.test(entry.sourceKey));
  const excluded = parsed.entries.length - entries.length;
  const configured = entries.map((entry: any) => {
    if (entry.sourceKey.includes(entry.credential.value)) throw new NewsflowError('Use an environment name that does not contain its credential.');
    const selected = payload.entries?.find((candidate: any) => candidate.envVarName === entry.sourceKey);
    const override = selected?.provider ?? payload.providerOverrides?.[entry.sourceKey];
    if (override !== undefined && !supported.has(override)) throw new NewsflowError('A selected provider is unsupported.');
    return { ...entry, provider: override || providerNames[entry.credential.envKey] || 'custom', resolved: !entry.credential.ambiguous || override !== undefined };
  }).filter((entry: any) => !Array.isArray(payload.selectedEnvNames) || payload.selectedEnvNames.includes(entry.sourceKey));
  const preview = { entries: configured.map((entry: any) => ({ line: entry.line, envVarName: entry.sourceKey,
    provider: entry.provider, maskedKey: maskKey(entry.credential.value), ambiguous: entry.credential.ambiguous })),
    skipped: parsed.skipped + excluded, issues: parsed.issues };
  if (payload.confirm !== true) return { success: true, preview };
  if (!configured.length || configured.length > 200 || parsed.issues.length) throw new NewsflowError('Resolve import issues and explicitly select valid credentials before confirming.');
  if (configured.some((entry: any) => !entry.resolved)) throw new NewsflowError('Explicitly select a provider for each ambiguous credential before confirming.');

  const keys = getAllKeys();
  const imported: any[] = [];
  const skipped: any[] = [];
  const now = new Date().toISOString();
  for (const entry of configured) {
    const raw = entry.credential.value;
    const duplicate = keys.find(key => key.provider === entry.provider && key.envVarName === entry.sourceKey && decryptApiKey(key.encryptedData) === raw);
    if (duplicate) { skipped.push({ envVarName: entry.sourceKey, reason: 'This exact credential is already stored.' }); continue; }
    const key: VaultKeyItem = { id: 'key-' + crypto.randomUUID(), label: entry.sourceKey, envVarName: entry.sourceKey,
      provider: entry.provider, maskedKey: maskKey(raw), encryptedData: encryptApiKey(raw), status: 'untested',
      validationMessage: 'Saved without contacting the provider. Run an explicit validation before execution.',
      isDefault: false, usageCount: 0, createdAt: now, updatedAt: now };
    keys.push(key);
    imported.push({ keyId: key.id, envVarName: entry.sourceKey, provider: key.provider, maskedKey: key.maskedKey,
      status: key.status, validationMessage: key.validationMessage, createdAt: now, updatedAt: now });
  }
  if (imported.length) saveAllKeys(keys);
  const auditRecorded = !imported.length || recordSecurityEvent('ENV_IMPORTED', 'success');
  return { success: true, auditRecorded, importResult: { totalFound: configured.length, imported, skipped, errors: [] }, keys: keys.map(safeKeyMetadata) };
}
