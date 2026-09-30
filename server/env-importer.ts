import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { getAllKeys, saveAllKeys, VaultKeyItem, addSecurityLogEntry } from './storage.js';
import { encryptApiKey, maskKey } from './crypto.js';
import { validateApiKey } from './providers.js';

const KNOWN_PLACEHOLDERS = new Set([
  'MY_GEMINI_API_KEY',
  'MY_APP_URL',
  'YOUR_API_KEY',
  'YOUR_OPENAI_API_KEY',
  'YOUR_ANTHROPIC_API_KEY',
  'PLACEHOLDER',
  'CHANGE_ME',
  'XXX',
  '',
]);

// Explicit blocklist: Never scan or expose system, cloud, or container credentials
const BLOCKED_SYSTEM_VARS = new Set([
  'VAULT_MASTER_KEY',
  'NODE_ENV',
  'PATH',
  'HOME',
  'USER',
  'SHELL',
  'PWD',
  'LANG',
  'HOSTNAME',
  'PORT',
  'SSH_AUTH_SOCK',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'KUBERNETES_SERVICE_HOST',
  'GCP_PROJECT',
  'GOOGLE_APPLICATION_CREDENTIALS',
]);

export interface EnvCandidate {
  envVarName: string;
  provider: 'gemini' | 'openai' | 'anthropic' | 'custom';
  maskedKey: string;
  source: string;
  isValid: boolean;
  validationMessage: string;
  latencyMs?: number;
  alreadyInVault: boolean;
  existingKeyId?: string;
  suggestedLabel: string;
  recommendedModel: string;
}

/**
 * Reads all candidate environment variables from disk .env files and process.env
 */
function collectServerEnvVars(): { name: string; value: string; source: string }[] {
  const result: { name: string; value: string; source: string }[] = [];
  const seenVars = new Set<string>();

  const envFiles = [
    { file: '.env.local', source: '.env.local' },
    { file: '.env', source: '.env' },
    { file: '.env.development', source: '.env.development' },
    { file: '.env.production', source: '.env.production' },
  ];

  for (const { file, source } of envFiles) {
    const fullPath = path.resolve(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const parsed = dotenv.parse(content);
        for (const [key, value] of Object.entries(parsed)) {
          if (value && typeof value === 'string' && !seenVars.has(key)) {
            seenVars.add(key);
            result.push({ name: key, value: value.trim(), source });
          }
        }
      } catch (err: any) {
        console.warn(`Error reading ${file}:`, err.message);
      }
    }
  }

  // Also inspect runtime process.env
  for (const [key, value] of Object.entries(process.env)) {
    if (value && typeof value === 'string' && !seenVars.has(key)) {
      seenVars.add(key);
      result.push({ name: key, value: value.trim(), source: 'process.env' });
    }
  }

  return result;
}

/**
 * Fetches environment variables from the server-side,
 * filters for API key candidates, and validates them against the key vault schema
 */
export async function scanServerEnvCandidates(): Promise<{
  candidates: EnvCandidate[];
  newCandidatesCount: number;
  totalFound: number;
}> {
  const envVars = collectServerEnvVars();
  const existingVaultKeys = getAllKeys();
  const existingMaskedMap = new Map<string, VaultKeyItem>();
  for (const k of existingVaultKeys) {
    existingMaskedMap.set(k.maskedKey, k);
  }

  const candidates: EnvCandidate[] = [];
  let newCandidatesCount = 0;

  for (const { name, value, source } of envVars) {
    // Explicit blocklist check: Never scan system/OS credentials
    if (BLOCKED_SYSTEM_VARS.has(name) || name.startsWith('VAULT_') || name.startsWith('AWS_')) {
      continue;
    }

    // Filter out placeholders and empty values
    if (!value || KNOWN_PLACEHOLDERS.has(value.toUpperCase()) || value.length < 8) {
      continue;
    }

    // Check if named like an API key or matches known provider patterns
    const isNamedLikeKey =
      name.toUpperCase().includes('KEY') ||
      name.toUpperCase().includes('TOKEN') ||
      name.toUpperCase().includes('SECRET') ||
      name.toUpperCase().includes('GEMINI') ||
      name.toUpperCase().includes('OPENAI') ||
      name.toUpperCase().includes('ANTHROPIC') ||
      name.toUpperCase().includes('CLAUDE') ||
      name.toUpperCase().includes('DEEPSEEK') ||
      name.toUpperCase().includes('MISTRAL') ||
      name.toUpperCase().includes('COHERE');

    const matchesKnownPrefix =
      value.startsWith('AIzaSy') ||
      value.startsWith('sk-ant-') ||
      value.startsWith('sk-proj-') ||
      value.startsWith('sk-');

    if (!isNamedLikeKey && !matchesKnownPrefix) {
      continue;
    }

    // Determine provider
    let provider: 'gemini' | 'openai' | 'anthropic' | 'custom' = 'custom';
    let recommendedModel = 'gemini-3.8-flash';

    if (value.startsWith('AIzaSy') || name.toUpperCase().includes('GEMINI')) {
      provider = 'gemini';
      recommendedModel = 'gemini-3.8-flash';
    } else if (
      value.startsWith('sk-ant-') ||
      name.toUpperCase().includes('ANTHROPIC') ||
      name.toUpperCase().includes('CLAUDE')
    ) {
      provider = 'anthropic';
      recommendedModel = 'claude-3-5-sonnet-20241022';
    } else if (value.startsWith('sk-') || name.toUpperCase().includes('OPENAI')) {
      provider = 'openai';
      recommendedModel = 'gpt-4o-mini';
    }

    const maskedKeyStr = maskKey(value);
    const existing = existingMaskedMap.get(maskedKeyStr);
    const alreadyInVault = Boolean(existing);

    // Perform server-side validation ping
    const validation = await validateApiKey(value, provider);

    const prettyProvider = provider.charAt(0).toUpperCase() + provider.slice(1);
    const suggestedLabel = `${prettyProvider} (${name})`;

    candidates.push({
      envVarName: name,
      provider: validation.provider,
      maskedKey: maskedKeyStr,
      source,
      isValid: validation.isValid,
      validationMessage: validation.message,
      latencyMs: validation.latencyMs,
      alreadyInVault,
      existingKeyId: existing?.id,
      suggestedLabel,
      recommendedModel,
    });

    if (!alreadyInVault) {
      newCandidatesCount++;
    }
  }

  return {
    candidates,
    newCandidatesCount,
    totalFound: candidates.length,
  };
}

/**
 * Imports specific selected environment variables into the vault with AES-256 encryption
 */
export async function importSelectedEnvKeys(
  selectedKeys: { envVarName: string; label?: string; isDefault?: boolean }[]
): Promise<{
  importedCount: number;
  importedKeys: VaultKeyItem[];
  errors: string[];
}> {
  const envVars = collectServerEnvVars();
  const envMap = new Map<string, string>();
  for (const { name, value } of envVars) {
    if (!envMap.has(name)) {
      envMap.set(name, value);
    }
  }

  const existingVaultKeys = getAllKeys();
  const existingMaskedSet = new Set(existingVaultKeys.map((k) => k.maskedKey));
  const keysToSave = [...existingVaultKeys];
  const importedKeys: VaultKeyItem[] = [];
  const errors: string[] = [];

  for (const item of selectedKeys) {
    const rawValue = envMap.get(item.envVarName);
    if (!rawValue) {
      errors.push(`Variable '${item.envVarName}' not found in server environment.`);
      continue;
    }

    const masked = maskKey(rawValue);
    if (existingMaskedSet.has(masked)) {
      // already in vault
      continue;
    }

    let provider: 'gemini' | 'openai' | 'anthropic' | 'custom' = 'custom';
    if (rawValue.startsWith('AIzaSy') || item.envVarName.toUpperCase().includes('GEMINI')) {
      provider = 'gemini';
    } else if (
      rawValue.startsWith('sk-ant-') ||
      item.envVarName.toUpperCase().includes('ANTHROPIC') ||
      item.envVarName.toUpperCase().includes('CLAUDE')
    ) {
      provider = 'anthropic';
    } else if (rawValue.startsWith('sk-') || item.envVarName.toUpperCase().includes('OPENAI')) {
      provider = 'openai';
    }

    try {
      const validation = await validateApiKey(rawValue, provider);
      const encryptedData = encryptApiKey(rawValue);

      const label = item.label?.trim() || `${item.envVarName} (from ${provider.toUpperCase()})`;

      const newKeyItem: VaultKeyItem = {
        id: `key-env-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        label,
        provider: validation.provider,
        maskedKey: masked,
        encryptedData,
        status: validation.isValid ? 'active' : 'invalid',
        validationMessage: `Imported from ${item.envVarName}: ${validation.message}`,
        lastValidatedAt: new Date().toISOString(),
        latencyMs: validation.latencyMs,
        isDefault: Boolean(item.isDefault) || keysToSave.length === 0,
        usageCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (newKeyItem.isDefault) {
        keysToSave.forEach((k) => {
          k.isDefault = false;
        });
      }

      keysToSave.unshift(newKeyItem);
      existingMaskedSet.add(masked);
      importedKeys.push(newKeyItem);

      addSecurityLogEntry({
        action: 'ENV_IMPORTED',
        trigger: 'manual',
        keyId: newKeyItem.id,
        keyLabel: newKeyItem.label,
        provider: newKeyItem.provider,
        maskedKey: newKeyItem.maskedKey,
        status: validation.isValid ? 'success' : 'warning',
        actor: 'Environment Intake Importer',
        details: `Imported environment variable '${item.envVarName}' into AES-256 vault. Status: ${validation.isValid ? 'Valid' : 'Invalid'}.`,
        latencyMs: validation.latencyMs,
        metadata: { envVar: item.envVarName, isValid: validation.isValid },
      });
    } catch (err: any) {
      errors.push(`Failed to import ${item.envVarName}: ${err.message}`);
    }
  }

  if (importedKeys.length > 0) {
    saveAllKeys(keysToSave);
  }

  return {
    importedCount: importedKeys.length,
    importedKeys,
    errors,
  };
}

/**
 * Legacy batch import for raw string contents or automatic scan
 */
export async function importKeysFromEnv(customEnvContent?: string) {
  const candidatesResult = await scanServerEnvCandidates();
  const unimported = candidatesResult.candidates.filter((c) => !c.alreadyInVault);

  const importResult = await importSelectedEnvKeys(
    unimported.map((c) => ({
      envVarName: c.envVarName,
      label: c.suggestedLabel,
    }))
  );

  return {
    totalFound: candidatesResult.totalFound,
    imported: importResult.importedKeys.map((k) => ({
      keyId: k.id,
      envVarName: k.label,
      provider: k.provider,
      maskedKey: k.maskedKey,
      status: k.status,
      validationMessage: k.validationMessage,
    })),
    skipped: candidatesResult.candidates
      .filter((c) => c.alreadyInVault)
      .map((c) => ({
        envVarName: c.envVarName,
        reason: `Key with masked signature (${c.maskedKey}) already exists in vault.`,
      })),
    errors: importResult.errors,
  };
}
