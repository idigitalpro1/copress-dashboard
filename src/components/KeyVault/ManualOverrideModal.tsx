import React, { useState } from 'react';
import {
  X,
  Shield,
  Loader2,
  AlertCircle,
  CheckCircle,
  SlidersHorizontal,
  Info,
} from 'lucide-react';
import { ProviderType, VaultKey } from '../../types';
import { api } from '../../services/api';

interface ManualOverrideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeyAdded: (key: VaultKey) => void;
}

export const ManualOverrideModal: React.FC<ManualOverrideModalProps> = ({
  isOpen,
  onClose,
  onKeyAdded,
}) => {
  const [provider, setProvider] = useState<ProviderType>('gemini');
  const [label, setLabel] = useState('');
  const [rawKey, setRawKey] = useState('');
  const [customEndpointUrl, setCustomEndpointUrl] = useState('');
  const [customHeader, setCustomHeader] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (forceSave = false) => {
    if (!rawKey.trim()) {
      setErrorMessage('API Key cannot be blank.');
      return;
    }

    setIsValidating(true);
    setErrorMessage(null);

    try {
      const res = await api.validateAndSaveKey({
        rawKey: rawKey.trim(),
        providerHint: provider,
        label: label.trim() || undefined,
        customEndpointUrl: provider === 'custom' ? customEndpointUrl.trim() : undefined,
        customHeader: provider === 'custom' ? customHeader.trim() : undefined,
        allowInvalidSave: forceSave,
      });

      onKeyAdded(res.key);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Validation request failed');
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100 text-sm sm:text-base">
                Manual Override & Custom Endpoint
              </h3>
              <p className="text-xs text-slate-400">
                Bypass auto-regex if keys collide or use a custom internal gateway.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Provider Selection */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Select Explicit Provider
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: 'gemini', label: 'Google Gemini' },
                { id: 'anthropic', label: 'Anthropic' },
                { id: 'openai', label: 'OpenAI' },
                { id: 'custom', label: 'Custom / vLLM' },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setProvider(p.id as ProviderType)}
                  className={`text-xs px-3 py-2 rounded-xl border text-center transition-all font-medium ${
                    provider === p.id
                      ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Key Label */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Descriptive Label (Optional)
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., Enterprise Custom Gateway Sonnet"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Raw Secret Key */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Secret API Key
            </label>
            <input
              type="password"
              autoComplete="new-password"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck="false"
              value={rawKey}
              onChange={(e) => setRawKey(e.target.value)}
              placeholder="Enter secret key string"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
            />
            <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
              <Shield className="w-3 h-3 text-emerald-400" />
              Will be encrypted with AES-256-GCM before saving to disk.
            </p>
          </div>

          {/* Custom Endpoint & Header options if custom */}
          {provider === 'custom' && (
            <div className="space-y-3 p-3.5 rounded-xl bg-slate-950 border border-slate-800 animate-in fade-in">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Custom Base or Validation Endpoint URL
                </label>
                <input
                  type="url"
                  value={customEndpointUrl}
                  onChange={(e) => setCustomEndpointUrl(e.target.value)}
                  placeholder="https://vllm.newsroom.internal/v1/models"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Custom Auth Header Format (Optional)
                </label>
                <input
                  type="text"
                  value={customHeader}
                  onChange={(e) => setCustomHeader(e.target.value)}
                  placeholder="Authorization: Bearer {KEY} or x-api-key: {KEY}"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 font-mono"
                />
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-200 flex flex-col gap-2">
              <div className="flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Proxy Verification Failed:</span>
                  <p className="text-rose-300 font-mono text-[11px] mt-0.5">{errorMessage}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleSubmit(true)}
                className="text-xs bg-rose-900/60 hover:bg-rose-800 text-rose-100 px-3 py-1 rounded-lg border border-rose-700/60 self-start transition-colors"
              >
                Force Save (Store Inactive / Untested)
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-2 p-4 border-t border-slate-800 bg-slate-950/50">
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-slate-400 hover:text-slate-200 px-4 py-2 rounded-xl hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isValidating || !rawKey.trim()}
            onClick={() => handleSubmit(false)}
            className="flex items-center space-x-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-5 py-2 rounded-xl transition-all shadow-md shadow-indigo-600/20"
          >
            {isValidating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Pinging Server Proxy...</span>
              </>
            ) : (
              <span>Validate & Save Key</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
