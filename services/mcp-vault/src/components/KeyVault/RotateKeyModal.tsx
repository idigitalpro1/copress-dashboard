import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { VaultKey } from '../../types';
import { api } from '../../services/api';

interface Props { keyItem: VaultKey | null; isOpen: boolean; onClose: () => void; onKeyRotated: (key: VaultKey) => void; }
export const RotateKeyModal: React.FC<Props> = ({ keyItem, isOpen, onClose, onKeyRotated }) => {
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const rotate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!keyItem) return;
    setBusy(true); setError('');
    try {
      const result = await api.rotateKey(keyItem.id, secret.trim());
      setSecret(''); onKeyRotated(result.key); onClose();
    } catch (err) { setError(err instanceof Error ? err.message : 'The key could not be rotated.'); }
    finally { setBusy(false); }
  };
  const close = () => { if (busy) return; setSecret(''); setError(''); onClose(); };
  if (!isOpen || !keyItem) return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"><form onSubmit={rotate} role="dialog" aria-modal="true" aria-labelledby="rotate-title" className="p-5 rounded-2xl w-full max-w-lg bg-slate-900 border border-slate-800 space-y-4">
    <div className="flex items-center justify-between"><h2 id="rotate-title" className="font-semibold">Rotate key card</h2><button type="button" onClick={close} disabled={busy} aria-label="Close rotation" className="p-2 rounded-lg hover:bg-slate-800"><X className="w-4 h-4" /></button></div>
    <p className="text-sm text-slate-300">{keyItem.label} · <code>{keyItem.maskedKey}</code></p>
    <label className="text-xs text-slate-300 block">Complete replacement API key<input type="password" autoComplete="new-password" autoCapitalize="off" autoCorrect="off" spellCheck={false} value={secret} onChange={event => setSecret(event.target.value)} disabled={busy} className="w-full p-3 mt-1 rounded-xl bg-slate-950 border border-slate-700 font-mono" /></label>
    <p className="text-xs text-slate-400">The replacement is encrypted and saved as untested. Choose Test Connection on its card to contact the provider.</p>
    {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
    <div className="flex justify-end gap-3"><button type="button" onClick={close} disabled={busy} className="p-2 text-xs">Cancel</button><button type="submit" disabled={busy || !secret.trim()} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl disabled:opacity-50 text-sm flex items-center gap-2">{busy && <Loader2 className="w-4 h-4 animate-spin" />}{busy ? 'Saving…' : 'Confirm rotation'}</button></div>
  </form></div>;
};
