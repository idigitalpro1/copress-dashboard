import { GoogleGenAI } from '@google/genai';

/**
 * Validates external URLs to prevent Server-Side Request Forgery (SSRF).
 * Blocks loopback, RFC1918 private IPs, AWS metadata service (169.254.169.254), and non-HTTP(S) protocols.
 */
function isValidExternalHttpsUrl(targetUrl: string): { valid: boolean; reason?: string } {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { valid: false, reason: 'Only HTTP and HTTPS protocols are allowed' };
    }

    const hostname = parsed.hostname.toLowerCase();

    // Block localhost, loopback, and cloud metadata IPs
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '0.0.0.0' ||
      hostname.startsWith('127.') ||
      hostname === '169.254.169.254' ||
      hostname === 'metadata.google.internal' ||
      hostname.endsWith('.internal') ||
      hostname.endsWith('.local')
    ) {
      return { valid: false, reason: 'Requests to loopback or metadata services are forbidden' };
    }

    // Block RFC 1918 private subnets
    if (
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
    ) {
      return { valid: false, reason: 'Requests to internal private IP ranges are forbidden' };
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: 'Malformed target URL' };
  }
}

export interface ValidationResult {
  isValid: boolean;
  provider: 'gemini' | 'openai' | 'anthropic' | 'custom';
  latencyMs: number;
  message: string;
  details?: {
    modelCount?: number;
    availableModels?: string[];
    rawStatus?: number;
  };
}

/**
 * Perform server-side validation ping without leaking key to client or CORS
 */
export async function validateApiKey(
  apiKey: string,
  providerHint?: string,
  customConfig?: { endpointUrl?: string; customHeader?: string }
): Promise<ValidationResult> {
  const startTime = Date.now();
  const trimmed = apiKey.trim();

  // Determine provider if not explicitly given
  let provider = providerHint as 'gemini' | 'openai' | 'anthropic' | 'custom';
  if (!provider) {
    if (trimmed.startsWith('AIzaSy')) {
      provider = 'gemini';
    } else if (trimmed.startsWith('sk-ant-')) {
      provider = 'anthropic';
    } else if (trimmed.startsWith('sk-')) {
      provider = 'openai';
    } else {
      provider = 'custom';
    }
  }

  try {
    if (provider === 'gemini') {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(trimmed)}&pageSize=3`,
        {
          method: 'GET',
          signal: controller.signal,
          headers: {
            'User-Agent': 'aistudio-build-proxy',
          },
        }
      );
      clearTimeout(timeout);
      const latencyMs = Date.now() - startTime;

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const models = (data.models || []).map((m: { name: string }) => m.name.replace('models/', ''));
        return {
          isValid: true,
          provider: 'gemini',
          latencyMs,
          message: `Active (HTTP ${res.status}): Verified against Gemini v1beta/models.`,
          details: {
            modelCount: models.length,
            availableModels: models.slice(0, 5),
            rawStatus: res.status,
          },
        };
      } else {
        const errJson = await res.json().catch(() => ({ error: { message: res.statusText } }));
        const errMsg = errJson?.error?.message || `HTTP Error ${res.status}`;
        return {
          isValid: false,
          provider: 'gemini',
          latencyMs,
          message: `Invalid (HTTP ${res.status}): ${errMsg}`,
          details: { rawStatus: res.status },
        };
      }
    }

    if (provider === 'openai') {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${trimmed}`,
          'User-Agent': 'aistudio-build-proxy',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const latencyMs = Date.now() - startTime;

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const models = (data.data || []).map((m: { id: string }) => m.id);
        return {
          isValid: true,
          provider: 'openai',
          latencyMs,
          message: `Active (HTTP 200): Verified against OpenAI v1/models.`,
          details: {
            modelCount: models.length,
            availableModels: models.slice(0, 5),
            rawStatus: res.status,
          },
        };
      } else {
        const errJson = await res.json().catch(() => ({ error: { message: res.statusText } }));
        return {
          isValid: false,
          provider: 'openai',
          latencyMs,
          message: `Invalid (HTTP ${res.status}): ${errJson?.error?.message || res.statusText}`,
          details: { rawStatus: res.status },
        };
      }
    }

    if (provider === 'anthropic') {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch('https://api.anthropic.com/v1/models', {
        method: 'GET',
        headers: {
          'x-api-key': trimmed,
          'anthropic-version': '2023-06-01',
          'User-Agent': 'aistudio-build-proxy',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const latencyMs = Date.now() - startTime;

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const models = (data.data || []).map((m: { id: string }) => m.id);
        return {
          isValid: true,
          provider: 'anthropic',
          latencyMs,
          message: `Active (HTTP 200): Verified against Anthropic v1/models.`,
          details: {
            modelCount: models.length,
            availableModels: models.slice(0, 5),
            rawStatus: res.status,
          },
        };
      } else {
        const errJson = await res.json().catch(() => ({ error: { message: res.statusText } }));
        return {
          isValid: false,
          provider: 'anthropic',
          latencyMs,
          message: `Invalid (HTTP ${res.status}): ${errJson?.error?.message || res.statusText}`,
          details: { rawStatus: res.status },
        };
      }
    }

    if (provider === 'custom') {
      const endpoint = customConfig?.endpointUrl || 'https://api.openai.com/v1/models';
      const ssrfCheck = isValidExternalHttpsUrl(endpoint);
      if (!ssrfCheck.valid) {
        return {
          isValid: false,
          provider: 'custom',
          latencyMs: Date.now() - startTime,
          message: `Blocked invalid or dangerous endpoint: ${ssrfCheck.reason}`,
        };
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const headers: Record<string, string> = {
        'User-Agent': 'aistudio-build-proxy',
      };
      if (customConfig?.customHeader) {
        const [hKey, ...hVal] = customConfig.customHeader.split(':');
        if (hKey && hVal) {
          headers[hKey.trim()] = hVal.join(':').replace('{KEY}', trimmed).trim();
        }
      } else {
        headers['Authorization'] = `Bearer ${trimmed}`;
      }

      const res = await fetch(endpoint, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const latencyMs = Date.now() - startTime;

      return {
        isValid: res.ok,
        provider: 'custom',
        latencyMs,
        message: res.ok
          ? `Active (HTTP ${res.status}): Verified custom endpoint (${endpoint})`
          : `Invalid (HTTP ${res.status}): Custom endpoint returned error`,
        details: { rawStatus: res.status },
      };
    }

    return {
      isValid: false,
      provider: provider || 'custom',
      latencyMs: Date.now() - startTime,
      message: 'Unrecognized provider endpoint',
    };
  } catch (error: any) {
    return {
      isValid: false,
      provider: provider || 'custom',
      latencyMs: Date.now() - startTime,
      message: `Network/Proxy ping failed: ${error.message || 'Connection refused or timeout'}`,
    };
  }
}

export interface PromptExecutionParams {
  systemPrompt: string;
  userPrompt: string;
  inputText: string;
  provider: 'gemini' | 'openai' | 'anthropic' | 'custom';
  apiKey: string;
  model?: string;
  temperature?: number;
  outputFormat?: 'json' | 'markdown' | 'text';
}

export interface ExecutionResult {
  output: string;
  latencyMs: number;
  modelUsed: string;
  provider: string;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number;
  timestamp: string;
  structuredData?: any;
}

/**
 * Execute prompt against LLM provider securely using server proxy
 */
export async function executeLlmPrompt(params: PromptExecutionParams): Promise<ExecutionResult> {
  const startTime = Date.now();
  const model = params.model || (params.provider === 'gemini' ? 'gemini-3.8-flash' : 'default');
  const temp = typeof params.temperature === 'number' ? params.temperature : 0.2;

  const combinedPrompt = `${params.userPrompt ? params.userPrompt + '\n\n' : ''}--- RAW INPUT TEXT ---\n${params.inputText}`;

  // 1. Google Gemini execution
  if (params.provider === 'gemini') {
    const ai = new GoogleGenAI({
      apiKey: params.apiKey || process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const targetModel = model.includes('gemini') ? model : 'gemini-3.8-flash';

    const config: any = {
      systemInstruction: params.systemPrompt,
      temperature: temp,
    };

    if (params.outputFormat === 'json') {
      config.responseMimeType = 'application/json';
    }

    const response = await ai.models.generateContent({
      model: targetModel,
      contents: combinedPrompt,
      config,
    });

    const textOutput = response.text || '';
    const latencyMs = Date.now() - startTime;

    // Estimate tokens
    const promptTokens = Math.ceil((params.systemPrompt.length + combinedPrompt.length) / 4);
    const completionTokens = Math.ceil(textOutput.length / 4);
    // Gemini 3.8 Flash rate: $0.075 / 1M input, $0.30 / 1M output
    const estimatedCostUsd = (promptTokens * 0.075 + completionTokens * 0.3) / 1000000;

    let structuredData = null;
    if (params.outputFormat === 'json') {
      try {
        structuredData = JSON.parse(textOutput);
      } catch {
        // Fallback if formatting was markdown wrapped
        const cleaned = textOutput.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
        try {
          structuredData = JSON.parse(cleaned);
        } catch {
          // not valid JSON
        }
      }
    }

    return {
      output: textOutput,
      latencyMs,
      modelUsed: targetModel,
      provider: 'gemini',
      promptTokens,
      completionTokens,
      estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),
      timestamp: new Date().toISOString(),
      structuredData,
    };
  }

  // 2. OpenAI execution
  if (params.provider === 'openai') {
    const targetModel = model.startsWith('gpt') ? model : 'gpt-4o-mini';
    const messages = [
      { role: 'system', content: params.systemPrompt },
      { role: 'user', content: combinedPrompt },
    ];

    const body: any = {
      model: targetModel,
      messages,
      temperature: temp,
    };
    if (params.outputFormat === 'json') {
      body.response_format = { type: 'json_object' };
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.apiKey}`,
        'User-Agent': 'aistudio-build-proxy',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
      throw new Error(`OpenAI Error (${res.status}): ${err?.error?.message || res.statusText}`);
    }

    const data = await res.json();
    const textOutput = data.choices?.[0]?.message?.content || '';
    const latencyMs = Date.now() - startTime;
    const promptTokens = data.usage?.prompt_tokens || Math.ceil(combinedPrompt.length / 4);
    const completionTokens = data.usage?.completion_tokens || Math.ceil(textOutput.length / 4);
    const estimatedCostUsd = (promptTokens * 0.15 + completionTokens * 0.6) / 1000000;

    let structuredData = null;
    if (params.outputFormat === 'json') {
      try {
        structuredData = JSON.parse(textOutput);
      } catch {
        // ignore
      }
    }

    return {
      output: textOutput,
      latencyMs,
      modelUsed: targetModel,
      provider: 'openai',
      promptTokens,
      completionTokens,
      estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),
      timestamp: new Date().toISOString(),
      structuredData,
    };
  }

  // 3. Anthropic execution
  if (params.provider === 'anthropic') {
    const targetModel = model.startsWith('claude') ? model : 'claude-3-5-sonnet-20241022';
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': params.apiKey,
        'anthropic-version': '2023-06-01',
        'User-Agent': 'aistudio-build-proxy',
      },
      body: JSON.stringify({
        model: targetModel,
        max_tokens: 4096,
        system: params.systemPrompt,
        messages: [{ role: 'user', content: combinedPrompt }],
        temperature: temp,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
      throw new Error(`Anthropic Error (${res.status}): ${err?.error?.message || res.statusText}`);
    }

    const data = await res.json();
    const textOutput = data.content?.[0]?.text || '';
    const latencyMs = Date.now() - startTime;
    const promptTokens = data.usage?.input_tokens || Math.ceil(combinedPrompt.length / 4);
    const completionTokens = data.usage?.output_tokens || Math.ceil(textOutput.length / 4);
    const estimatedCostUsd = (promptTokens * 3.0 + completionTokens * 15.0) / 1000000;

    return {
      output: textOutput,
      latencyMs,
      modelUsed: targetModel,
      provider: 'anthropic',
      promptTokens,
      completionTokens,
      estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),
      timestamp: new Date().toISOString(),
    };
  }

  // Fallback: If custom or simulation
  throw new Error(`Unsupported execution provider: ${params.provider}`);
}
