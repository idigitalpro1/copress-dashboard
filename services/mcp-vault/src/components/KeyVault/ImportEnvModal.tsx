import React, { useEffect, useRef, useState } from 'react';
import { X, Upload, Shield, Loader2, CheckCircle } from 'lucide-react';
import { ProviderType, VaultKey } from '../../types';
import { api } from '../../services/api';
import { parseEnvFile, maskSecret, suggestProvider } from '../../services/intake';
import { formatTimestamp } from '../../services/time';

interface Props { isOpen: boolean; onClose: () => void; onKeysImported: (keys: VaultKey[]) => void; }
interface ReviewedEntry { line: number; sourceKey: string; value: string; maskedKey: string; provider: ProviderType | ''; selected: boolean; ambiguous: boolean; }

export const ImportEnvModal: React.FC<Props> = ({ isOpen, onClose, onKeysImported }) => {
  const [rawText, setRawText] = useState('');
  const [entries, setEntries] = useState<ReviewedEntry[]>([]);
  const [issues, setIssues] = useState<{ line: number; message: string }[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ envVarName: string; maskedKey: string; status: string }[]>([]);
  const generation = useRef(0);
  const closeButton = useRef<HTMLButtonElement>(null);
  const busyRef = useRef(busy);
  const close = () => {
    if (busyRef.current) return;
    generation.current++;
    setRawText(''); setEntries([]); setIssues([]); setSummary([]); setError('');
    onClose();
  };
  const closeRef = useRef(close);
  busyRef.current = busy;
  closeRef.current = close;

  useEffect(() => {
    closeButton.current?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busyRef.current) closeRef.current(); };
    document.addEventListener('keydown', escape);
    return () => { generation.current++; document.removeEventListener('keydown', escape); };
  }, []);

  const preview = (text: string) => {
    const parsed = parseEnvFile(text);
    const excluded = parsed.entries.filter(entry => /^(?:NEWSFLOW_|VAULT_|AWS_)/i.test(entry.sourceKey));
    const supported = parsed.entries.filter(entry => !/^(?:NEWSFLOW_|VAULT_|AWS_)/i.test(entry.sourceKey));
    setEntries(supported.map(entry => {
      const provider = suggestProvider(entry.credential.envKey);
      const ambiguous = entry.credential.ambiguous || provider === 'custom';
      return { line: entry.line, sourceKey: entry.sourceKey, value: entry.credential.value, maskedKey: maskSecret(entry.credential.value), provider: ambiguous ? '' : provider, selected: !ambiguous, ambiguous };
    }));
    setIssues([...parsed.issues, ...excluded.map(entry => ({ line: entry.line, message: 'Beta server configuration and AWS credentials are excluded from this vault import.' }))]);
    setSkipped(parsed.skipped + excluded.length);
    setReviewed(true);
    setRawText('');
    setCompleted(null);
    setSummary([]);
    setError('');
  };

  const readFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 256 * 1024) { setError('Choose a file no larger than 256 KiB.'); return; }
    const current = ++generation.current;
    setBusy(true); setError('');
    try {
      const text = await file.text();
      if (current === generation.current) preview(text);
    } catch { if (current === generation.current) setError('The file could not be read. Choose a UTF-8 text file.'); }
    finally { if (current === generation.current) setBusy(false); }
  };

  const importSelected = async () => {
    const selected = entries.filter(entry => entry.selected);
    if (!selected.length || selected.some(entry => !entry.provider)) { setError('Select at least one entry and choose a provider for every selected entry.'); return; }
    const current = ++generation.current;
    setBusy(true); setError('');
    try {
      const result = await api.importKeysFromEnv(selected.map(entry => ({ envVarName: entry.sourceKey, value: entry.value, provider: entry.provider })));
      if (current !== generation.current) return;
      onKeysImported(result.keys);
      setSummary(result.importResult.imported);
      setCompleted(formatTimestamp(new Date().toISOString()));
      setEntries([]);
      setRawText('');
      setReviewed(false);
    } catch (err) { if (current === generation.current) setError(err instanceof Error ? err.message : 'The selected keys could not be imported.'); }
    finally { if (current === generation.current) setBusy(false); }
  };

  if (!isOpen) return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
    <section role="dialog" aria-modal="true" aria-labelledby="env-import-title" className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-xl flex flex-col max-h-[90vh]">
      <div className="p-5 border-b border-slate-800 flex items-start justify-between gap-3"><div><h2 id="env-import-title" className="font-semibold">Secure .env import</h2><p className="text-xs text-slate-400 mt-1">Preview locally, resolve providers, then import only the selected credentials into this beta vault.</p></div><button ref={closeButton} type="button" onClick={close} disabled={busy} aria-label="Close import" className="p-1.5 rounded-lg hover:bg-slate-800 disabled:opacity-50"><X className="w-4 h-4" /></button></div>
      <div className="p-5 space-y-4 overflow-y-auto">
        <p className="text-xs text-slate-400 flex gap-2"><Shield className="w-4 h-4 text-emerald-400 shrink-0" />File contents stay in page memory during review. Confirmed entries are sent to the authenticated server and encrypted as untested cards. No server environment is scanned.</p>
        <label className="flex items-center justify-center gap-2 p-3 rounded-xl border border-emerald-800 text-sm text-emerald-200 bg-emerald-950/40 cursor-pointer"><Upload className="w-4 h-4" />Choose .env text file<input type="file" accept=".env,.txt,text/plain" onChange={readFile} disabled={busy} className="sr-only" /></label>
        {!reviewed && !completed && <><label htmlFor="raw-env" className="text-xs text-slate-300 block">Or paste .env contents for masked local review</label><input id="raw-env" type="password" value={rawText} onChange={event => setRawText(event.target.value)} onPaste={event => { event.preventDefault(); preview(event.clipboardData.getData('text')); }} disabled={busy} autoComplete="new-password" autoCapitalize="off" autoCorrect="off" spellCheck={false} className="w-full p-3 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono" placeholder="Paste .env contents — preview stays masked" /><button type="button" onClick={() => preview(rawText)} disabled={!rawText.trim() || busy} className="px-4 py-2 bg-slate-800 rounded-xl text-xs disabled:opacity-50">Preview locally</button></>}
        {reviewed && <>
          <p className="text-xs text-slate-300">{entries.length} credentials found · {skipped} empty or configuration entries skipped. Duplicate names and unsupported syntax are excluded.</p>
          <div className="space-y-2">{entries.map(entry => <div key={entry.sourceKey} className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            <label className="flex items-center justify-between gap-2 text-xs"><span className="flex items-center gap-2"><input type="checkbox" checked={entry.selected} onChange={event => setEntries(previous => previous.map(item => item.sourceKey === entry.sourceKey ? { ...item, selected: event.target.checked } : item))} disabled={busy} /><span className="font-mono break-all">{entry.sourceKey}</span></span><code className="text-slate-400 shrink-0">{entry.maskedKey}</code></label>
            <label className="text-xs text-slate-400 flex gap-2 items-center">Provider<select value={entry.provider} disabled={busy} onChange={event => setEntries(previous => previous.map(item => item.sourceKey === entry.sourceKey ? { ...item, provider: event.target.value as ProviderType, selected: true } : item))} className="flex-1 p-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200"><option value="">Choose provider explicitly</option><option value="gemini">Google Gemini</option><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="custom">Other credential / custom</option></select></label>
            {entry.ambiguous && <p className="text-[11px] text-amber-300">The label or format needs your review. Choose its intended provider before selecting.</p>}
          </div>)}</div>
        </>}
        {issues.length > 0 && <div className="text-xs text-amber-300 space-y-1">{issues.map((issue, index) => <p key={index}>{issue.line ? `Line ${issue.line}: ` : ''}{issue.message}</p>)}</div>}
        {error && <p role="alert" className="p-3 rounded-xl text-xs bg-rose-950/40 border border-rose-800 text-rose-200">{error}</p>}
        {completed && <div role="status" className="p-3 rounded-xl border border-emerald-800 bg-emerald-950/40 text-xs space-y-2"><p className="flex gap-2 text-emerald-200"><CheckCircle className="w-4 h-4" />Import completed at {completed}. {summary.length} cards saved.</p>{summary.map(item => <p key={item.envVarName} className="font-mono text-slate-300">{item.envVarName} · {item.maskedKey} · {item.status}</p>)}</div>}
      </div>
      <div className="p-4 border-t border-slate-800 flex justify-between gap-3 items-center"><button type="button" onClick={close} disabled={busy} className="text-xs text-slate-300 px-3 py-2 rounded-lg hover:bg-slate-800 disabled:opacity-50">{completed ? 'Done' : 'Cancel'}</button>{reviewed && <button type="button" onClick={importSelected} disabled={busy || !entries.some(entry => entry.selected) || entries.some(entry => entry.selected && !entry.provider)} className="px-4 py-2 rounded-xl text-sm bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 flex gap-2 items-center">{busy && <Loader2 className="w-4 h-4 animate-spin" />}{busy ? 'Saving…' : `Confirm import (${entries.filter(entry => entry.selected).length})`}</button>}</div>
    </section>
  </div>;
};
