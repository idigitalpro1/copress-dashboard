import React from 'react';
import { Sparkles, FolderSync, ArrowRight, ShieldCheck, X } from 'lucide-react';
import { EnvCandidate } from '../../types';

interface EnvDiscoveryBannerProps {
  candidates: EnvCandidate[];
  onOpenPrompt: () => void;
  onDismiss: () => void;
}

export const EnvDiscoveryBanner: React.FC<EnvDiscoveryBannerProps> = ({
  candidates,
  onOpenPrompt,
  onDismiss,
}) => {
  const unimported = candidates.filter((c) => !c.alreadyInVault && c.isValid);
  if (unimported.length === 0) return null;

  return (
    <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-emerald-950/80 via-slate-900 to-indigo-950/60 border border-emerald-500/40 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in duration-300">
      <div className="flex items-start sm:items-center space-x-3.5">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0 shadow-md">
          <FolderSync className="w-5 h-5 animate-pulse" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <h4 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
              <span>Server Environment Keys Detected</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-900/80 border border-emerald-700 text-emerald-200">
                {unimported.length} New Key{unimported.length === 1 ? '' : 's'}
              </span>
            </h4>
          </div>
          <p className="text-xs text-slate-300 mt-0.5">
            Discovered {unimported.map((k) => k.envVarName).join(', ')} in server environment.
            Validated and ready to import into your encrypted vault.
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-2 shrink-0 self-end sm:self-auto">
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-xl hover:bg-slate-800 transition-colors"
        >
          Dismiss
        </button>

        <button
          type="button"
          onClick={onOpenPrompt}
          className="flex items-center space-x-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl transition-all shadow-md shadow-emerald-600/30 cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Review & Import Keys</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
