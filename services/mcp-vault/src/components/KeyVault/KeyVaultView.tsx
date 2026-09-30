import React, { useState } from 'react';
import { Shield, ShieldCheck, Key, Search, RefreshCw, Lock, PlusCircle, Upload } from 'lucide-react';
import { VaultKey } from '../../types';
import { SmartIntakeLane } from './SmartIntakeLane';
import { KeyCard } from './KeyCard';
import { ManualOverrideModal } from './ManualOverrideModal';
import { RotateKeyModal } from './RotateKeyModal';
import { ImportEnvModal } from './ImportEnvModal';
import { KeySetupLinks } from './KeySetupLinks';
import { formatTimestamp } from '../../services/time';

interface KeyVaultViewProps {
  keys: VaultKey[];
  onKeysChange: (keys: VaultKey[]) => void;
  onRefresh: () => void;
  onNavigateToLogs?: () => void;
}

export const KeyVaultView: React.FC<KeyVaultViewProps> = ({ keys, onKeysChange, onRefresh, onNavigateToLogs }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterProvider, setFilterProvider] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [isManualOverrideOpen, setIsManualOverrideOpen] = useState(false);
  const [isImportEnvOpen, setIsImportEnvOpen] = useState(false);
  const [rotatingKey, setRotatingKey] = useState<VaultKey | null>(null);
  const [completed, setCompleted] = useState<string | null>(null);
  const added = (key: VaultKey) => {
    onKeysChange([key, ...keys.filter(item => item.id !== key.id)]);
    setCompleted(`Card saved at ${formatTimestamp(key.updatedAt || key.createdAt)}. Status: ${key.status}.`);
  };
  const updated = (key: VaultKey) => {
    onKeysChange(keys.map(item => item.id === key.id ? key : { ...item, isDefault: key.isDefault ? false : item.isDefault }));
    setCompleted(`Card updated at ${formatTimestamp(key.updatedAt)}. Status: ${key.status}.`);
  };
  const filteredKeys = keys.filter(key =>
    [key.label, key.maskedKey, key.provider, key.envVarName || key.sourceEnvVar || ''].some(value => value.toLowerCase().includes(searchQuery.toLowerCase())) &&
    (filterProvider === 'all' || key.provider === filterProvider) &&
    (filterStatus === 'all' || key.status === filterStatus));

  return <div className="space-y-6">
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[{ value: keys.length, label: 'Vault cards', Icon: Key }, { value: keys.filter(key => key.status === 'active').length, label: 'Tested active', Icon: ShieldCheck }, { value: keys.filter(key => key.status === 'untested').length, label: 'Untested', Icon: Shield }, { value: 'AES-256-GCM', label: 'Encrypted at rest', Icon: Lock }].map(({ value, label, Icon }) => <div key={label} className="p-4 flex items-center gap-3 rounded-2xl bg-slate-900 border border-slate-800"><Icon className="w-5 h-5 text-indigo-400" /><div><div className="font-semibold text-slate-100">{value}</div><div className="text-xs text-slate-400">{label}</div></div></div>)}
    </div>
    <KeySetupLinks />
    {completed && <p role="status" className="p-3 rounded-xl bg-emerald-950/40 text-emerald-200 text-xs border border-emerald-800">{completed}</p>}
    <SmartIntakeLane onKeyAdded={added} onOpenManualOverride={() => setIsManualOverrideOpen(true)} onOpenImportEnv={() => setIsImportEnvOpen(true)} />
    <div className="flex flex-col sm:flex-row gap-3 justify-between">
      <label className="relative flex-1 max-w-md"><Search className="w-4 h-4 text-slate-400 absolute top-3 left-3" /><span className="sr-only">Search vault keys</span><input value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="Search card label, source name, or provider" className="w-full pl-9 p-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs" /></label>
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={() => setIsImportEnvOpen(true)} className="flex gap-1.5 items-center px-3 py-2 bg-emerald-950/50 border border-emerald-800 rounded-xl text-xs text-emerald-200"><Upload className="w-4 h-4" />Import .env file</button>
        {onNavigateToLogs && <button type="button" onClick={onNavigateToLogs} className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs">Audit logs</button>}
        <label className="sr-only" htmlFor="provider-filter">Filter by provider</label><select id="provider-filter" value={filterProvider} onChange={event => setFilterProvider(event.target.value)} className="p-2 bg-slate-900 border border-slate-800 rounded-xl text-xs"><option value="all">All providers</option><option value="gemini">Gemini</option><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="custom">Custom</option></select>
        <label className="sr-only" htmlFor="status-filter">Filter by status</label><select id="status-filter" value={filterStatus} onChange={event => setFilterStatus(event.target.value)} className="p-2 bg-slate-900 border border-slate-800 rounded-xl text-xs"><option value="all">All statuses</option><option value="untested">Untested</option><option value="active">Active</option><option value="invalid">Invalid</option><option value="revoked">Revoked</option></select>
        <button type="button" onClick={onRefresh} aria-label="Refresh vault cards" className="p-2 bg-slate-900 border border-slate-800 rounded-xl"><RefreshCw className="w-4 h-4" /></button>
      </div>
    </div>
    {filteredKeys.length ? <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{filteredKeys.map(key => <KeyCard key={key.id} keyItem={key} onUpdate={updated} onDelete={id => onKeysChange(keys.filter(item => item.id !== id))} onRotateClick={setRotatingKey} />)}</div> : <div className="text-center py-12 rounded-2xl border border-dashed border-slate-800 bg-slate-900/40"><Key className="w-8 h-8 mx-auto mb-3 text-indigo-400" /><p className="text-sm text-slate-300">No matching key cards</p><button type="button" onClick={() => setIsManualOverrideOpen(true)} className="inline-flex gap-2 items-center text-xs text-indigo-300 mt-4"><PlusCircle className="w-4 h-4" />Create a key card</button></div>}
    {isManualOverrideOpen && <ManualOverrideModal isOpen onClose={() => setIsManualOverrideOpen(false)} onKeyAdded={added} />}
    {rotatingKey && <RotateKeyModal keyItem={rotatingKey} isOpen onClose={() => setRotatingKey(null)} onKeyRotated={updated} />}
    {isImportEnvOpen && <ImportEnvModal isOpen onClose={() => setIsImportEnvOpen(false)} onKeysImported={updatedKeys => { onKeysChange(updatedKeys); setCompleted(`Import completed at ${formatTimestamp(new Date().toISOString())}. Imported cards remain untested.`); }} />}
  </div>;
};
