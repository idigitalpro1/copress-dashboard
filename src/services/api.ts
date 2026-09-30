import {
  VaultKey,
  SystemPrompt,
  ValidationResponse,
  NewspaperSample,
  ExecutionResultData,
  EnvCandidate,
  SecurityLogItem,
  SecurityLogStats,
} from '../types';

export const api = {
  // Vault Keys
  async getKeys(): Promise<{ keys: VaultKey[] }> {
    const res = await fetch('/api/vault/keys');
    if (!res.ok) throw new Error('Failed to fetch keys');
    return res.json();
  },

  async testKey(data: {
    rawKey: string;
    providerHint?: string;
    customEndpointUrl?: string;
    customHeader?: string;
  }): Promise<{ validation: ValidationResponse; maskedKey: string }> {
    const res = await fetch('/api/vault/test-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Key validation failed');
    }
    return res.json();
  },

  async validateAndSaveKey(data: {
    rawKey: string;
    providerHint?: string;
    label?: string;
    customEndpointUrl?: string;
    customHeader?: string;
    allowInvalidSave?: boolean;
  }): Promise<{ key: VaultKey; validation: ValidationResponse; message: string }> {
    const res = await fetch('/api/vault/validate-and-save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (!res.ok) {
      const msg = result.validation?.message || result.error || 'Failed to validate and save key';
      throw new Error(msg);
    }
    return result;
  },

  async pingKey(id: string): Promise<{ key: VaultKey; validation: ValidationResponse }> {
    const res = await fetch(`/api/vault/ping/${id}`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to ping key');
    }
    return res.json();
  },

  async rotateKey(
    id: string,
    newRawKey: string,
    allowInvalidSave = false
  ): Promise<{ key: VaultKey; validation: ValidationResponse }> {
    const res = await fetch(`/api/vault/rotate/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newRawKey, allowInvalidSave }),
    });
    const result = await res.json();
    if (!res.ok) {
      throw new Error(result.error || 'Failed to rotate key');
    }
    return result;
  },

  async toggleRevokeKey(id: string): Promise<{ key: VaultKey }> {
    const res = await fetch(`/api/vault/revoke/${id}`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to toggle key status');
    return res.json();
  },

  async deleteKey(id: string): Promise<void> {
    const res = await fetch(`/api/vault/keys/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete key');
  },

  async setDefaultKey(id: string): Promise<{ keys: VaultKey[] }> {
    const res = await fetch(`/api/vault/set-default/${id}`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to set default key');
    return res.json();
  },

  async fetchAndValidateEnvCandidates(): Promise<{
    success: boolean;
    candidates: EnvCandidate[];
    newCandidatesCount: number;
    totalFound: number;
  }> {
    const res = await fetch('/api/vault/env-candidates');
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to fetch environment candidates');
    }
    return res.json();
  },

  async importSelectedEnvKeys(selectedKeys: { envVarName: string; label?: string; isDefault?: boolean }[]): Promise<{
    success: boolean;
    importResult: {
      importedCount: number;
      importedKeys: VaultKey[];
      errors: string[];
    };
    keys: VaultKey[];
  }> {
    const res = await fetch('/api/vault/import-selected-env', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedKeys }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to import selected environment keys');
    }
    return res.json();
  },

  async importKeysFromEnv(envContent?: string): Promise<{
    success: boolean;
    importResult: {
      totalFound: number;
      imported: {
        keyId: string;
        envVarName: string;
        provider: string;
        maskedKey: string;
        status: string;
        validationMessage: string;
      }[];
      skipped: {
        envVarName: string;
        reason: string;
      }[];
      errors: string[];
    };
    keys: VaultKey[];
  }> {
    const res = await fetch('/api/vault/import-env', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ envContent }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to import keys from .env');
    }
    return res.json();
  },

  async getEnvStatus(): Promise<{
    hasEnvGeminiKey: boolean;
    hasMasterKey: boolean;
    encryptionAlgorithm: string;
    detectedKeys?: EnvCandidate[];
    newCandidatesCount?: number;
    totalFound?: number;
  }> {
    const res = await fetch('/api/vault/environment-status');
    if (!res.ok) throw new Error('Failed to check environment status');
    return res.json();
  },

  // Security Audit Logs
  async getSecurityLogs(params?: {
    action?: string;
    status?: string;
    trigger?: string;
    search?: string;
    limit?: number;
  }): Promise<{
    success: boolean;
    logs: SecurityLogItem[];
    stats: SecurityLogStats;
  }> {
    const query = new URLSearchParams();
    if (params?.action && params.action !== 'all') query.set('action', params.action);
    if (params?.status && params.status !== 'all') query.set('status', params.status);
    if (params?.trigger && params.trigger !== 'all') query.set('trigger', params.trigger);
    if (params?.search) query.set('search', params.search);
    if (params?.limit) query.set('limit', String(params.limit));

    const qs = query.toString();
    const res = await fetch(`/api/vault/audit-logs${qs ? `?${qs}` : ''}`);
    if (!res.ok) throw new Error('Failed to fetch security audit logs');
    return res.json();
  },

  async getAuditLogs(params?: {
    action?: string;
    status?: string;
    trigger?: string;
    search?: string;
    limit?: number;
  }): Promise<{
    success: boolean;
    logs: SecurityLogItem[];
    stats: SecurityLogStats;
  }> {
    return this.getSecurityLogs(params);
  },

  async clearSecurityLogs(): Promise<{ success: boolean; logs: SecurityLogItem[] }> {
    const res = await fetch('/api/vault/security-logs/clear', { method: 'POST' });
    if (!res.ok) throw new Error('Failed to reset security logs');
    return res.json();
  },

  // Prompts
  async getPrompts(): Promise<{ prompts: SystemPrompt[] }> {
    const res = await fetch('/api/prompts');
    if (!res.ok) throw new Error('Failed to fetch prompts');
    return res.json();
  },

  async createPrompt(promptData: Partial<SystemPrompt> & { author?: string; initialNotes?: string }): Promise<{ prompt: SystemPrompt }> {
    const res = await fetch('/api/prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(promptData),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create prompt');
    }
    return res.json();
  },

  async updatePrompt(
    id: string,
    updates: Partial<SystemPrompt> & { versionNotes?: string; author?: string; bumpVersion?: boolean }
  ): Promise<{ prompt: SystemPrompt }> {
    const res = await fetch(`/api/prompts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to update prompt');
    }
    return res.json();
  },

  async restorePromptVersion(
    id: string,
    targetVersion: string,
    notes?: string
  ): Promise<{ prompt: SystemPrompt }> {
    const res = await fetch(`/api/prompts/${id}/restore-version`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetVersion, notes }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to restore prompt version');
    }
    return res.json();
  },

  async mapPromptKey(
    id: string,
    mappedKeyId: string | null,
    recommendedModel?: string
  ): Promise<{ prompt: SystemPrompt }> {
    const res = await fetch(`/api/prompts/${id}/map-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mappedKeyId, recommendedModel }),
    });
    if (!res.ok) throw new Error('Failed to update prompt key mapping');
    return res.json();
  },

  async deletePrompt(id: string): Promise<void> {
    const res = await fetch(`/api/prompts/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete prompt');
  },

  // Sandbox Execution & Samples
  async getSamples(): Promise<{ samples: NewspaperSample[] }> {
    const res = await fetch('/api/samples');
    if (!res.ok) throw new Error('Failed to fetch samples');
    return res.json();
  },

  async executePrompt(params: {
    promptId?: string;
    systemPrompt?: string;
    userTemplate?: string;
    inputText: string;
    keyId?: string;
    modelOverride?: string;
    temperature?: number;
    outputFormat?: 'json' | 'markdown' | 'text';
  }): Promise<{
    success: boolean;
    result: ExecutionResultData;
    keyUsed: { id: string; label: string; provider: string; maskedKey: string };
  }> {
    const res = await fetch('/api/prompts/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Prompt execution failed');
    }
    return data;
  },
};
