import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  CheckCircle,
  Key,
  FolderSync,
  Sparkles,
  ArrowRight,
  Info,
  Check,
  Star,
} from 'lucide-react';
import { EnvCandidate, VaultKey } from '../../types';
import { api } from '../../services/api';

interface EnvCandidatesPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeysImported: (updatedKeys: VaultKey[]) => void;
  initialCandidates?: EnvCandidate[];
}

export const EnvCandidatesPromptModal: React.FC<EnvCandidatesPromptModalProps> = ({
  isOpen,
  onClose,
  onKeysImported,
  initialCandidates,
}) => {
  const [candidates, setCandidates] = useState<EnvCandidate[]>(initialCandidates || []);
  const [selectedVarNames, setSelectedVarNames] = useState<Set<string>>(new Set());
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [defaultVarName, setDefaultVarName] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<{
    importedCount: number;
    errors: string[];
  } | null>(null);

  // Scan candidates when modal opens
  useEffect(() => {
    if (isOpen) {
      scanCandidates();
    }
  }, [isOpen]);

  const scanCandidates = async () => {
    setIsLoading(true);
    setImportSummary(null);
    try {
      const res = await api.fetchAndValidateEnvCandidates();
      setCandidates(res.candidates);

      // Pre-select new, valid candidates by default
      const newSelected = new Set<string>();
      const initialLabels: Record<string, string> = {};

      for (const c of res.candidates) {
        initialLabels[c.envVarName] = c.suggestedLabel;
        if (!c.alreadyInVault && c.isValid) {
          newSelected.add(c.envVarName);
        }
      }

      setSelectedVarNames(newSelected);
      setLabels(initialLabels);

      // Set first valid new candidate as default candidate if none chosen
      const firstValidNew = res.candidates.find((c) => !c.alreadyInVault && c.isValid);
      if (firstValidNew) {
        setDefaultVarName(firstValidNew.envVarName);
      }
    } catch (err: any) {
      alert(`Failed to scan server environment variables: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const toggleSelect = (varName: string) => {
    const next = new Set(selectedVarNames);
    if (next.has(varName)) {
      next.delete(varName);
      if (defaultVarName === varName) {
        setDefaultVarName('');
      }
    } else {
      next.add(varName);
    }
    setSelectedVarNames(next);
  };

  const selectAllNew = () => {
    const next = new Set<string>();
    candidates.forEach((c) => {
      if (!c.alreadyInVault) {
        next.add(c.envVarName);
      }
    });
    setSelectedVarNames(next);
  };

  const deselectAll = () => {
    setSelectedVarNames(new Set());
    setDefaultVarName('');
  };

  const handleImport = async () => {
    if (selectedVarNames.size === 0) return;

    setIsImporting(true);
    setImportSummary(null);

    try {
      const keysToImport = Array.from(selectedVarNames).map((varName) => ({
        envVarName: varName,
        label: labels[varName] || varName,
        isDefault: defaultVarName === varName,
      }));

      const res = await api.importSelectedEnvKeys(keysToImport);
      setImportSummary({
        importedCount: res.importResult.importedCount,
        errors: res.importResult.errors,
      });

      if (res.keys) {
        onKeysImported(res.keys);
      }

      // Re-scan to update "already in vault" status
      const resScan = await api.fetchAndValidateEnvCandidates();
      setCandidates(resScan.candidates);
      setSelectedVarNames(new Set());
    } catch (err: any) {
      alert(`Import error: ${err.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  const newValidCandidates = candidates.filter((c) => !c.alreadyInVault && c.isValid);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <FolderSync className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100 text-sm sm:text-base flex items-center gap-2">
                <span>Server Environment Variables Scanner</span>
                <span className="text-[10px] font-mono uppercase bg-emerald-950/80 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded">
                  Schema Validated
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Discovers server-side API keys, verifies live endpoint status, and imports into AES-256 vault.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {/* Quick controls bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="text-slate-300 font-medium">
              Found <span className="text-emerald-400 font-bold">{candidates.length}</span> key candidate(s) ({newValidCandidates.length} new & valid)
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={selectAllNew}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors font-medium"
              >
                Select New
              </button>
              <span className="text-slate-600">•</span>
              <button
                type="button"
                onClick={deselectAll}
                className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
              >
                Deselect All
              </button>
              <span className="text-slate-600">•</span>
              <button
                type="button"
                disabled={isLoading}
                onClick={scanCandidates}
                className="text-xs text-slate-400 hover:text-emerald-400 transition-colors flex items-center gap-1"
              >
                {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <span>Re-scan</span>}
              </button>
            </div>
          </div>

          {/* Loading State */}
          {isLoading ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-9 h-9 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mx-auto" />
              <p className="text-xs text-slate-400 font-mono">
                Scanning server environment & pinging validation endpoints...
              </p>
            </div>
          ) : candidates.length > 0 ? (
            <div className="space-y-3">
              {candidates.map((cand) => {
                const isSelected = selectedVarNames.has(cand.envVarName);
                const isDefault = defaultVarName === cand.envVarName;

                return (
                  <div
                    key={cand.envVarName}
                    className={`rounded-xl border p-3.5 transition-all ${
                      cand.alreadyInVault
                        ? 'bg-slate-950/40 border-slate-800/60 opacity-75'
                        : isSelected
                        ? 'bg-slate-900 border-emerald-500/50 shadow-md shadow-emerald-950/20'
                        : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      {/* Checkbox & Variable Info */}
                      <div className="flex items-start space-x-3">
                        <input
                          type="checkbox"
                          disabled={cand.alreadyInVault}
                          checked={isSelected}
                          onChange={() => toggleSelect(cand.envVarName)}
                          className="mt-1 w-4 h-4 rounded accent-emerald-500 cursor-pointer disabled:cursor-not-allowed"
                        />

                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-mono font-bold text-xs text-slate-100">
                              {cand.envVarName}
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                              {cand.source}
                            </span>
                            {cand.alreadyInVault && (
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                                Already in Vault
                              </span>
                            )}
                          </div>

                          <div className="flex items-center space-x-2 mt-1 text-[11px] text-slate-400 font-mono">
                            <span className="capitalize text-slate-300 font-semibold">
                              {cand.provider}
                            </span>
                            <span>•</span>
                            <span className="tracking-widest text-slate-300">
                              {cand.maskedKey}
                            </span>
                            <span>•</span>
                            <span>Model: {cand.recommendedModel}</span>
                          </div>
                        </div>
                      </div>

                      {/* Live Validation Status Pill */}
                      <div className="shrink-0 text-right">
                        {cand.isValid ? (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-950/80 text-emerald-300 border border-emerald-800">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span>Verified Active</span>
                            {cand.latencyMs !== undefined && (
                              <span className="text-[10px] text-emerald-400/80 font-mono ml-0.5">
                                {cand.latencyMs}ms
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-rose-950/80 text-rose-300 border border-rose-800">
                            <ShieldAlert className="w-3 h-3 text-rose-400" />
                            <span>Invalid / Unreachable</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Diagnostic message */}
                    <div className="text-[10px] text-slate-500 font-mono mt-2 pl-7 line-clamp-1">
                      {cand.validationMessage}
                    </div>

                    {/* Editable Label & Default Toggle (only if selected and not in vault) */}
                    {isSelected && !cand.alreadyInVault && (
                      <div className="mt-3 pt-2.5 border-t border-slate-800/80 pl-7 flex flex-col sm:flex-row sm:items-center justify-between gap-2 animate-in fade-in duration-150">
                        <div className="flex-1 max-w-sm">
                          <label className="block text-[10px] text-slate-400 mb-0.5">
                            Card Label Descriptor:
                          </label>
                          <input
                            type="text"
                            value={labels[cand.envVarName] || ''}
                            onChange={(e) =>
                              setLabels({ ...labels, [cand.envVarName]: e.target.value })
                            }
                            placeholder="Descriptive label..."
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                        </div>

                        <label className="flex items-center space-x-1.5 text-xs text-slate-300 cursor-pointer self-start sm:self-end pt-1">
                          <input
                            type="radio"
                            name="defaultKeySelection"
                            checked={isDefault}
                            onChange={() => setDefaultVarName(cand.envVarName)}
                            className="accent-emerald-500"
                          />
                          <span className="text-[11px] text-slate-400 flex items-center gap-1">
                            <Star className="w-3 h-3 text-indigo-400" />
                            Set as primary default
                          </span>
                        </label>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 px-4 bg-slate-950 rounded-xl border border-dashed border-slate-800 text-xs text-slate-400">
              No matching API key variables found in server environment files (.env, .env.local, process.env).
            </div>
          )}

          {/* Import Summary Result Banner */}
          {importSummary && (
            <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-800 text-xs text-emerald-200 space-y-1 animate-in fade-in">
              <div className="flex items-center space-x-2 font-semibold">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span>
                  Successfully imported {importSummary.importedCount} key(s) into the vault with AES-256-GCM encryption!
                </span>
              </div>
              {importSummary.errors.length > 0 && (
                <div className="text-rose-400 text-[11px] pt-1">
                  {importSummary.errors.map((e, idx) => (
                    <div key={idx}>• {e}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-slate-800 bg-slate-950/70">
          <div className="flex items-center space-x-1.5 text-xs text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[11px] font-mono">AES-256-GCM Hardware Encrypted</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-slate-400 hover:text-slate-200 px-4 py-2 rounded-xl hover:bg-slate-800 transition-colors"
            >
              Close
            </button>

            <button
              type="button"
              disabled={isImporting || selectedVarNames.size === 0}
              onClick={handleImport}
              className="flex items-center space-x-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl transition-all shadow-md shadow-emerald-600/20 cursor-pointer disabled:cursor-not-allowed"
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Encrypting & Importing...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>
                    Import {selectedVarNames.size} Selected Key{selectedVarNames.size === 1 ? '' : 's'} as Active Vault Key{selectedVarNames.size === 1 ? '' : 's'}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
