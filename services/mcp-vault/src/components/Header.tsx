import React from 'react';
import { ShieldCheck, Key, FileCode, Play, Lock, Terminal, Shield } from 'lucide-react';

interface HeaderProps {
  activeTab: 'vault' | 'prompts' | 'sandbox' | 'logs';
  setActiveTab: (tab: 'vault' | 'prompts' | 'sandbox' | 'logs') => void;
  keyCount: number;
  activeKeyCount: number;
  promptCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  keyCount,
  activeKeyCount,
  promptCount,
}) => {
  return (
    <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Headline */}
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 via-purple-600 to-sky-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white font-bold tracking-wider text-sm">
              NF
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-slate-100 tracking-tight text-base sm:text-lg">
                  NewsFlow Orchestrator
                </span>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700/60">
                  SATCOM beta
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Newsroom prompts and secure API key management
              </p>
            </div>
          </div>

          {/* Nav Tabs */}
          <nav className="flex space-x-1 sm:space-x-2 bg-slate-900 p-1 rounded-xl border border-slate-800/80">
            <button
              onClick={() => setActiveTab('vault')}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                activeTab === 'vault'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Key className="w-3.5 h-3.5" />
              <span>Key Vault</span>
              <span
                className={`ml-1 text-[11px] px-1.5 py-0.2 rounded-full ${
                  activeTab === 'vault'
                    ? 'bg-indigo-700/80 text-white'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                {activeKeyCount}/{keyCount}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('prompts')}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                activeTab === 'prompts'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>Prompt Manager</span>
              <span
                className={`ml-1 text-[11px] px-1.5 py-0.2 rounded-full ${
                  activeTab === 'prompts'
                    ? 'bg-indigo-700/80 text-white'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                {promptCount}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('sandbox')}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                activeTab === 'sandbox'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Dual-Pane Sandbox</span>
            </button>

            <button
              onClick={() => setActiveTab('logs')}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                activeTab === 'logs'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Security Logs</span>
            </button>
          </nav>

          {/* Security Badge */}
          <div className="hidden lg:flex items-center space-x-2 text-xs text-slate-300 bg-emerald-950/40 border border-emerald-800/50 px-3 py-1.5 rounded-full">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="font-medium text-emerald-300">AES-256-GCM Vault</span>
            <span className="text-[10px] text-emerald-500/80 uppercase font-mono">Authenticated</span>
          </div>
        </div>
      </div>
    </header>
  );
};
