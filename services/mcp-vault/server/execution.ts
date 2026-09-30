import { NewsflowError, requireNewsflowConfig } from './crypto.js';
import { findPromptById, findKeyById, getDecryptedKeyById, getAllKeys, saveAllKeys, recordSecurityEvent } from './storage.js';
import { executeLlmPrompt } from './providers.js';

export async function executePromptRequest(body: any) {
  requireNewsflowConfig();
  if (process.env.NEWSFLOW_ALLOW_EXECUTION !== '1') throw new NewsflowError('Provider execution is disabled for this beta.', 403);
  if (!body || typeof body !== 'object' || typeof body.inputText !== 'string' || !body.inputText.trim() || body.inputText.length > 100000) {
    throw new NewsflowError('Input text is required and must not exceed 100000 characters.');
  }
  const prompt = typeof body.promptId === 'string' ? findPromptById(body.promptId) : undefined;
  if (body.promptId && !prompt) throw new NewsflowError('The requested prompt was not found.', 404);
  const keyId = body.keyId ?? prompt?.mappedKeyId;
  if (typeof keyId !== 'string' || !keyId) throw new NewsflowError('Choose an explicit validated key or a prompt mapped to one.');
  const key = findKeyById(keyId);
  if (!key || key.status !== 'active') throw new NewsflowError('The explicitly selected key is missing, revoked, or has not passed validation.', 409);
  if (key.provider === 'custom') throw new NewsflowError('Custom provider execution is disabled.');
  const systemPrompt = body.systemPrompt ?? prompt?.systemPrompt ?? 'You are an automated newspaper processing agent.';
  const userPrompt = body.userTemplate ?? prompt?.userTemplate ?? '';
  if (typeof systemPrompt !== 'string' || systemPrompt.length > 30000 || typeof userPrompt !== 'string' || userPrompt.length > 30000) throw new NewsflowError('Prompt text exceeds the supported limits.');
  const outputFormat = body.outputFormat ?? prompt?.targetFormat ?? 'json';
  if (!['json', 'markdown', 'text'].includes(outputFormat)) throw new NewsflowError('The requested output format is unsupported.');
  const temperature = body.temperature ?? prompt?.temperature ?? 0.2;
  if (typeof temperature !== 'number' || !Number.isFinite(temperature) || temperature < 0 || temperature > 2) throw new NewsflowError('Temperature must be between 0 and 2.');
  const model = body.modelOverride ?? prompt?.recommendedModel;
  if (model !== undefined && (typeof model !== 'string' || model.length > 100)) throw new NewsflowError('The model name is invalid.');
  const secret = getDecryptedKeyById(key.id);
  if (!secret) throw new NewsflowError('The mapped key could not be loaded.', 409);
  let result;
  try {
    result = await executeLlmPrompt({ systemPrompt, userPrompt, inputText: body.inputText, provider: key.provider,
      apiKey: secret, model, temperature, outputFormat });
  } catch (error) { recordSecurityEvent('PROMPT_EXECUTION_FAILED', 'failure', key.id); throw error; }
  // Refresh after the request; never overwrite a concurrent key rotation.
  let usageRecorded = false;
  try {
    const latest = getAllKeys();
    const current = latest.find(item => item.id === key.id);
    if (current && current.encryptedData === key.encryptedData) { current.usageCount = (current.usageCount || 0) + 1; saveAllKeys(latest); usageRecorded = true; }
  } catch { /* Preserve a completed draft even when the separate usage counter cannot be saved. */ }
  const auditRecorded = recordSecurityEvent('PROMPT_EXECUTED', 'success', key.id);
  return { success: true, result, auditRecorded, usageRecorded, keyUsed: { id: key.id, label: key.label, provider: key.provider, maskedKey: '••••••••••••' } };
}
