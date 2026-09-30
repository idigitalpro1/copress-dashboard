import React, { useState } from 'react';
import { X, RotateCw, Shield, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { VaultKey } from '../../types';
import { api } from '../../services/api';

interface RotateKeyModalProps {
  keyItem: VaultKey | null;
  isOpen: boolean;
  onClose: () => void;
  onKeyRotated: (updatedKey: VaultKey) => void;
}

export const RotateKeyModal: React.FC<RotateKeyModalProps> = ({
  keyItem,
  isOpen,
  onClose,
  onKeyRotated,
}) => {
  const [newRawKey, setNewRawKey] = useState('');
  const [isRotating, setIsRotating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !keyItem) return null;

  const handleRotate = async (allowInvalid = false) => {
    if (!newRawKey.trim()) {
      setErrorMessage('Please provide a new API key value.');
      return;
    }

    setIsRotating(true);
    setErrorMessage(null);

    try {
      const res = await api.rotateKey(keyItem.id, newRawKey.trim(), allowInvalid);
      onKeyRotated(res.key);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Key rotation failed during proxy validation.');
    } finally {
      setIsRotating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <RotateCw className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100 text-sm sm:text-base">
                Rotate Secret Key
              </h3>
              <p className="text-xs text-slate-400">
                Replace credentials while keeping prompts and routing intact.
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
        <div className="p-5 space-y-4">
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs">
            <div className="text-slate-400 font-medium">Target Key Card:</div>
            <div className="text-slate-200 font-semibold mt-0.5">{keyItem.label}</div>
            <div className="text-slate-500 font-mono text-[11px] mt-1">
              Current Masked: {keyItem.maskedKey} ({keyItem.provider.toUpperCase()})
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              New Replacement API Key
            </label>
            <input
              type="password"
              autoComplete="new-password"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck="false"
              value={newRawKey}
              onChange={(e) => setNewRawKey(e.target.value)}
              placeholder="Paste new secret key..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
            />
            <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
              <Shield className="w-3 h-3 text-emerald-400" />
              The proxy will validate before encrypting with AES-256.
            </p>
          </div>

          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-200 flex flex-col gap-2">
              <div className="flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Validation Error:</span>
                  <p className="text-rose-300 font-mono text-[11px] mt-0.5">{errorMessage}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRotate(true)}
                className="text-xs bg-rose-900/60 hover:bg-rose-800 text-rose-100 px-3 py-1 rounded-lg border border-rose-700/60 self-start transition-colors"
              >
                Force Rotate Anyway
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
            disabled={isRotating || !newRawKey.trim()}
            onClick={() => handleRotate(false)}
            className="flex items-center space-x-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-5 py-2 rounded-xl transition-all shadow-md shadow-indigo-600/20"
          >
            {isRotating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Validating & Encrypting...</span>
              </>
            ) : (
              <span>Confirm & Rotate Key</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
