/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { KeyVaultView } from './components/KeyVault/KeyVaultView';
import { PromptManagerView } from './components/PromptManager/PromptManagerView';
import { DualPaneSandbox } from './components/Sandbox/DualPaneSandbox';
import { SecurityLogsView } from './components/SecurityLogs/SecurityLogsView';
import { VaultKey, SystemPrompt } from './types';
import { api } from './services/api';
import { ShieldCheck, Sparkles, Key, AlertCircle, RefreshCw } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'vault' | 'prompts' | 'sandbox' | 'logs'>('vault');
  const [keys, setKeys] = useState<VaultKey[]>([]);
  const [prompts, setPrompts] = useState<SystemPrompt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sandboxSelectedPrompt, setSandboxSelectedPrompt] = useState<SystemPrompt | null>(null);
  const [envStatus, setEnvStatus] = useState<{
    hasEnvGeminiKey: boolean;
    hasMasterKey: boolean;
    encryptionAlgorithm: string;
  } | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [keysRes, promptsRes, envRes] = await Promise.all([
        api.getKeys(),
        api.getPrompts(),
        api.getEnvStatus().catch(() => null),
      ]);
      setKeys(keysRes.keys || []);
      setPrompts(promptsRes.prompts || []);
      if (envRes) setEnvStatus(envRes);
    } catch (err) {
      console.error('Failed to load application data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleTestPromptInSandbox = (prompt: SystemPrompt) => {
    setSandboxSelectedPrompt(prompt);
    setActiveTab('sandbox');
  };

  const activeKeysCount = keys.filter((k) => k.status === 'active').length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-900 selection:text-white">
      {/* Top Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        keyCount={keys.length}
        activeKeyCount={activeKeysCount}
        promptCount={prompts.length}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Security & System Architecture Status Banner */}
        <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-slate-900/90 via-slate-900/70 to-indigo-950/40 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold text-slate-200">
                  Zero-Plaintext Server Proxy Architecture Active
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-800/80 text-emerald-300">
                  AES-256-GCM
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Keys are validated exclusively via backend proxy ping routes and encrypted at rest before persistence.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3 text-xs text-slate-400 font-mono">
            {envStatus?.hasEnvGeminiKey && (
              <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-indigo-950/60 border border-indigo-800/60 text-indigo-300">
                <Sparkles className="w-3 h-3 text-indigo-400" />
                <span>AI Studio Key Connected</span>
              </span>
            )}
            <button
              onClick={loadData}
              title="Reload all state"
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Tab Views */}
        {isLoading ? (
          <div className="py-24 text-center">
            <div className="w-10 h-10 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs text-slate-400 font-mono">
              Loading NewsFlow Orchestrator Vault & Prompts...
            </p>
          </div>
        ) : (
          <>
            {activeTab === 'vault' && (
              <KeyVaultView
                keys={keys}
                onKeysChange={setKeys}
                onRefresh={loadData}
                onNavigateToLogs={() => setActiveTab('logs')}
              />
            )}

            {activeTab === 'prompts' && (
              <PromptManagerView
                prompts={prompts}
                keys={keys}
                onPromptsChange={setPrompts}
                onSelectPromptForSandbox={handleTestPromptInSandbox}
              />
            )}

            {activeTab === 'sandbox' && (
              <DualPaneSandbox
                prompts={prompts}
                keys={keys}
                initialSelectedPrompt={sandboxSelectedPrompt}
              />
            )}

            {activeTab === 'logs' && (
              <SecurityLogsView onRefreshKeys={loadData} />
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-slate-400">NewsFlow Orchestrator</span>
            <span>•</span>
            <span>Automated Newspaper Publishing Infrastructure</span>
          </div>
          <div className="font-mono text-[11px] text-slate-500">
            Encrypted with AES-256-GCM • Proxy Validation • Versioned Extraction Prompts
          </div>
        </div>
      </footer>
    </div>
  );
}
