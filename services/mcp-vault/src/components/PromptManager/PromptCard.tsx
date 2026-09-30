import React from 'react';
import {
  FileCode,
  History,
  Edit3,
  Play,
  Trash2,
  Key,
  Cpu,
  Layers,
  Sparkles,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { SystemPrompt, VaultKey } from '../../types';

interface PromptCardProps {
  prompt: SystemPrompt;
  keys: VaultKey[];
  onEdit: (prompt: SystemPrompt) => void;
  onViewHistory: (prompt: SystemPrompt) => void;
  onDelete: (id: string) => void;
  onTestInSandbox: (prompt: SystemPrompt) => void;
  onMapKey: (promptId: string, keyId: string | null) => void;
}

export const PromptCard: React.FC<PromptCardProps> = ({
  prompt,
  keys,
  onEdit,
  onViewHistory,
  onDelete,
  onTestInSandbox,
  onMapKey,
}) => {
  const mappedKey = keys.find((k) => k.id === prompt.mappedKeyId);

  // Category config
  const getCategoryBadge = () => {
    switch (prompt.category) {
      case 'headline-byline':
        return { label: 'Headline & Byline', color: 'bg-blue-950/80 text-blue-300 border-blue-800' };
      case 'column-layout':
        return { label: 'Column Demarcator', color: 'bg-purple-950/80 text-purple-300 border-purple-800' };
      case 'wire-normalizer':
        return { label: 'Wire Normalizer', color: 'bg-emerald-950/80 text-emerald-300 border-emerald-800' };
      case 'sports-scores':
        return { label: 'Sports Agate/Scores', color: 'bg-amber-950/80 text-amber-300 border-amber-800' };
      case 'caption-parser':
        return { label: 'Photo Captions', color: 'bg-pink-950/80 text-pink-300 border-pink-800' };
      case 'custom':
      default:
        return { label: 'Custom Pipeline', color: 'bg-slate-800 text-slate-300 border-slate-700' };
    }
  };

  const cat = getCategoryBadge();

  return (
    <div className="bg-slate-900/90 rounded-2xl border border-slate-800 hover:border-slate-700/80 p-5 shadow-lg transition-all flex flex-col justify-between group">
      <div>
        {/* Header Tags */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center space-x-2">
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${cat.color}`}
            >
              {cat.label}
            </span>
            <span className="text-[11px] font-mono text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/60">
              v{prompt.currentVersion}
            </span>
          </div>

          <span className="text-[10px] uppercase font-mono tracking-wider px-2 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800">
            {prompt.targetFormat.toUpperCase()}
          </span>
        </div>

        {/* Title & Description */}
        <h3 className="font-semibold text-slate-100 text-base mb-1.5 group-hover:text-indigo-300 transition-colors">
          {prompt.title}
        </h3>
        <p className="text-xs text-slate-400 line-clamp-2 mb-4 leading-relaxed">
          {prompt.description}
        </p>

        {/* System Prompt Code Box Preview */}
        <div className="bg-slate-950 rounded-xl border border-slate-800/80 p-3 mb-4 font-mono text-[11px] text-slate-400 max-h-24 overflow-hidden relative">
          <div className="line-clamp-3 select-none leading-relaxed">
            {prompt.systemPrompt}
          </div>
          <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-slate-950 to-transparent pointer-events-none" />
        </div>

        {/* Provider Mapping & Target Model Bar */}
        <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800/60 space-y-2 mb-4 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-[11px] flex items-center gap-1 font-medium">
              <Key className="w-3 h-3 text-indigo-400" />
              Mapped Key Card:
            </span>
            <select
              value={prompt.mappedKeyId || ''}
              onChange={(e) => onMapKey(prompt.id, e.target.value || null)}
              className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 max-w-[160px] truncate"
            >
              <option value="">(No mapped key)</option>
              {keys.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label} ({k.maskedKey.slice(-4)})
                </option>
              ))}
            </select>
          </div>
          <p className="text-[11px] text-slate-400">Choose a key that passed Test Connection here or explicitly in the sandbox. Set a model for that provider in Edit or the sandbox.</p>

          <div className="flex items-center justify-between pt-1 border-t border-slate-800/40 text-[11px]">
            <span className="text-slate-400 flex items-center gap-1">
              <Cpu className="w-3 h-3 text-sky-400" />
              Recommended Model:
            </span>
            <span className="font-mono text-sky-300 font-medium">
              {prompt.recommendedModel}
            </span>
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div>
        <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-800/80">
          {/* Test in Sandbox */}
          <button
            type="button"
            onClick={() => onTestInSandbox(prompt)}
            className="flex items-center justify-center space-x-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 px-3 py-2 rounded-xl shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>Test Sandbox</span>
          </button>

          {/* Version History */}
          <button
            type="button"
            onClick={() => onViewHistory(prompt)}
            className="flex items-center justify-center space-x-1.5 text-xs text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 px-3 py-2 rounded-xl border border-slate-700/60 transition-colors"
          >
            <History className="w-3 h-3 text-indigo-400" />
            <span>History ({prompt.versions.length})</span>
          </button>
        </div>

        {/* Secondary Actions */}
        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 px-1">
          <button
            onClick={() => onEdit(prompt)}
            className="flex items-center space-x-1 text-slate-400 hover:text-indigo-300 transition-colors"
          >
            <Edit3 className="w-3 h-3" />
            <span>Edit Prompt</span>
          </button>

          <button
            onClick={() => {
              if (confirm(`Delete prompt '${prompt.title}'?`)) {
                onDelete(prompt.id);
              }
            }}
            className="flex items-center space-x-1 text-slate-500 hover:text-rose-400 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            <span>Delete</span>
          </button>
        </div>
      </div>
    </div>
  );
};
