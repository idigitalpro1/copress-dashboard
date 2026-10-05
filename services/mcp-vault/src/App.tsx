/** @license SPDX-License-Identifier: Apache-2.0 */
import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { KeyVaultView } from './components/KeyVault/KeyVaultView';
import { PromptManagerView } from './components/PromptManager/PromptManagerView';
import { DualPaneSandbox } from './components/Sandbox/DualPaneSandbox';
import { SecurityLogsView } from './components/SecurityLogs/SecurityLogsView';
import { VaultKey, SystemPrompt } from './types';
import { api, setAccessToken, clearAccessToken, onAuthenticationFailure, touchAccessToken } from './services/api';
import { ShieldCheck, Lock, AlertCircle, RefreshCw, LogOut } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'vault' | 'prompts' | 'sandbox' | 'logs'>('vault');
  const [keys, setKeys] = useState<VaultKey[]>([]);
  const [prompts, setPrompts] = useState<SystemPrompt[]>([]);
  const [connected, setConnected] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [sandboxSelectedPrompt, setSandboxSelectedPrompt] = useState<SystemPrompt | null>(null);
  const connectionEpoch = useRef(0);
  const [envStatus, setEnvStatus] = useState<{ hasMasterKey: boolean; encryptionAlgorithm: string; executionEnabled: boolean } | null>(null);

  const resetConnection = () => {
    connectionEpoch.current++;
    clearAccessToken();
    setIsLoading(false);
    setActiveTab('vault');
    setConnected(false);
    setTokenInput('');
    setKeys([]);
    setPrompts([]);
    setSandboxSelectedPrompt(null);
    setEnvStatus(null);
  };

  useEffect(() => {
    const unsubscribe = onAuthenticationFailure(reason => {
      resetConnection();
      setError(reason === 'expired' ? 'The beta session expired after 15 minutes without interaction. Enter the access token to reconnect.' : 'The access token was rejected. Enter the beta token again.');
    });
    const activity = () => touchAccessToken();
    const leaving = () => resetConnection();
    document.addEventListener('pointerdown', activity, { passive: true });
    document.addEventListener('keydown', activity);
    document.addEventListener('wheel', activity, { passive: true });
    document.addEventListener('touchstart', activity, { passive: true });
    window.addEventListener('pagehide', leaving);
    return () => {
      unsubscribe();
      connectionEpoch.current++;
      clearAccessToken();
      document.removeEventListener('pointerdown', activity);
      document.removeEventListener('keydown', activity);
      document.removeEventListener('wheel', activity);
      document.removeEventListener('touchstart', activity);
      window.removeEventListener('pagehide', leaving);
    };
  }, []);

  const loadData = async () => {
    const requestEpoch = connectionEpoch.current;
    setIsLoading(true);
    setError('');
    try {
      const [keysRes, promptsRes, envRes] = await Promise.all([
        api.getKeys(), api.getPrompts(), api.getEnvStatus(),
      ]);
      if (requestEpoch !== connectionEpoch.current) return;
      setKeys(keysRes.keys || []);
      setPrompts(promptsRes.prompts || []);
      setEnvStatus(envRes);
      setConnected(true);
    } catch (err) {
      if (requestEpoch !== connectionEpoch.current) return;
      resetConnection();
      setError(err instanceof Error ? err.message : 'Unable to connect to the beta vault.');
    } finally {
      if (requestEpoch === connectionEpoch.current) setIsLoading(false);
    }
  };

  const connect = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setAccessToken(tokenInput);
      connectionEpoch.current++;
      setTokenInput('');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enter the beta access token.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {connected && <Header activeTab={activeTab} setActiveTab={setActiveTab} keyCount={keys.length} activeKeyCount={keys.filter(key => key.status === 'active').length} promptCount={prompts.length} />}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6 p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-indigo-400 shrink-0 mt-1" />
            <div>
              <h1 className="font-semibold text-slate-100">SATCOM · NewsFlow Beta</h1>
              <p className="text-xs text-slate-400 mt-1">This authenticated server vault saves keys with AES-256-GCM encryption. Saving creates an untested card; use Test Connection when you choose to contact its provider.</p>
              <p className="text-xs text-slate-400 mt-1">Your <a href="/apikeys" className="text-indigo-300 underline">SATCOM browser key cards</a> are a separate store. Keys are never copied from them automatically.</p>
            </div>
          </div>
          {connected && <div className="flex gap-2 shrink-0">
            <button type="button" onClick={loadData} disabled={isLoading} aria-label="Refresh beta data" className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700"><RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /></button>
            <button type="button" onClick={resetConnection} className="flex items-center gap-2 text-xs p-2 rounded-lg bg-slate-800 hover:bg-slate-700"><LogOut className="w-4 h-4" />Disconnect</button>
          </div>}
        </div>
        {error && <p role="alert" className="mb-4 p-3 rounded-xl text-sm bg-rose-950/40 border border-rose-800 text-rose-200 flex gap-2"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}</p>}
        {!connected ? <form onSubmit={connect} className="max-w-lg mx-auto my-12 p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <Lock className="w-8 h-8 text-indigo-400" />
          <h2 className="text-lg font-semibold">Connect to the beta vault</h2>
          <p className="text-sm text-slate-400">Enter the access token configured for this beta server. It stays in memory for this page and is cleared when you disconnect, leave, refresh, or stop interacting for 15 minutes.</p>
          <label htmlFor="newsflow-token" className="block text-sm text-slate-300">Beta access token</label>
          <input id="newsflow-token" name="newsflow-token" type="password" autoComplete="current-password" autoCapitalize="off" autoCorrect="off" spellCheck={false} value={tokenInput} onChange={event => setTokenInput(event.target.value)} disabled={isLoading} className="w-full p-3 rounded-xl bg-slate-950 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <button type="submit" disabled={!tokenInput.trim() || isLoading} className="w-full p-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 font-medium">{isLoading ? 'Connecting…' : 'Connect'}</button>
          <a href="/" className="inline-block text-xs underline text-slate-400">Return to SATCOM</a>
        </form> : isLoading ? <p className="py-20 text-center text-slate-400">Loading beta vault and prompts…</p> : <>
          {activeTab === 'vault' && <KeyVaultView keys={keys} onKeysChange={setKeys} onRefresh={loadData} onNavigateToLogs={() => setActiveTab('logs')} />}
          {activeTab === 'prompts' && <PromptManagerView prompts={prompts} keys={keys} onPromptsChange={setPrompts} onSelectPromptForSandbox={prompt => { setSandboxSelectedPrompt(prompt); setActiveTab('sandbox'); }} />}
          {activeTab === 'sandbox' && <DualPaneSandbox prompts={prompts} keys={keys} initialSelectedPrompt={sandboxSelectedPrompt} executionEnabled={envStatus?.executionEnabled === true} />}
          {activeTab === 'logs' && <SecurityLogsView onRefreshKeys={loadData} />}
        </>}
      </main>
      <footer className="border-t border-slate-900 py-4 text-center text-xs text-slate-500">NewsFlow beta · Encrypted server vault · Versioned prompts · Provider calls require explicit actions</footer>
    </div>
  );
}
