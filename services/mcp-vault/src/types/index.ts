export type ProviderType = 'gemini' | 'openai' | 'anthropic' | 'custom';

export type KeyStatus = 'active' | 'invalid' | 'revoked' | 'untested';

export interface VaultKey {
  id: string;
  label: string;
  provider: ProviderType;
  maskedKey: string;
  customEndpointUrl?: string;
  customHeader?: string;
  status: KeyStatus;
  validationMessage: string;
  lastValidatedAt?: string;
  latencyMs?: number;
  isDefault: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
  sourceEnvVar?: string;
  envVarName?: string;
  source?: string;
}

export interface PromptVersion {
  version: string;
  systemPrompt: string;
  userTemplate: string;
  notes: string;
  createdAt: string;
  author: string;
}

export type PromptCategory =
  | 'headline-byline'
  | 'column-layout'
  | 'wire-normalizer'
  | 'sports-scores'
  | 'caption-parser'
  | 'custom';

export interface SystemPrompt {
  id: string;
  title: string;
  description: string;
  category: PromptCategory;
  currentVersion: string;
  systemPrompt: string;
  userTemplate: string;
  targetFormat: 'json' | 'markdown' | 'text';
  recommendedModel: string;
  mappedKeyId: string | null;
  temperature: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  versions: PromptVersion[];
}

export interface ValidationResponse {
  isValid: boolean;
  provider: ProviderType;
  latencyMs: number;
  message: string;
  details?: {
    modelCount?: number;
    availableModels?: string[];
    rawStatus?: number;
  };
}

export interface NewspaperSample {
  id: string;
  title: string;
  description: string;
  category: string;
  content: string;
}

export interface ExecutionResultData {
  output: string;
  latencyMs: number;
  modelUsed: string;
  provider: string;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number | null;
  timestamp: string;
  structuredData?: any;
}

export interface EnvCandidate {
  envVarName: string;
  provider: ProviderType;
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

export type SecurityActionType =
  | 'VALIDATION_ATTEMPT'
  | 'VALIDATION_SUCCESS'
  | 'VALIDATION_FAILED'
  | 'KEY_ROTATED'
  | 'KEY_REVOKED'
  | 'KEY_REACTIVATED'
  | 'KEY_CREATED'
  | 'KEY_DELETED'
  | 'ENV_IMPORTED'
  | 'DEFAULT_SET'
  // Legacy aliases
  | 'validation'
  | 'rotation'
  | 'revocation'
  | 'reactivation'
  | 'creation'
  | 'deletion'
  | 'import'
  | 'set_default';

export type SecurityTrigger = 'manual' | 'automated';

export type SecurityStatus = 'success' | 'warning' | 'failure' | 'info';

export interface SecurityLogItem {
  id: string;
  timestamp: string;
  action: SecurityActionType;
  trigger?: SecurityTrigger;
  keyId?: string;
  keyLabel?: string;
  provider?: string;
  maskedKey?: string;
  status: SecurityStatus;
  actor: string;
  details: string;
  latencyMs?: number;
  ip?: string;
  origin?: string;
  metadata?: Record<string, any>;
}

export interface SecurityLogStats {
  total: number;
  validations: number;
  rotations: number;
  revocations: number;
  failures: number;
  avgLatency: number | null;
}


