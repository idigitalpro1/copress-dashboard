import { parseCredential } from '../../../../js/vault-clipboard.mjs';
import { parseEnvFile } from '../../../../js/vault-env.mjs';
import { ProviderType } from '../types';

export { parseCredential, parseEnvFile };

export function suggestProvider(envKey: string): ProviderType {
  if (envKey === 'OPENAI_API_KEY') return 'openai';
  if (envKey === 'ANTHROPIC_API_KEY') return 'anthropic';
  if (['GOOGLE_AGENT_API_KEY', 'GEMINI_KEY_COPY', 'GEMINI_KEY_VIDEO', 'GEMINI_KEY_HEALTH'].includes(envKey)) return 'gemini';
  return 'custom';
}

export function maskSecret(value: string) {
  return `••••${value.slice(-4)}`;
}
