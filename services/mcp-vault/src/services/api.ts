import {
  VaultKey,
  SystemPrompt,
  ValidationResponse,
  NewspaperSample,
  ExecutionResultData,
  SecurityLogItem,
  SecurityLogStats,
} from '../types';

// Authentication lives only in this module. Refreshing or disconnecting clears it.
let accessToken = '';
let authGeneration = 0;
const authListeners = new Set<() => void>();

export function setAccessToken(token: string) {
  const normalized = token.trim();
  if (!normalized || normalized.length > 4096 || /[\r\n]/.test(normalized)) {
    throw new Error('Enter a valid beta access token.');
  }
  accessToken = normalized;
  authGeneration++;
}

export function clearAccessToken() {
  accessToken = '';
  authGeneration++;
}

export function onAuthenticationFailure(listener: () => void) {
  authListeners.add(listener);
  return () => { authListeners.delete(listener); };
}

async function authenticatedFetch(path: string, init: RequestInit = {}) {
  if (!accessToken) throw new Error('Connect to the beta vault first.');
  const generation = authGeneration;
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  let response: Response;
  try {
    response = await fetch(path, {
      ...init, headers, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
    });
  } catch {
    throw new Error('Unable to reach the beta server. Check that it is running and try again.');
  }
  if (generation !== authGeneration) throw new Error('The beta connection changed. Connect again.');
  if (response.status === 401) {
    clearAccessToken();
    authListeners.forEach(listener => listener());
    throw new Error('The access token was rejected. Connect again with the configured beta token.');
  }
  // Provider errors are not reflected into the page: they can contain request secrets.
  if (!response.ok) {
    if (response.status === 403) throw new Error('This action is disabled or forbidden. Check the beta server configuration.');
    if (response.status === 409) throw new Error('This action conflicts with the current vault state. Refresh and try again.');
    if (response.status === 413) throw new Error('The request is too large. Use a smaller input.');
    if (response.status === 503) throw new Error('The beta vault is unavailable. Check its private storage and encryption configuration.');
    throw new Error('The request could not be completed. Review your input and try again.');
  }
  return {
    ok: true,
    async json() {
      let data: unknown;
      try { data = await response.json(); }
      catch { throw new Error('The beta server returned an unreadable response. Try again.'); }
      if (generation !== authGeneration) throw new Error('The beta connection changed. Connect again.');
      return data as any;
    },
  };
}

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await authenticatedFetch(path, {
    method,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  return response.json();
}

type LogFilters = { action?: string; status?: string; trigger?: string; search?: string; limit?: number };
type LogResult = { success: boolean; logs: SecurityLogItem[]; stats: SecurityLogStats };
type SavedKey = { key: VaultKey; validation?: ValidationResponse; message?: string };
const keyPath = (action: string, id: string) => `/api/vault/${action}/${encodeURIComponent(id)}`;
const promptPath = (id: string, action = '') => `/api/prompts/${encodeURIComponent(id)}${action ? `/${action}` : ''}`;

export const api = {
  getKeys: () => request<{ keys: VaultKey[] }>('/api/vault/keys'),
  validateAndSaveKey: (data: { rawKey: string; providerHint?: string; label?: string; sourceEnvVar?: string }) =>
    request<SavedKey>('/api/vault/validate-and-save', 'POST', data),
  pingKey: (id: string) => request<{ key: VaultKey; validation: ValidationResponse }>(keyPath('ping', id), 'POST'),
  rotateKey: (id: string, newRawKey: string) => request<SavedKey>(keyPath('rotate', id), 'POST', { newRawKey }),
  toggleRevokeKey: (id: string) => request<{ key: VaultKey }>(keyPath('revoke', id), 'POST'),
  async deleteKey(id: string) { await authenticatedFetch(keyPath('keys', id), { method: 'DELETE' }); },
  setDefaultKey: (id: string) => request<{ keys: VaultKey[] }>(keyPath('set-default', id), 'POST'),
  importKeysFromEnv: (entries: { envVarName: string; value: string; provider: string }[]) =>
    request<{
      success: boolean;
      importResult: {
        totalFound: number;
        imported: { keyId: string; envVarName: string; provider: string; maskedKey: string; status: string; validationMessage: string }[];
        skipped: { envVarName: string; reason: string }[];
        errors: string[];
      };
      keys: VaultKey[];
    }>('/api/vault/import-env', 'POST', { entries, confirm: true }),
  getEnvStatus: () => request<{ hasEnvGeminiKey: boolean; hasMasterKey: boolean; encryptionAlgorithm: string; executionEnabled: boolean }>('/api/vault/environment-status'),
  getSecurityLogs(params?: LogFilters): Promise<LogResult> {
    const query = new URLSearchParams();
    if (params?.action && params.action !== 'all') query.set('action', params.action);
    if (params?.status && params.status !== 'all') query.set('status', params.status);
    if (params?.trigger && params.trigger !== 'all') query.set('trigger', params.trigger);
    if (params?.search) query.set('search', params.search);
    if (params?.limit) query.set('limit', String(params.limit));
    const suffix = query.toString();
    return request<LogResult>(`/api/vault/audit-logs${suffix ? `?${suffix}` : ''}`);
  },
  getAuditLogs(params?: LogFilters): Promise<LogResult> { return this.getSecurityLogs(params); },
  clearSecurityLogs: () => request<{ success: boolean; logs: SecurityLogItem[] }>('/api/vault/security-logs/clear', 'POST'),
  getPrompts: () => request<{ prompts: SystemPrompt[] }>('/api/prompts'),
  createPrompt: (data: Partial<SystemPrompt> & { author?: string; initialNotes?: string }) => request<{ prompt: SystemPrompt }>('/api/prompts', 'POST', data),
  updatePrompt: (id: string, data: Partial<SystemPrompt> & { versionNotes?: string; author?: string; bumpVersion?: boolean }) => request<{ prompt: SystemPrompt }>(promptPath(id), 'PUT', data),
  restorePromptVersion: (id: string, targetVersion: string, notes?: string) => request<{ prompt: SystemPrompt }>(promptPath(id, 'restore-version'), 'POST', { targetVersion, notes }),
  mapPromptKey: (id: string, mappedKeyId: string | null, recommendedModel?: string) => request<{ prompt: SystemPrompt }>(promptPath(id, 'map-key'), 'POST', { mappedKeyId, recommendedModel }),
  async deletePrompt(id: string) { await authenticatedFetch(promptPath(id), { method: 'DELETE' }); },
  getSamples: () => request<{ samples: NewspaperSample[] }>('/api/newsflow/samples'),
  executePrompt: (params: {
    promptId?: string; systemPrompt?: string; userTemplate?: string; inputText: string; keyId?: string;
    modelOverride?: string; temperature?: number; outputFormat?: 'json' | 'markdown' | 'text';
  }) => request<{ success: boolean; result: ExecutionResultData; keyUsed: { id: string; label: string; provider: string; maskedKey: string } }>('/api/prompts/execute', 'POST', params),
};
