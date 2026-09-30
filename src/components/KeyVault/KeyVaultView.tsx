import React, { useState, useEffect } from 'react';
import {
  Shield,
  ShieldCheck,
  Key,
  Search,
  Filter,
  RefreshCw,
  Sparkles,
  Lock,
  PlusCircle,
  Cpu,
  Layers,
  FolderSync,
} from 'lucide-react';
import { VaultKey, EnvCandidate } from '../../types';
import { SmartIntakeLane } from './SmartIntakeLane';
import { KeyCard } from './KeyCard';
import { ManualOverrideModal } from './ManualOverrideModal';
import { RotateKeyModal } from './RotateKeyModal';
import { ImportEnvModal } from './ImportEnvModal';
import { EnvCandidatesPromptModal } from './EnvCandidatesPromptModal';
import { ImportFromEnvironmentModal } from './ImportFromEnvironmentModal';
import { EnvDiscoveryBanner } from './EnvDiscoveryBanner';
import { api } from '../../services/api';

interface KeyVaultViewProps {
  keys: VaultKey[];
  onKeysChange: (keys: VaultKey[]) => void;
  onRefresh: () => void;
  onNavigateToLogs?: () => void;
}

export const KeyVaultView: React.FC<KeyVaultViewProps> = ({
  keys,
  onKeysChange,
  onRefresh,
  onNavigateToLogs,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterProvider, setFilterProvider] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const [isManualOverrideOpen, setIsManualOverrideOpen] = useState(false);
  const [isImportEnvOpen, setIsImportEnvOpen] = useState(false);
  const [isImportFromEnvModalOpen, setIsImportFromEnvModalOpen] = useState(false);
  const [rotatingKey, setRotatingKey] = useState<VaultKey | null>(null);

  const [envCandidates, setEnvCandidates] = useState<EnvCandidate[]>([]);
  const [isBannerDismissed, setIsBannerDismissed] = useState(false);

  // Fetch and validate environment variables against key vault schema
  const scanServerEnv = async () => {
    try {
      const res = await api.fetchAndValidateEnvCandidates();
      setEnvCandidates(res.candidates || []);
    } catch (err) {
      console.warn('Could not scan server environment variables:', err);
    }
  };

  useEffect(() => {
    scanServerEnv();
  }, [keys]);

  const handleKeyAdded = (newKey: VaultKey) => {
    onKeysChange([newKey, ...keys.filter((k) => k.id !== newKey.id)]);
  };

  const handleKeyUpdated = (updatedKey: VaultKey) => {
    onKeysChange(keys.map((k) => (k.id === updatedKey.id ? updatedKey : k)));
  };

  const handleKeyDeleted = (id: string) => {
    onKeysChange(keys.filter((k) => k.id !== id));
  };

  // Filter keys
  const filteredKeys = keys.filter((k) => {
    const matchesSearch =
      k.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      k.maskedKey.toLowerCase().includes(searchQuery.toLowerCase()) ||
      k.provider.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesProvider =
      filterProvider === 'all' || k.provider === filterProvider;

    const matchesStatus =
      filterStatus === 'all' || k.status === filterStatus;

    return matchesSearch && matchesProvider && matchesStatus;
  });

  const activeCount = keys.filter((k) => k.status === 'active').length;
  const avgLatency =
    activeCount > 0
      ? Math.round(
          keys
            .filter((k) => k.status === 'active' && typeof k.latencyMs === 'number')
            .reduce((acc, k) => acc + (k.latencyMs || 0), 0) / (activeCount || 1)
        )
      : 0;

  const unimportedCount = envCandidates.filter((c) => !c.alreadyInVault && c.isValid).length;

  return (
    <div className="space-y-6">
      {/* Overview Stat Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex items-center space-x-3.5 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Key className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-slate-100">{keys.length}</div>
            <div className="text-xs text-slate-400 font-medium">Total Vault Keys</div>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex items-center space-x-3.5 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-emerald-400">{activeCount}</div>
            <div className="text-xs text-slate-400 font-medium">Active & Validated</div>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex items-center space-x-3.5 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-slate-100">
              {avgLatency > 0 ? `${avgLatency}ms` : '—'}
            </div>
            <div className="text-xs text-slate-400 font-medium">Avg Proxy Ping</div>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex items-center space-x-3.5 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-purple-300">AES-256-GCM</div>
            <div className="text-xs text-slate-400 font-medium">Encrypted at Rest</div>
          </div>
        </div>
      </div>

      {/* Server Environment Discovery Banner */}
      {!isBannerDismissed && (
        <EnvDiscoveryBanner
          candidates={envCandidates}
          onOpenPrompt={() => setIsImportFromEnvModalOpen(true)}
          onDismiss={() => setIsBannerDismissed(true)}
        />
      )}

      {/* Module 1: Smart Intake Lane */}
      <SmartIntakeLane
        onKeyAdded={handleKeyAdded}
        onOpenManualOverride={() => setIsManualOverrideOpen(true)}
        onOpenImportEnv={() => setIsImportFromEnvModalOpen(true)}
      />

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <div className="flex items-center space-x-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search keys by label, masked string, or provider..."
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="flex items-center space-x-2 flex-wrap">
          {/* Import from Environment Button */}
          <button
            type="button"
            onClick={() => setIsImportFromEnvModalOpen(true)}
            className="flex items-center space-x-1.5 text-xs text-emerald-300 bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-800/80 px-3.5 py-2 rounded-xl transition-all shadow-sm relative cursor-pointer font-medium"
          >
            <FolderSync className="w-3.5 h-3.5 text-emerald-400" />
            <span>Import from Environment</span>
            {unimportedCount > 0 && (
              <span className="flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold bg-emerald-500 text-slate-950 rounded-full px-1">
                {unimportedCount}
              </span>
            )}
          </button>

          {/* Paste Raw .env button */}
          <button
            type="button"
            onClick={() => setIsImportEnvOpen(true)}
            className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-800 px-3 py-2 rounded-xl transition-all shadow-sm"
          >
            <span>Paste .env</span>
          </button>

          {/* Security Audit Logs shortcut */}
          {onNavigateToLogs && (
            <button
              type="button"
              onClick={onNavigateToLogs}
              className="flex items-center space-x-1.5 text-xs text-sky-300 bg-sky-950/50 hover:bg-sky-900/70 border border-sky-800/70 px-3 py-2 rounded-xl transition-all shadow-sm cursor-pointer"
            >
              <Shield className="w-3.5 h-3.5 text-sky-400" />
              <span>Audit Logs</span>
            </button>
          )}

          {/* Provider filter */}
          <select
            value={filterProvider}
            onChange={(e) => setFilterProvider(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="all">All Providers</option>
            <option value="gemini">Google Gemini</option>
            <option value="anthropic">Anthropic Claude</option>
            <option value="openai">OpenAI</option>
            <option value="custom">Custom Gateway</option>
          </select>

          {/* Status filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="invalid">Invalid Only</option>
            <option value="revoked">Revoked Only</option>
          </select>

          <button
            onClick={onRefresh}
            title="Refresh keys from backend"
            className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-xl border border-slate-800 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Modular Key Cards Grid */}
      {filteredKeys.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredKeys.map((keyItem) => (
            <KeyCard
              key={keyItem.id}
              keyItem={keyItem}
              onUpdate={handleKeyUpdated}
              onDelete={handleKeyDeleted}
              onRotateClick={(item) => setRotatingKey(item)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-14 px-4 bg-slate-900/40 rounded-2xl border border-dashed border-slate-800">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto mb-3">
            <Key className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-slate-200">No API Keys in Vault</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 mb-4">
            Add a key using the Smart Intake Lane above, or click Manual Override to configure custom endpoints.
          </p>
          <button
            onClick={() => setIsManualOverrideOpen(true)}
            className="inline-flex items-center space-x-1.5 text-xs font-medium text-indigo-400 hover:text-indigo-300 bg-indigo-950/60 hover:bg-indigo-900/60 px-4 py-2 rounded-xl border border-indigo-800/60 transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Open Manual Override</span>
          </button>
        </div>
      )}

      {/* Modals */}
      <ManualOverrideModal
        isOpen={isManualOverrideOpen}
        onClose={() => setIsManualOverrideOpen(false)}
        onKeyAdded={handleKeyAdded}
      />

      <RotateKeyModal
        keyItem={rotatingKey}
        isOpen={Boolean(rotatingKey)}
        onClose={() => setRotatingKey(null)}
        onKeyRotated={handleKeyUpdated}
      />

      <ImportEnvModal
        isOpen={isImportEnvOpen}
        onClose={() => setIsImportEnvOpen(false)}
        onKeysImported={(updated) => onKeysChange(updated)}
      />

      <ImportFromEnvironmentModal
        isOpen={isImportFromEnvModalOpen}
        onClose={() => setIsImportFromEnvModalOpen(false)}
        onKeysImported={(updated) => {
          onKeysChange(updated);
          scanServerEnv();
        }}
      />
    </div>
  );
};
