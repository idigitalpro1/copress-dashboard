import React, { useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  RotateCw,
  Power,
  Trash2,
  Check,
  Copy,
  Clock,
  Activity,
  Star,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { VaultKey, ValidationResponse } from '../../types';
import { api } from '../../services/api';

interface KeyCardProps {
  keyItem: VaultKey;
  onUpdate: (updatedKey: VaultKey) => void;
  onDelete: (id: string) => void;
  onRotateClick: (keyItem: VaultKey) => void;
}

export const KeyCard: React.FC<KeyCardProps> = ({
  keyItem,
  onUpdate,
  onDelete,
  onRotateClick,
}) => {
  const [isPinging, setIsPinging] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [copied, setCopied] = useState(false);

  const handlePing = async () => {
    setIsPinging(true);
    try {
      const res = await api.pingKey(keyItem.id);
      onUpdate(res.key);
    } catch (err: any) {
      alert(`Ping failed: ${err.message}`);
    } finally {
      setIsPinging(false);
    }
  };

  const handleToggleRevoke = async () => {
    setIsRevoking(true);
    try {
      const res = await api.toggleRevokeKey(keyItem.id);
      onUpdate(res.key);
    } catch (err: any) {
      alert(`Revoke action failed: ${err.message}`);
    } finally {
      setIsRevoking(false);
    }
  };

  const handleSetDefault = async () => {
    try {
      await api.setDefaultKey(keyItem.id);
      onUpdate({ ...keyItem, isDefault: true });
    } catch (err: any) {
      alert(`Could not set default: ${err.message}`);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to permanently delete '${keyItem.label}' from the vault?`)) {
      return;
    }
    setIsDeleting(true);
    try {
      await api.deleteKey(keyItem.id);
      onDelete(keyItem.id);
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
      setIsDeleting(false);
    }
  };

  const copyMasked = () => {
    navigator.clipboard.writeText(keyItem.maskedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Provider Styling and Badge Config
  const getProviderInfo = () => {
    switch (keyItem.provider) {
      case 'gemini':
        return {
          title: 'Google Gemini',
          sub: 'generativelanguage.googleapis.com',
          border: 'border-blue-500/30 hover:border-blue-500/60',
          gradient: 'from-blue-600 via-indigo-600 to-purple-600',
          pillBg: 'bg-blue-950/70 border-blue-800 text-blue-300',
          badgeText: 'GEMINI',
        };
      case 'anthropic':
        return {
          title: 'Anthropic Claude',
          sub: 'api.anthropic.com',
          border: 'border-amber-500/30 hover:border-amber-500/60',
          gradient: 'from-amber-600 via-orange-600 to-amber-700',
          pillBg: 'bg-amber-950/70 border-amber-800 text-amber-300',
          badgeText: 'CLAUDE',
        };
      case 'openai':
        return {
          title: 'OpenAI',
          sub: 'api.openai.com',
          border: 'border-emerald-500/30 hover:border-emerald-500/60',
          gradient: 'from-emerald-600 via-teal-600 to-cyan-600',
          pillBg: 'bg-emerald-950/70 border-emerald-800 text-emerald-300',
          badgeText: 'OPENAI',
        };
      case 'custom':
      default:
        return {
          title: 'Custom Gateway',
          sub: keyItem.customEndpointUrl || 'Custom Endpoint',
          border: 'border-cyan-500/30 hover:border-cyan-500/60',
          gradient: 'from-cyan-600 to-slate-700',
          pillBg: 'bg-cyan-950/70 border-cyan-800 text-cyan-300',
          badgeText: 'CUSTOM',
        };
    }
  };

  const info = getProviderInfo();

  return (
    <div
      className={`relative bg-slate-900/90 rounded-2xl border ${info.border} p-5 shadow-lg transition-all duration-200 flex flex-col justify-between ${
        keyItem.status === 'revoked' ? 'opacity-70 bg-slate-950/80' : ''
      }`}
    >
      {/* Top Bar: Provider logo, name, status indicator */}
      <div>
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center space-x-3">
            <div
              className={`w-10 h-10 rounded-xl bg-gradient-to-br ${info.gradient} flex items-center justify-center text-white font-bold text-sm shadow-md shadow-black/40`}
            >
              {info.badgeText.slice(0, 2)}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-semibold text-slate-100 text-sm leading-snug line-clamp-1">
                  {keyItem.label}
                </h3>
                {keyItem.isDefault && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-900/80 text-indigo-200 border border-indigo-700">
                    <Star className="w-2.5 h-2.5 mr-0.5 fill-indigo-300 text-indigo-300" />
                    Default
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 font-mono truncate max-w-[200px]">
                {info.sub}
              </p>
            </div>
          </div>

          {/* Status Badge */}
          <div>
            {keyItem.status === 'active' && (
              <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-950/80 text-emerald-300 border border-emerald-800">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>Active</span>
                {keyItem.latencyMs !== undefined && (
                  <span className="text-[10px] text-emerald-400/80 font-mono ml-0.5">
                    {keyItem.latencyMs}ms
                  </span>
                )}
              </span>
            )}
            {keyItem.status === 'invalid' && (
              <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-950/80 text-rose-300 border border-rose-800">
                <ShieldAlert className="w-3 h-3 text-rose-400" />
                <span>Invalid</span>
              </span>
            )}
            {keyItem.status === 'revoked' && (
              <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-950/80 text-amber-300 border border-amber-800">
                <ShieldX className="w-3 h-3 text-amber-400" />
                <span>Revoked</span>
              </span>
            )}
          </div>
        </div>

        {/* Masked Key Display (Last 4 characters only) */}
        <div className="bg-slate-950/90 rounded-xl border border-slate-800/80 p-2.5 mb-3 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-[11px] text-slate-500 font-mono uppercase tracking-wider">
              Masked:
            </span>
            <code className="text-xs text-slate-300 font-mono tracking-widest selection:bg-indigo-900">
              {keyItem.maskedKey}
            </code>
          </div>

          <button
            onClick={copyMasked}
            title="Copy masked string"
            className="text-slate-400 hover:text-slate-200 p-1 rounded hover:bg-slate-800 transition-colors"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {/* Validation Message / Diagnostic */}
        <div className="text-[11px] text-slate-400 bg-slate-950/50 rounded-lg p-2 border border-slate-800/50 mb-4 line-clamp-2">
          <span className="text-slate-500 font-medium">Diagnostic: </span>
          {keyItem.validationMessage}
        </div>
      </div>

      {/* Action Toggles & Controls */}
      <div>
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80 mb-3">
          {/* Rotate Button */}
          <button
            type="button"
            onClick={() => onRotateClick(keyItem)}
            className="flex items-center justify-center space-x-1.5 text-xs text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 px-2.5 py-1.5 rounded-lg border border-slate-700/60 transition-colors"
          >
            <RotateCw className="w-3 h-3 text-indigo-400" />
            <span>Rotate Key</span>
          </button>

          {/* Re-test / Ping Button */}
          <button
            type="button"
            disabled={isPinging}
            onClick={handlePing}
            className="flex items-center justify-center space-x-1.5 text-xs text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 px-2.5 py-1.5 rounded-lg border border-slate-700/60 transition-colors disabled:opacity-50"
          >
            {isPinging ? (
              <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
            ) : (
              <Activity className="w-3 h-3 text-emerald-400" />
            )}
            <span>{isPinging ? 'Pinging...' : 'Test Connection'}</span>
          </button>

          {/* Revoke / Re-activate Toggle */}
          <button
            type="button"
            disabled={isRevoking}
            onClick={handleToggleRevoke}
            className={`flex items-center justify-center space-x-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
              keyItem.status === 'revoked'
                ? 'bg-amber-950/50 border-amber-800/70 text-amber-200 hover:bg-amber-900/60'
                : 'bg-slate-800/80 border-slate-700/60 text-slate-400 hover:text-amber-300 hover:bg-slate-700'
            }`}
          >
            <Power className="w-3 h-3" />
            <span>{keyItem.status === 'revoked' ? 'Re-activate' : 'Revoke'}</span>
          </button>

          {/* Set Default or Delete */}
          {!keyItem.isDefault ? (
            <button
              type="button"
              onClick={handleSetDefault}
              className="flex items-center justify-center space-x-1.5 text-xs text-slate-400 hover:text-indigo-300 bg-slate-800/80 hover:bg-slate-700/80 px-2.5 py-1.5 rounded-lg border border-slate-700/60 transition-colors"
            >
              <Star className="w-3 h-3 text-indigo-400" />
              <span>Make Default</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={isDeleting}
              onClick={handleDelete}
              className="flex items-center justify-center space-x-1.5 text-xs text-rose-400 hover:text-rose-200 bg-slate-800/80 hover:bg-rose-950/60 px-2.5 py-1.5 rounded-lg border border-slate-700/60 hover:border-rose-800 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              <span>Delete</span>
            </button>
          )}
        </div>

        {/* Footer Metadata */}
        <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
          <span className="flex items-center gap-1 font-mono">
            <Clock className="w-3 h-3" />
            {new Date(keyItem.createdAt).toLocaleDateString()}
          </span>
          <span className="font-mono">Used: {keyItem.usageCount}x</span>
          {!keyItem.isDefault && (
            <button
              onClick={handleDelete}
              title="Delete key"
              className="hover:text-rose-400 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
