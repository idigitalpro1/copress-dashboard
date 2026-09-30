import React, { useState } from 'react';
import {
  X,
  History,
  RotateCcw,
  CheckCircle,
  Clock,
  User,
  FileText,
  ChevronRight,
  ArrowLeftRight,
} from 'lucide-react';
import { SystemPrompt, PromptVersion } from '../../types';

interface VersionHistoryModalProps {
  prompt: SystemPrompt | null;
  isOpen: boolean;
  onClose: () => void;
  onRestoreVersion: (promptId: string, version: string, notes?: string) => Promise<void>;
}

export const VersionHistoryModal: React.FC<VersionHistoryModalProps> = ({
  prompt,
  isOpen,
  onClose,
  onRestoreVersion,
}) => {
  const [selectedVersion, setSelectedVersion] = useState<PromptVersion | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  if (!isOpen || !prompt) return null;

  const currentVer = selectedVersion || prompt.versions[prompt.versions.length - 1];

  const handleRestore = async (version: string) => {
    if (
      !confirm(
        `Are you sure you want to restore Version ${version}? This will become the new active baseline.`
      )
    ) {
      return;
    }

    setIsRestoring(true);
    try {
      await onRestoreVersion(prompt.id, version, `Restored from historical snapshot v${version}`);
      onClose();
    } catch (err: any) {
      alert(`Restore failed: ${err.message}`);
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <History className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-semibold text-slate-100 text-sm sm:text-base">
                  Version History & Audit Log
                </h3>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-indigo-950/70 border border-indigo-800 text-indigo-300">
                  {prompt.title}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Track iterative revisions, diffs, and restore previous newsroom prompt iterations.
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

        {/* 2-Column Split: Version list on left, Snapshot preview on right */}
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-800 flex-1 overflow-hidden">
          {/* Left: Versions Timeline */}
          <div className="p-4 overflow-y-auto max-h-[300px] md:max-h-none space-y-2">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Timeline Revisions ({prompt.versions.length})
            </h4>

            <div className="space-y-2">
              {[...prompt.versions].reverse().map((ver, idx) => {
                const isCurrent = ver.version === prompt.currentVersion;
                const isSelected = currentVer?.version === ver.version;

                return (
                  <button
                    key={ver.version}
                    onClick={() => setSelectedVersion(ver)}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      isSelected
                        ? 'bg-indigo-950/40 border-indigo-600 text-white'
                        : 'bg-slate-950 border-slate-800/80 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-bold text-xs text-indigo-300">
                          v{ver.version}
                        </span>
                        {isCurrent && (
                          <span className="text-[10px] font-medium bg-emerald-950/80 border border-emerald-800 text-emerald-300 px-1.5 py-0.2 rounded-full">
                            Active
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(ver.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 line-clamp-1 mt-1 font-sans">
                      {ver.notes || 'No commit notes'}
                    </p>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 mt-2 pt-1 border-t border-slate-800/50">
                      <span className="flex items-center gap-1">
                        <User className="w-2.5 h-2.5" />
                        {ver.author || 'Editor'}
                      </span>
                      <ChevronRight className="w-3 h-3 text-slate-500" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: Snapshot Detail View */}
          <div className="md:col-span-2 p-5 flex flex-col justify-between overflow-y-auto bg-slate-950/40">
            {currentVer ? (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-2">
                  <div>
                    <div className="flex items-center space-x-2">
                      <h4 className="text-sm font-semibold text-slate-100">
                        Version v{currentVer.version} Snapshot
                      </h4>
                      {currentVer.version === prompt.currentVersion && (
                        <span className="text-[10px] font-medium bg-emerald-950/80 border border-emerald-800 text-emerald-300 px-2 py-0.5 rounded-full">
                          Currently Active in Production
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Committed on {new Date(currentVer.createdAt).toLocaleString()} by {currentVer.author}
                    </p>
                  </div>

                  {currentVer.version !== prompt.currentVersion && (
                    <button
                      type="button"
                      disabled={isRestoring}
                      onClick={() => handleRestore(currentVer.version)}
                      className="flex items-center space-x-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-1.5 rounded-xl transition-all shadow-md self-start sm:self-auto cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Rollback to v{currentVer.version}</span>
                    </button>
                  )}
                </div>

                {/* Commit Notes */}
                <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 text-xs">
                  <span className="text-slate-400 font-medium">Changelog Description: </span>
                  <span className="text-slate-200">{currentVer.notes || 'Initial baseline'}</span>
                </div>

                {/* System Prompt Code Box */}
                <div>
                  <div className="text-xs font-medium text-slate-400 mb-1.5 flex items-center justify-between">
                    <span>System Prompt Definition:</span>
                    <span className="font-mono text-[11px] text-slate-500">
                      {currentVer.systemPrompt.length} chars
                    </span>
                  </div>
                  <pre className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs text-slate-200 whitespace-pre-wrap leading-relaxed max-h-[300px] overflow-y-auto selection:bg-indigo-900">
                    {currentVer.systemPrompt}
                  </pre>
                </div>

                {/* User Template */}
                {currentVer.userTemplate && (
                  <div>
                    <div className="text-xs font-medium text-slate-400 mb-1">
                      User Prompt Template:
                    </div>
                    <pre className="bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-xs text-slate-300 whitespace-pre-wrap">
                      {currentVer.userTemplate}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-slate-400 text-xs">
                Select a version from the timeline to inspect its snapshot.
              </div>
            )}

            <div className="pt-4 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="text-xs text-slate-400 hover:text-slate-200 px-4 py-2 rounded-xl hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
