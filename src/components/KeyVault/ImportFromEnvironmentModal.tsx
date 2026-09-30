import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  CheckCircle2,
  FolderSync,
  Plus,
  RefreshCw,
  Cpu,
  Lock,
  Sparkles,
  Check,
  AlertCircle,
} from 'lucide-react';
import { EnvCandidate, VaultKey } from '../../types';
import { api } from '../../services/api';

interface ImportFromEnvironmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeysImported: (updatedKeys: VaultKey[]) => void;
}

export const ImportFromEnvironmentModal: React.FC<ImportFromEnvironmentModalProps> = ({
  isOpen,
  onClose,
  onKeysImported,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [detectedKeys, setDetectedKeys] = useState<EnvCandidate[]>([]);
  const [envStatus, setEnvStatus] = useState<{
    hasEnvGeminiKey: boolean;
    hasMasterKey: boolean;
    encryptionAlgorithm: string;
    totalFound?: number;
    newCandidatesCount?: number;
  } | null>(null);
  const [addingKeyName, setAddingKeyName] = useState<string | null>(null);
  const [isAddingAll, setIsAddingAll] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Trigger getEnvStatus when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchEnvStatus();
    }
  }, [isOpen]);

  const fetchEnvStatus = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const data = await api.getEnvStatus();
      setEnvStatus({
        hasEnvGeminiKey: data.hasEnvGeminiKey,
        hasMasterKey: data.hasMasterKey,
        encryptionAlgorithm: data.encryptionAlgorithm || 'AES-256-GCM',
        totalFound: data.totalFound,
        newCandidatesCount: data.newCandidatesCount,
      });
      setDetectedKeys(data.detectedKeys || []);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to fetch environment status');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  // Add individual un-vaulted key to vault
  const handleAddToVault = async (candidate: EnvCandidate) => {
    setAddingKeyName(candidate.envVarName);
    setErrorMsg(null);

    try {
      const res = await api.importSelectedEnvKeys([
        {
          envVarName: candidate.envVarName,
          label: candidate.suggestedLabel || `${candidate.envVarName} (.env import)`,
        },
      ]);

      if (res.keys) {
        onKeysImported(res.keys);
      }

      // Mark this key as already in vault locally
      setDetectedKeys((prev) =>
        prev.map((k) =>
          k.envVarName === candidate.envVarName
            ? { ...k, alreadyInVault: true, validationMessage: 'Successfully placed into encrypted vault' }
            : k
        )
      );
    } catch (err: any) {
      setErrorMsg(`Failed to add ${candidate.envVarName}: ${err.message}`);
    } finally {
      setAddingKeyName(null);
    }
  };

  // Add all un-vaulted keys to vault
  const handleAddAllToVault = async () => {
    const unvaulted = detectedKeys.filter((k) => !k.alreadyInVault);
    if (unvaulted.length === 0) return;

    setIsAddingAll(true);
    setErrorMsg(null);

    try {
      const payload = unvaulted.map((k) => ({
        envVarName: k.envVarName,
        label: k.suggestedLabel || `${k.envVarName} (.env import)`,
      }));

      const res = await api.importSelectedEnvKeys(payload);
      if (res.keys) {
        onKeysImported(res.keys);
      }

      // Mark all imported keys as already in vault
      setDetectedKeys((prev) =>
        prev.map((k) => ({
          ...k,
          alreadyInVault: true,
        }))
      );
    } catch (err: any) {
      setErrorMsg(`Failed to add all keys: ${err.message}`);
    } finally {
      setIsAddingAll(false);
    }
  };

  const unvaultedKeys = detectedKeys.filter((k) => !k.alreadyInVault);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500/20 to-emerald-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <FolderSync className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100 text-sm sm:text-base flex items-center gap-2">
                <span>Import from Environment</span>
                <span className="text-[10px] font-mono uppercase bg-indigo-950/80 text-indigo-300 border border-indigo-800 px-2 py-0.5 rounded">
                  Server Proxy getEnvStatus
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Pulls active environment variables, validates credentials, and places them into the AES-256 vault.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              disabled={isLoading}
              onClick={fetchEnvStatus}
              title="Refresh environment status"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-indigo-400' : ''}`} />
            </button>

            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* System Environment Summary Bar */}
        {envStatus && (
          <div className="px-4 py-2.5 bg-slate-950 border-b border-slate-800/80 flex flex-wrap items-center justify-between text-xs text-slate-400 gap-2 font-mono">
            <div className="flex items-center space-x-3">
              <span className="flex items-center gap-1.5 text-slate-300">
                <Lock className="w-3.5 h-3.5 text-purple-400" />
                <span>Algorithm: {envStatus.encryptionAlgorithm}</span>
              </span>
              <span>•</span>
              <span className="flex items-center gap-1 text-slate-300">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Master Key: Ready</span>
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-slate-300 font-bold">{detectedKeys.length}</span>
              <span>keys detected</span>
              {unvaultedKeys.length > 0 && (
                <span className="px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px]">
                  {unvaultedKeys.length} un-vaulted
                </span>
              )}
            </div>
          </div>
        )}

        {/* Body Content */}
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-200 flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Error: </span>
                <span>{errorMsg}</span>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-10 h-10 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mx-auto" />
              <h4 className="text-xs font-semibold text-slate-300">
                Calling getEnvStatus & Validating Environment Keys...
              </h4>
              <p className="text-[11px] text-slate-500 font-mono">
                Pinging provider validation endpoints via server-side proxy
              </p>
            </div>
          ) : detectedKeys.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400 pb-1">
                <span>Detected Server Keys ({detectedKeys.length})</span>
                {unvaultedKeys.length > 1 && (
                  <button
                    type="button"
                    disabled={isAddingAll}
                    onClick={handleAddAllToVault}
                    className="text-xs font-medium text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors"
                  >
                    {isAddingAll ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Plus className="w-3 h-3" />
                    )}
                    <span>Add All ({unvaultedKeys.length}) to Vault</span>
                  </button>
                )}
              </div>

              {detectedKeys.map((key) => {
                const isAddingThis = addingKeyName === key.envVarName;

                return (
                  <div
                    key={key.envVarName}
                    className={`rounded-2xl border p-4 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      key.alreadyInVault
                        ? 'bg-slate-950/40 border-slate-800/60'
                        : 'bg-slate-900/90 border-slate-700/80 shadow-md hover:border-slate-600'
                    }`}
                  >
                    {/* Key Details */}
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-bold text-sm text-slate-100">
                          {key.envVarName}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                          {key.source}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono">
                        <span className="capitalize text-slate-300 font-semibold px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/60">
                          {key.provider}
                        </span>
                        <span>•</span>
                        <span className="tracking-widest text-slate-300 font-mono">
                          {key.maskedKey}
                        </span>
                        <span>•</span>
                        <span className="text-slate-400">
                          Model: <span className="text-sky-300">{key.recommendedModel}</span>
                        </span>
                      </div>

                      {/* Diagnostic Ping Info */}
                      <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5 pt-0.5">
                        {key.isValid ? (
                          <>
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            <span className="text-emerald-300">Live Status: Valid</span>
                            {key.latencyMs !== undefined && (
                              <span className="text-emerald-400/80">({key.latencyMs}ms)</span>
                            )}
                          </>
                        ) : (
                          <>
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                            <span className="text-amber-300">Validation Note:</span>
                            <span className="text-slate-400 line-clamp-1">{key.validationMessage}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Action / Vault Status Button */}
                    <div className="shrink-0 self-end sm:self-center">
                      {key.alreadyInVault ? (
                        <div className="flex items-center space-x-1.5 text-xs text-emerald-300 bg-emerald-950/60 border border-emerald-800/70 px-3 py-1.5 rounded-xl font-medium">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span>Already in Vault</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={isAddingThis || isAddingAll}
                          onClick={() => handleAddToVault(key)}
                          className="flex items-center space-x-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
                        >
                          {isAddingThis ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Adding to Vault...</span>
                            </>
                          ) : (
                            <>
                              <Plus className="w-3.5 h-3.5" />
                              <span>Add to Vault</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 px-4 bg-slate-950 rounded-2xl border border-dashed border-slate-800 text-xs text-slate-400 space-y-2">
              <FolderSync className="w-8 h-8 text-slate-600 mx-auto" />
              <div className="font-semibold text-slate-300">No Environment API Keys Found</div>
              <p className="max-w-sm mx-auto text-slate-500">
                No matching variables like <code className="text-indigo-400">GEMINI_API_KEY</code>, <code className="text-indigo-400">OPENAI_API_KEY</code>, or <code className="text-indigo-400">ANTHROPIC_API_KEY</code> were found in the server's environment.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-slate-800 bg-slate-950/70">
          <div className="flex items-center space-x-1.5 text-xs text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[11px] font-mono">AES-256-GCM Encrypted at Rest</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-slate-400 hover:text-slate-200 px-4 py-2 rounded-xl hover:bg-slate-800 transition-colors"
            >
              Close
            </button>

            {unvaultedKeys.length > 0 && (
              <button
                type="button"
                disabled={isAddingAll}
                onClick={handleAddAllToVault}
                className="flex items-center space-x-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
              >
                {isAddingAll ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Adding All...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Add All ({unvaultedKeys.length}) to Vault</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
