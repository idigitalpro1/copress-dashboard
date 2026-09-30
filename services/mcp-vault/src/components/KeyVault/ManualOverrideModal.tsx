import React, { useState } from 'react';
import { X, Shield, Loader2 } from 'lucide-react';
import { ProviderType, VaultKey } from '../../types';
import { api } from '../../services/api';

interface Props { isOpen: boolean; onClose: () => void; onKeyAdded: (key: VaultKey) => void; }

export const ManualOverrideModal: React.FC<Props> = ({ isOpen, onClose, onKeyAdded }) => {
  const [provider, setProvider] = useState<ProviderType>('gemini');
  const [label, setLabel] = useState('');
  const [rawKey, setRawKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const result = await api.validateAndSaveKey({ rawKey: rawKey.trim(), providerHint: provider, label: label.trim() || undefined });
      setRawKey(''); onKeyAdded(result.key); onClose();
    } catch (err) { setError(err instanceof Error ? err.message : 'The key could not be saved.'); }
    finally { setBusy(false); }
  };
  const close = () => { if (busy) return; setRawKey(''); setError(''); onClose(); };
  if (!isOpen) return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"><form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="manual-title" className="p-5 rounded-2xl w-full max-w-lg bg-slate-900 border border-slate-800 space-y-4">
    <div className="flex items-center justify-between"><h2 id="manual-title" className="font-semibold">Create key card · Manual entry</h2><button type="button" aria-label="Close manual entry" onClick={close} disabled={busy} className="p-2 hover:bg-slate-800 rounded-lg"><X className="w-4 h-4" /></button></div>
    <label className="block text-xs text-slate-300">Provider<select value={provider} onChange={event => setProvider(event.target.value as ProviderType)} disabled={busy} className="block w-full mt-1 p-3 rounded-xl bg-slate-950 border border-slate-700"><option value="gemini">Google Gemini</option><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="custom">Other credential / custom</option></select></label>
    <label className="block text-xs text-slate-300">Card label (optional)<input value={label} onChange={event => setLabel(event.target.value)} disabled={busy} className="w-full p-3 mt-1 rounded-xl bg-slate-950 border border-slate-700" /></label>
    <label className="block text-xs text-slate-300">Complete API key<input type="password" autoComplete="new-password" autoCapitalize="off" autoCorrect="off" spellCheck={false} value={rawKey} onChange={event => setRawKey(event.target.value)} disabled={busy} className="w-full p-3 mt-1 rounded-xl bg-slate-950 border border-slate-700 font-mono" /></label>
    <p className="text-xs text-slate-400 flex items-start gap-2"><Shield className="w-4 h-4 shrink-0 text-emerald-400" />Saved encrypted and untested. Custom credentials can be stored; contacting arbitrary custom endpoints is disabled in this beta.</p>
    {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
    <div className="flex justify-end gap-3"><button type="button" onClick={close} disabled={busy} className="p-2 text-xs">Cancel</button><button type="submit" disabled={busy || !rawKey.trim()} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl disabled:opacity-50 text-sm flex items-center gap-2">{busy && <Loader2 className="w-4 h-4 animate-spin" />}{busy ? 'Saving…' : 'Create card'}</button></div>
  </form></div>;
};
