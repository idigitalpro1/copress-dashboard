import React, { useMemo, useState } from 'react';
import { Key, Loader2, SlidersHorizontal, Upload, AlertCircle } from 'lucide-react';
import { ProviderType, VaultKey } from '../../types';
import { api } from '../../services/api';
import { parseCredential, suggestProvider } from '../../services/intake';

interface Props {
  onKeyAdded: (key: VaultKey) => void;
  onOpenManualOverride: () => void;
  onOpenImportEnv?: () => void;
}

export const SmartIntakeLane: React.FC<Props> = ({ onKeyAdded, onOpenManualOverride, onOpenImportEnv }) => {
  const [input, setInput] = useState('');
  const [label, setLabel] = useState('');
  const [provider, setProvider] = useState<ProviderType | ''>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const credential = useMemo(() => { try { return parseCredential(input); } catch { return null; } }, [input]);
  const excludedSource = credential && /^(?:NEWSFLOW_|VAULT_|AWS_)/i.test(credential.envKey);

  const changed = (text: string) => {
    setInput(text);
    setError('');
    try {
      const parsed = parseCredential(text);
      const inferred = suggestProvider(parsed.envKey);
      setProvider(!parsed.ambiguous && inferred !== 'custom' ? inferred : '');
    } catch { setProvider(''); }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (excludedSource) { setError('Beta server configuration and AWS credentials are excluded from this key vault.'); return; }
    if (!credential || !provider) { setError('Paste one complete key and choose its provider.'); return; }
    setSaving(true);
    setError('');
    try {
      const result = await api.validateAndSaveKey({ rawKey: credential.value, providerHint: provider, label: label.trim() || undefined, sourceEnvVar: credential.envKey === 'CUSTOM_API_KEY' ? undefined : credential.envKey });
      onKeyAdded(result.key);
      setInput(''); setLabel(''); setProvider('');
    } catch (err) { setError(err instanceof Error ? err.message : 'The key could not be saved.'); }
    finally { setSaving(false); }
  };

  return <form onSubmit={save} className="p-5 rounded-2xl border border-slate-800 bg-slate-900 space-y-4">
    <div className="flex flex-col sm:flex-row justify-between gap-3">
      <div><h2 className="font-semibold flex items-center gap-2"><Key className="w-4 h-4 text-indigo-400" />New key card</h2><p className="text-xs text-slate-400 mt-1">Paste an entire key, NAME=value line, or one JSON key entry. Recognition runs locally; review the provider before saving.</p></div>
      <div className="flex gap-2 shrink-0">
        {onOpenImportEnv && <button type="button" onClick={onOpenImportEnv} className="px-3 py-2 rounded-xl text-xs bg-emerald-950/40 border border-emerald-800 text-emerald-200 flex items-center gap-1"><Upload className="w-3 h-3" />Import .env</button>}
        <button type="button" onClick={onOpenManualOverride} className="px-3 py-2 rounded-xl text-xs bg-slate-800 border border-slate-700 flex items-center gap-1"><SlidersHorizontal className="w-3 h-3" />Manual entry</button>
      </div>
    </div>
    <label htmlFor="new-key-secret" className="block text-xs text-slate-300">Complete API key or assignment</label>
    <input id="new-key-secret" name="new-key-secret" type="password" autoComplete="new-password" autoCapitalize="off" autoCorrect="off" spellCheck={false} value={input} onChange={event => changed(event.target.value)} disabled={saving} className="w-full p-3 bg-slate-950 border border-slate-700 rounded-xl font-mono text-sm" placeholder="Paste entire key or NAME=value" />
    {excludedSource && <p role="alert" className="text-xs text-amber-300">Beta server configuration and AWS credentials are excluded from this key vault.</p>}
    {credential && <p className="text-xs text-slate-400">{credential.evidence}. {credential.ambiguous ? 'Choose the intended provider explicitly.' : `Suggested: ${credential.name}.`} Source name: <span className="font-mono">{credential.envKey}</span></p>}
    <div className="grid sm:grid-cols-2 gap-3">
      <label className="block text-xs text-slate-300">Provider<select value={provider} onChange={event => setProvider(event.target.value as ProviderType)} disabled={saving} className="mt-1 block w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl"><option value="">Choose provider</option><option value="gemini">Google Gemini</option><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="custom">Other credential / custom</option></select></label>
      <label className="block text-xs text-slate-300">Card label (optional)<input value={label} onChange={event => setLabel(event.target.value)} disabled={saving} className="mt-1 w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl" placeholder="Newsroom key" /></label>
    </div>
    {error && <p role="alert" className="text-xs text-rose-300 flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</p>}
    <div className="flex justify-between gap-3 items-center"><p className="text-xs text-slate-400">Saved encrypted and untested. Test Connection is a separate action.</p><button type="submit" disabled={!credential || !provider || Boolean(excludedSource) || saving} className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm flex items-center gap-2">{saving && <Loader2 className="w-4 h-4 animate-spin" />}{saving ? 'Saving…' : 'Create card'}</button></div>
  </form>;
};
