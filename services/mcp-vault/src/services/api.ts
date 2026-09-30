import {
  VaultKey,
  SystemPrompt,
  ValidationResponse,
  NewspaperSample,
  ExecutionResultData,
  SecurityLogItem,
  SecurityLogStats,
} from '../types';

// Authentication stays in memory. Idle expiry, refresh, and disconnect clear it.
export const AUTH_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 90 * 1000;
type AuthenticationFailureReason = 'rejected' | 'expired';
let accessToken = '';
let authGeneration = 0;
let idleExpiresAt = 0;
let terminationReason: AuthenticationFailureReason | 'disconnected' = 'disconnected';
let idleTimer: ReturnType<typeof setTimeout> | undefined;
const requests = new Set<AbortController>();
const authListeners = new Set<(reason: AuthenticationFailureReason) => void>();

export function clearAccessToken() {
  terminationReason = 'disconnected';
  accessToken = '';
  idleExpiresAt = 0;
  authGeneration++;
  clearTimeout(idleTimer);
  idleTimer = undefined;
  requests.forEach(controller => controller.abort());
  requests.clear();
}

function endAuthentication(reason: AuthenticationFailureReason) {
  clearAccessToken();
  terminationReason = reason;
  authListeners.forEach(listener => listener(reason));
  terminationReason = reason;
}

function checkAuthentication() {
  if (accessToken && Date.now() >= idleExpiresAt) endAuthentication('expired');
  return Boolean(accessToken);
}

function scheduleIdleExpiry() {
  clearTimeout(idleTimer);
  const wait = Math.max(1, idleExpiresAt - Date.now());
  idleTimer = setTimeout(() => {
    if (!checkAuthentication() || !accessToken) return;
    scheduleIdleExpiry();
  }, wait);
  // Node-based tests must not be held open by a browser session timer.
  (idleTimer as unknown as { unref?: () => void }).unref?.();
}

export function setAccessToken(token: string) {
  const normalized = token.trim();
  if (normalized.length < 32 || normalized.length > 4096 || /[^\x21-\x7e]/.test(normalized)) {
    throw new Error('Enter a valid beta access token of at least 32 characters.');
  }
  clearAccessToken();
  accessToken = normalized;
  idleExpiresAt = Date.now() + AUTH_IDLE_TIMEOUT_MS;
  scheduleIdleExpiry();
}

// Called only by user input events. Background API requests do not extend a session.
export function touchAccessToken() {
  if (!checkAuthentication()) return;
  idleExpiresAt = Date.now() + AUTH_IDLE_TIMEOUT_MS;
  scheduleIdleExpiry();
}

export function onAuthenticationFailure(listener: (reason: AuthenticationFailureReason) => void) {
  authListeners.add(listener);
  return () => { authListeners.delete(listener); };
}

function changedConnection(generation: number) {
  checkAuthentication();
  if (generation !== authGeneration) throw new Error(terminationReason === 'expired'
    ? 'The beta session expired after 15 minutes without interaction. Connect again.'
    : 'The beta connection changed. Connect again.');
}

async function authenticatedFetch(path: string, init: RequestInit = {}) {
  if (!checkAuthentication()) throw new Error('Connect to the beta vault first.');
  const generation = authGeneration;
  const controller = new AbortController();
  requests.add(controller);
  let timedOut = false;
  const deadline = setTimeout(() => { timedOut = true; controller.abort(); }, REQUEST_TIMEOUT_MS);
  (deadline as unknown as { unref?: () => void }).unref?.();
  controller.signal.addEventListener('abort', () => clearTimeout(deadline), { once: true });
  const release = () => { requests.delete(controller); clearTimeout(deadline); };
  const timeoutError = () => new Error('The request timed out. Refresh the vault to check whether changes were saved before retrying.');
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  let response: Response;
  try {
    response = await fetch(path, {
      ...init, headers, signal: controller.signal, mode: 'same-origin', redirect: 'error',
      credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
    });
    changedConnection(generation);
  } catch {
    release();
    changedConnection(generation);
    if (timedOut) throw timeoutError();
    throw new Error('Unable to reach the beta server. Check that it is running and try again.');
  }
  if (response.status === 401) {
    endAuthentication('rejected');
    throw new Error('The access token was rejected. Connect again with the configured beta token.');
  }
  // Provider errors are not reflected into the page: they can contain request secrets.
  if (!response.ok) {
    release();
    await response.body?.cancel().catch(() => {});
    if (response.status === 403) throw new Error('This action is disabled or forbidden. Check the beta server configuration.');
    if (response.status === 409) throw new Error('This action conflicts with the current vault state. Refresh and try again.');
    if (response.status === 413) throw new Error('The request is too large. Use a smaller input.');
    if (response.status === 503) throw new Error('The beta vault is unavailable. Check its private storage and encryption configuration.');
    throw new Error('The request could not be completed. Review your input and try again.');
  }
  return {
    async json() {
      try {
        const data = await response.json();
        changedConnection(generation);
        return data as any;
      } catch {
        changedConnection(generation);
        if (timedOut) throw timeoutError();
        throw new Error('The beta server returned an unreadable response. Try again.');
      } finally { release(); }
    },
    async discard() {
      try { await response.body?.cancel(); changedConnection(generation); }
      catch { changedConnection(generation); }
      finally { release(); }
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
  async deleteKey(id: string) { const response = await authenticatedFetch(keyPath('keys', id), { method: 'DELETE' }); await response.discard(); },
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
  async deletePrompt(id: string) { const response = await authenticatedFetch(promptPath(id), { method: 'DELETE' }); await response.discard(); },
  getSamples: () => request<{ samples: NewspaperSample[] }>('/api/newsflow/samples'),
  executePrompt: (params: {
    promptId?: string; systemPrompt?: string; userTemplate?: string; inputText: string; keyId?: string;
    modelOverride?: string; temperature?: number; outputFormat?: 'json' | 'markdown' | 'text';
  }) => request<{ success: boolean; result: ExecutionResultData; keyUsed: { id: string; label: string; provider: string; maskedKey: string } }>('/api/prompts/execute', 'POST', params),
};
