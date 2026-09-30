import React from 'react';
import { ExternalLink } from 'lucide-react';

export const KEY_SETUP_LINKS = {
  gemini: { label: 'Google AI Studio', href: 'https://aistudio.google.com/apikey' },
  openai: { label: 'OpenAI API keys', href: 'https://platform.openai.com/api-keys' },
  anthropic: { label: 'Anthropic Console', href: 'https://console.anthropic.com/settings/keys' },
};

export function KeySetupLinks() {
  return <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs p-3 rounded-xl bg-slate-900 border border-slate-800"><span className="text-slate-400">Need an API key?</span>{Object.values(KEY_SETUP_LINKS).map(link => <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer" className="inline-flex gap-1 text-indigo-300 hover:underline">{link.label}<ExternalLink className="w-3 h-3" /></a>)}</div>;
}
