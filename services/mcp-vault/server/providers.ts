import { NewsflowError } from './crypto.js';

export type Provider = 'gemini' | 'openai' | 'anthropic' | 'custom';
export interface ValidationResult {
  isValid: boolean; provider: Provider; latencyMs: number; message: string;
  details?: { rawStatus?: number; modelCount?: number; availableModels?: string[] };
}
const endpoints = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta/models',
  openai: 'https://api.openai.com/v1/models',
  anthropic: 'https://api.anthropic.com/v1/models',
};

// One configured operator, shared by HTTP and MCP. No user-controlled identity or unbounded map.
const providerCalls: number[] = [];
let activeProviderCalls = 0;
function acquireProviderCall() {
  const now = Date.now();
  while (providerCalls.length && providerCalls[0] <= now - 60000) providerCalls.shift();
  if (providerCalls.length >= 60 || activeProviderCalls >= 3) throw new NewsflowError('Provider request limit reached. Try again shortly.', 429);
  providerCalls.push(now); activeProviderCalls++;
  return () => { activeProviderCalls--; };
}

function headers(provider: Provider, key: string): Record<string, string> {
  if (provider === 'gemini') return { 'x-goog-api-key': key };
  if (provider === 'openai') return { Authorization: `Bearer ${key}` };
  if (provider === 'anthropic') return { 'x-api-key': key, 'anthropic-version': '2023-06-01' };
  throw new NewsflowError('Custom providers cannot be contacted by this beta.');
}

export async function validateApiKey(apiKey: string, providerHint?: string, customConfig?: { endpointUrl?: string; customHeader?: string }): Promise<ValidationResult> {
  if (!providerHint || !Object.hasOwn(endpoints, providerHint) || customConfig?.endpointUrl || customConfig?.customHeader) {
    throw new NewsflowError('Choose a supported built-in provider for an explicit validation. Custom endpoints are disabled.');
  }
  const provider = providerHint as keyof typeof endpoints;
  const start = Date.now();
  const release = acquireProviderCall();
  try {
    const response = await fetch(endpoints[provider], {
      method: 'GET', headers: headers(provider, apiKey), redirect: 'error', signal: AbortSignal.timeout(8000),
    });
    await response.body?.cancel();
    return { provider, isValid: response.ok, latencyMs: Date.now() - start,
      message: response.ok ? 'The provider accepted the credential.' : 'The provider did not accept the validation request.',
      details: { rawStatus: response.status } };
  } catch { return { provider, isValid: false, latencyMs: Date.now() - start, message: 'Provider validation could not be completed.' }; }
  finally { release(); }
}

export interface PromptExecutionParams {
  systemPrompt: string; userPrompt: string; inputText: string; apiKey: string; provider: Provider;
  model?: string; temperature?: number; outputFormat?: 'json' | 'markdown' | 'text';
}
export interface ExecutionResult {
  output: string; latencyMs: number; modelUsed: string; provider: string; promptTokens: number;
  completionTokens: number; estimatedCostUsd: number | null; timestamp: string; structuredData?: unknown;
}

export function resolveExecutionModel(provider: Provider, requestedModel?: string) {
  const model = requestedModel || ({ gemini: 'gemini-3.5-flash', openai: 'gpt-4o-mini', anthropic: 'claude-sonnet-4-6', custom: '' }[provider]);
  const permitted = { gemini: /^gemini-[a-z0-9.-]{1,80}$/, openai: /^(?:gpt|o)[a-z0-9.-]{1,80}$/, anthropic: /^claude-[a-z0-9.-]{1,80}$/ };
  if (provider === 'custom' || !permitted[provider]?.test(model)) throw new NewsflowError('Select a supported model for the explicitly mapped provider.');
  return model;
}

export async function executeLlmPrompt(params: PromptExecutionParams): Promise<ExecutionResult> {
  const provider = params.provider;
  const model = resolveExecutionModel(provider, params.model);
  const content = `${params.userPrompt}\n\n--- RAW INPUT TEXT ---\n${params.inputText}`;
  let endpoint: string;
  let body: unknown;
  if (provider === 'gemini') {
    endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    body = { systemInstruction: { parts: [{ text: params.systemPrompt }] }, contents: [{ role: 'user', parts: [{ text: content }] }],
      generationConfig: { temperature: params.temperature ?? 0.2, maxOutputTokens: 4096, ...(params.outputFormat === 'json' ? { responseMimeType: 'application/json' } : {}) } };
  } else if (provider === 'openai') {
    endpoint = 'https://api.openai.com/v1/chat/completions';
    body = { model, messages: [{ role: 'system', content: params.systemPrompt }, { role: 'user', content }], temperature: params.temperature ?? 0.2, max_completion_tokens: 4096,
      ...(params.outputFormat === 'json' ? { response_format: { type: 'json_object' } } : {}) };
  } else {
    endpoint = 'https://api.anthropic.com/v1/messages';
    body = { model, max_tokens: 4096, temperature: params.temperature ?? 0.2, system: params.systemPrompt, messages: [{ role: 'user', content }] };
  }
  const start = Date.now();
  const release = acquireProviderCall();
  try {
    const response = await fetch(endpoint, { method: 'POST', headers: { ...headers(provider, params.apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(60000) });
    if (!response.ok) { await response.body?.cancel(); throw new Error(); }
    const reader = response.body?.getReader();
    if (!reader) throw new Error();
    const chunks: Uint8Array[] = []; let length = 0;
    while (true) {
      const next = await reader.read(); if (next.done) break;
      length += next.value.length;
      if (length > 1024 * 1024) { await reader.cancel(); throw new Error(); }
      chunks.push(next.value);
    }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const output = provider === 'gemini' ? data.candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join('')
      : provider === 'openai' ? data.choices?.[0]?.message?.content : data.content?.filter((part: any) => part.type === 'text').map((part: any) => part.text).join('');
    if (typeof output !== 'string' || output.includes(params.apiKey)) throw new Error();
    const result: ExecutionResult = { output, latencyMs: Date.now() - start, modelUsed: model, provider,
      promptTokens: Number(data.usageMetadata?.promptTokenCount ?? data.usage?.prompt_tokens ?? data.usage?.input_tokens ?? 0),
      completionTokens: Number(data.usageMetadata?.candidatesTokenCount ?? data.usage?.completion_tokens ?? data.usage?.output_tokens ?? 0),
      estimatedCostUsd: null, timestamp: new Date().toISOString() };
    if (params.outputFormat === 'json') { try { result.structuredData = JSON.parse(output); } catch { /* Output stays explicitly unparsed. */ } }
    return result;
  } catch { throw new NewsflowError('Provider execution could not be completed. No provider error body is exposed.', 502); }
  finally { release(); }
}
