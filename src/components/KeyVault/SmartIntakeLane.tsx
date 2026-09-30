import React, { useState, useMemo } from 'react';
import {
  Key,
  Shield,
  CheckCircle,
  AlertCircle,
  Loader2,
  SlidersHorizontal,
  Sparkles,
  ArrowRight,
  Info,
  FolderSync,
} from 'lucide-react';
import { ProviderType, ValidationResponse, VaultKey } from '../../types';
import { api } from '../../services/api';

interface SmartIntakeLaneProps {
  onKeyAdded: (key: VaultKey) => void;
  onOpenManualOverride: () => void;
  onOpenImportEnv?: () => void;
}

interface RegexMatch {
  provider: ProviderType;
  name: string;
  endpoint: string;
  badgeColor: string;
  confidence: 'High' | 'Medium' | 'Low';
  details: string;
}

export const SmartIntakeLane: React.FC<SmartIntakeLaneProps> = ({
  onKeyAdded,
  onOpenManualOverride,
  onOpenImportEnv,
}) => {
  const [rawKeyInput, setRawKeyInput] = useState('');
  const [keyLabel, setKeyLabel] = useState('');
  const [showLabelInput, setShowLabelInput] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Regex analysis in real-time
  const detectedProvider: RegexMatch | null = useMemo(() => {
    const trimmed = rawKeyInput.trim();
    if (!trimmed) return null;

    // Google Gemini: AIzaSy + 33 chars
    if (trimmed.startsWith('AIzaSy')) {
      const isFullLength = trimmed.length === 39;
      return {
        provider: 'gemini',
        name: 'Google Gemini',
        endpoint: 'generativelanguage.googleapis.com/v1beta/models',
        badgeColor: 'from-blue-500 to-indigo-600',
        confidence: isFullLength ? 'High' : 'Medium',
        details: 'Recognized 39-character AIzaSy Google API key format.',
      };
    }

    // Anthropic: sk-ant-api03- or sk-ant-
    if (trimmed.startsWith('sk-ant-')) {
      return {
        provider: 'anthropic',
        name: 'Anthropic Claude',
        endpoint: 'api.anthropic.com/v1/models',
        badgeColor: 'from-amber-600 to-orange-700',
        confidence: trimmed.length > 25 ? 'High' : 'Medium',
        details: 'Standard Anthropic secret key prefix (sk-ant-).',
      };
    }

    // OpenAI: sk-proj- or sk-
    if (trimmed.startsWith('sk-proj-') || trimmed.startsWith('sk-admin-')) {
      return {
        provider: 'openai',
        name: 'OpenAI Project Key',
        endpoint: 'api.openai.com/v1/models',
        badgeColor: 'from-emerald-600 to-teal-700',
        confidence: 'High',
        details: 'Modern OpenAI Project API key format.',
      };
    }

    if (trimmed.startsWith('sk-')) {
      return {
        provider: 'openai',
        name: 'OpenAI Standard Key',
        endpoint: 'api.openai.com/v1/models',
        badgeColor: 'from-emerald-600 to-teal-700',
        confidence: 'Medium',
        details: 'Standard OpenAI legacy/user secret key prefix (sk-).',
      };
    }

    // Unknown or custom endpoint
    if (trimmed.length > 8) {
      return {
        provider: 'custom',
        name: 'Custom / Unclassified Key',
        endpoint: 'Custom Gateway Endpoint',
        badgeColor: 'from-slate-600 to-slate-700',
        confidence: 'Low',
        details: 'Unrecognized key prefix. You can validate via custom gateway or override.',
      };
    }

    return null;
  }, [rawKeyInput]);

  const handleValidateAndSave = async (forceSave = false) => {
    if (!rawKeyInput.trim()) return;

    setIsValidating(true);
    setErrorMessage(null);
    setValidationResult(null);

    try {
      const res = await api.validateAndSaveKey({
        rawKey: rawKeyInput.trim(),
        providerHint: detectedProvider?.provider,
        label: keyLabel.trim() || undefined,
        allowInvalidSave: forceSave,
      });

      setValidationResult(res.validation);
      onKeyAdded(res.key);
      setRawKeyInput('');
      setKeyLabel('');
      setShowLabelInput(false);
    } catch (err: any) {
      setErrorMessage(err.message || 'Validation request failed');
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden p-5 sm:p-6 mb-8 transition-all">
      {/* Top Banner / Lane Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800/80 gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Key className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <span>Smart Intake Lane</span>
              <span className="text-[11px] font-mono font-normal px-2 py-0.5 rounded bg-indigo-950/70 border border-indigo-800/50 text-indigo-300">
                Auto-Regex Inspect
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Single entry input. Auto-detects Google Gemini, Anthropic, or OpenAI keys and validates through server proxy.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-2 self-start sm:self-auto">
          {onOpenImportEnv && (
            <button
              type="button"
              onClick={onOpenImportEnv}
              className="flex items-center space-x-1.5 text-xs text-emerald-300 hover:text-emerald-200 bg-emerald-950/50 hover:bg-emerald-900/60 px-3 py-1.5 rounded-lg border border-emerald-800/70 transition-colors"
            >
              <FolderSync className="w-3.5 h-3.5 text-emerald-400" />
              <span>Import from .env</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenManualOverride}
            className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-indigo-300 bg-slate-800/60 hover:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700/60 transition-colors"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Manual Override / Custom Endpoint</span>
          </button>
        </div>
      </div>

      {/* Input Form */}
      <div className="mt-4 space-y-3">
        <div className="relative">
          <input
            type="password"
            autoComplete="new-password"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck="false"
            value={rawKeyInput}
            onChange={(e) => {
              setRawKeyInput(e.target.value);
              setErrorMessage(null);
            }}
            placeholder="Paste raw API key (e.g. AIzaSy..., sk-ant-..., sk-proj-...)"
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 font-mono tracking-wider transition-all pr-24"
          />

          {/* Quick Clear or Paste helper */}
          {rawKeyInput && (
            <button
              onClick={() => {
                setRawKeyInput('');
                setErrorMessage(null);
              }}
              className="absolute right-3 top-3 text-xs text-slate-500 hover:text-slate-300 px-2 py-0.5 rounded bg-slate-800/80"
            >
              Clear
            </button>
          )}
        </div>

        {/* Optional Label Input */}
        {showLabelInput && (
          <div className="animate-in fade-in duration-200">
            <input
              type="text"
              value={keyLabel}
              onChange={(e) => setKeyLabel(e.target.value)}
              placeholder="Card Label / Descriptor (e.g., 'National Desk Gemini Flash Key')"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
            />
          </div>
        )}

        {/* Real-time Regex Inspection Feedback Bar */}
        {detectedProvider && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-slate-950/80 border border-slate-800 rounded-xl p-3 gap-3 animate-in fade-in duration-150">
            <div className="flex items-center space-x-3">
              <div
                className={`w-7 h-7 rounded-lg bg-gradient-to-r ${detectedProvider.badgeColor} flex items-center justify-center text-white text-xs font-bold shadow-sm`}
              >
                {detectedProvider.provider === 'gemini' && 'G'}
                {detectedProvider.provider === 'anthropic' && 'A'}
                {detectedProvider.provider === 'openai' && 'O'}
                {detectedProvider.provider === 'custom' && 'C'}
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-semibold text-slate-200">
                    Detected: {detectedProvider.name}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-mono uppercase bg-slate-800 text-slate-400 border border-slate-700">
                    {detectedProvider.confidence} Confidence
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                  <span>Proxy target:</span>
                  <span className="text-indigo-400">{detectedProvider.endpoint}</span>
                </div>
              </div>
            </div>

            <div className="text-[11px] text-slate-400 hidden md:block max-w-xs text-right">
              {detectedProvider.details}
            </div>
          </div>
        )}

        {/* Action Controls & Error Banners */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="flex items-center space-x-3 text-xs text-slate-400">
            <button
              type="button"
              onClick={() => setShowLabelInput(!showLabelInput)}
              className="text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-4"
            >
              {showLabelInput ? '- Hide label descriptor' : '+ Add custom card label'}
            </button>
            <span className="text-slate-600">•</span>
            <span className="flex items-center gap-1 text-[11px] text-slate-400">
              <Shield className="w-3 h-3 text-emerald-400" />
              AES-256 encrypted before save
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              disabled={!rawKeyInput.trim() || isValidating}
              onClick={() => handleValidateAndSave(false)}
              className="w-full sm:w-auto flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs sm:text-sm font-medium px-5 py-2.5 rounded-xl shadow-lg shadow-indigo-600/20 transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              {isValidating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Proxy Pinging /models...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Secure Validate & Add Key</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Error notification & fallback option */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 mt-2">
            <div className="flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Validation Rejected by Server Proxy:</span>
                <p className="text-rose-300/90 font-mono text-[11px] mt-0.5">{errorMessage}</p>
              </div>
            </div>
            <button
              onClick={() => handleValidateAndSave(true)}
              className="text-xs bg-rose-900/60 hover:bg-rose-800 text-rose-100 px-3 py-1 rounded-lg border border-rose-700/60 shrink-0 transition-colors self-end sm:self-auto"
            >
              Save as Inactive / Override
            </button>
          </div>
        )}

        {/* Success notification */}
        {validationResult?.isValid && (
          <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-xs text-emerald-200 flex items-center space-x-2 mt-2">
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <span className="font-semibold">Key Verified & Encrypted:</span>
              <span className="ml-1 text-emerald-300 font-mono">{validationResult.message}</span>
              <span className="ml-2 text-emerald-400 font-mono text-[10px]">({validationResult.latencyMs}ms)</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
