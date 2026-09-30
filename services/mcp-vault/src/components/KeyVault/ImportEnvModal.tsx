import React, { useState } from 'react';
import {
  X,
  FileText,
  Shield,
  Loader2,
  CheckCircle,
  AlertCircle,
  FolderSync,
  Upload,
  ArrowRight,
} from 'lucide-react';
import { VaultKey } from '../../types';
import { api } from '../../services/api';

interface ImportEnvModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeysImported: (updatedKeys: VaultKey[]) => void;
}

export const ImportEnvModal: React.FC<ImportEnvModalProps> = ({
  isOpen,
  onClose,
  onKeysImported,
}) => {
  const [pastedEnv, setPastedEnv] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<{
    totalFound: number;
    imported: any[];
    skipped: any[];
    errors: string[];
  } | null>(null);

  if (!isOpen) return null;

  const handleScanAndImport = async (usePasted = false) => {
    setIsImporting(true);
    setImportSummary(null);

    try {
      const content = usePasted && pastedEnv.trim() ? pastedEnv.trim() : undefined;
      const res = await api.importKeysFromEnv(content);

      setImportSummary(res.importResult);
      if (res.keys) {
        onKeysImported(res.keys);
      }
    } catch (err: any) {
      alert(`Import error: ${err.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <FolderSync className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100 text-sm sm:text-base">
                Import API Keys from .env Files
              </h3>
              <p className="text-xs text-slate-400">
                Extracts keys, validates via proxy, and encrypts into vault with AES-256.
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
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
          {/* Quick Auto-Scan Action */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h4 className="text-xs font-semibold text-slate-200">
                Auto-Scan System & Local .env Files
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Scans <code className="text-indigo-300">.env</code>, <code className="text-indigo-300">.env.local</code>, and runtime <code className="text-indigo-300">process.env</code>.
              </p>
            </div>

            <button
              type="button"
              disabled={isImporting}
              onClick={() => handleScanAndImport(false)}
              className="flex items-center justify-center space-x-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-3.5 py-2 rounded-xl transition-all shadow-md shadow-emerald-600/20 shrink-0 cursor-pointer"
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Scanning...</span>
                </>
              ) : (
                <>
                  <FolderSync className="w-3.5 h-3.5" />
                  <span>Scan & Place in Vault</span>
                </>
              )}
            </button>
          </div>

          {/* Divider */}
          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-slate-800" />
            <span className="flex-shrink mx-3 text-[11px] text-slate-500 font-mono uppercase">
              Or paste .env contents below
            </span>
            <div className="flex-grow border-t border-slate-800" />
          </div>

          {/* Manual .env Content Paste */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Raw .env File Content (KEY=VALUE)
            </label>
            <textarea
              rows={5}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck="false"
              value={pastedEnv}
              onChange={(e) => setPastedEnv(e.target.value)}
              placeholder={`GEMINI_API_KEY=AIzaSy...\nOPENAI_API_KEY=sk-proj-...\nANTHROPIC_API_KEY=sk-ant-...`}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-600 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
              <Shield className="w-3 h-3 text-emerald-400" />
              Placeholder values like "YOUR_API_KEY" or empty strings are automatically ignored.
            </p>
          </div>

          {/* Import Results Banner */}
          {importSummary && (
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 animate-in fade-in">
              <div className="flex items-center space-x-2 text-xs font-semibold text-slate-200">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span>Import Summary: {importSummary.imported.length} Keys Placed into Vault</span>
              </div>

              {/* Imported list */}
              {importSummary.imported.length > 0 && (
                <div className="space-y-1 pt-1">
                  {importSummary.imported.map((item, idx) => (
                    <div
                      key={idx}
                      className="text-[11px] flex items-center justify-between bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800"
                    >
                      <span className="font-mono text-emerald-300 font-medium">
                        {item.envVarName}
                      </span>
                      <span className="text-slate-400 font-mono">{item.maskedKey}</span>
                      <span className="text-emerald-400 font-mono text-[10px] uppercase">
                        {item.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Skipped list */}
              {importSummary.skipped.length > 0 && (
                <div className="text-[11px] text-slate-400 pt-1">
                  <span className="text-slate-500 font-medium">Skipped (already in vault): </span>
                  {importSummary.skipped.map((s) => s.envVarName).join(', ')}
                </div>
              )}

              {/* Errors if any */}
              {importSummary.errors.length > 0 && (
                <div className="text-[11px] text-rose-400 space-y-0.5 pt-1">
                  {importSummary.errors.map((e, idx) => (
                    <div key={idx}>• {e}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-slate-800 bg-slate-950/50">
          <span className="text-[11px] text-slate-500 font-mono">
            AES-256-GCM Encrypted at Rest
          </span>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-slate-400 hover:text-slate-200 px-4 py-2 rounded-xl hover:bg-slate-800"
            >
              Done
            </button>

            {pastedEnv.trim() && (
              <button
                type="button"
                disabled={isImporting}
                onClick={() => handleScanAndImport(true)}
                className="flex items-center space-x-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl transition-all shadow-md cursor-pointer"
              >
                <span>Import Pasted .env</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
