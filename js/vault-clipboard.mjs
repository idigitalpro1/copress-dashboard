// Local-only credential recognition. Never executes input or calls a provider.
const providers = [
  ['OpenAI', 'ai', 'OPENAI_API_KEY', /^sk-proj-/],
  ['Anthropic', 'ai', 'ANTHROPIC_API_KEY', /^sk-ant-/],
  ['xAI / Grok', 'ai', 'XAI_API_KEY', /^xai-/],
  ['Stripe', 'payments', 'STRIPE_SECRET_KEY', /^sk_(live|test)_/],
  ['Stripe', 'payments', 'STRIPE_PUB_KEY', /^pk_(live|test)_/],
  ['Stripe', 'payments', 'STRIPE_RESTRICTED_KEY', /^rk_(live|test)_/],
  ['Stripe', 'payments', 'STRIPE_WEBHOOK_SECRET', /^whsec_/],
  ['Apify', 'scraping', 'APIFY_API_TOKEN', /^apify_api_/],
  ['GitHub', 'infra', 'GITHUB_TOKEN', /^(gh[pousr]_|github_pat_)/],
  ['Supabase', 'data', 'SUPABASE_SERVICE_KEY', /^sb_secret_/],
  ['Supabase', 'data', 'SUPABASE_ANON_KEY', /^sb_publishable_/],
];
const labels = {
  OPENAI_API_KEY: ['OpenAI', 'ai'], ANTHROPIC_API_KEY: ['Anthropic', 'ai'],
  XAI_API_KEY: ['xAI / Grok', 'ai'], GOOGLE_AGENT_API_KEY: ['Aiace / Gemini', 'ai'],
  GEMINI_KEY_COPY: ['Gemini / Studio copy', 'ai'],
  GEMINI_KEY_VIDEO: ['Gemini / video server', 'ai'],
  GEMINI_KEY_HEALTH: ['Gemini / health server', 'ai'],
  GOOGLE_PLACES_KEY: ['Google Places', 'maps'], GOOGLE_API_KEY: ['Google API key', 'infra'],
  APIFY_API_TOKEN: ['Apify', 'scraping'], AIRTABLE_API_KEY: ['Airtable', 'data'],
  SUPABASE_ANON_KEY: ['Supabase', 'data'], SUPABASE_SERVICE_KEY: ['Supabase', 'data'],
  STRIPE_SECRET_KEY: ['Stripe', 'payments'], STRIPE_PUB_KEY: ['Stripe', 'payments'],
  STRIPE_RESTRICTED_KEY: ['Stripe', 'payments'], STRIPE_WEBHOOK_SECRET: ['Stripe', 'payments'],
  SENDY_API_KEY: ['Sendy', 'comms'], TWILIO_TOKEN: ['Twilio', 'comms'],
  CF_API_TOKEN: ['Cloudflare', 'infra'], VERCEL_TOKEN: ['Vercel', 'infra'],
  MAPBOX_TOKEN: ['Mapbox', 'maps'], GITHUB_TOKEN: ['GitHub', 'infra'],
};
const aliases = {
  GEMINI_API_KEY: 'GOOGLE_AGENT_API_KEY', GOOGLE_GENERATIVE_AI_API_KEY: 'GOOGLE_AGENT_API_KEY',
  GOOGLE_PLACES_API_KEY: 'GOOGLE_PLACES_KEY', X_AI_API_KEY: 'XAI_API_KEY',
  GROK_API_KEY: 'XAI_API_KEY', STRIPE_PUBLISHABLE_KEY: 'STRIPE_PUB_KEY',
  SUPABASE_SERVICE_ROLE_KEY: 'SUPABASE_SERVICE_KEY', CLOUDFLARE_API_TOKEN: 'CF_API_TOKEN',
  TWILIO_AUTH_TOKEN: 'TWILIO_TOKEN', APIFY_TOKEN: 'APIFY_API_TOKEN',
};
const invalid = () => new Error('Paste one complete API key, NAME=value line, or JSON key entry.');

export function parseCredential(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Your clipboard is empty. Copy an API key first.');
  if (text.length > 16384) throw new Error('This clipboard item is too large. Copy only the API key.');
  let value = text.trim();
  let envKey;
  if (value.startsWith('{')) {
    let item;
    try { item = JSON.parse(value); } catch { throw invalid(); }
    const entries = Object.entries(item);
    if (entries.length !== 1 || typeof entries[0][1] !== 'string') throw invalid();
    [envKey, value] = entries[0];
    if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(envKey)) throw invalid();
  } else {
    if (/[\r\n]/.test(value)) throw invalid();
    const assignment = value.match(/^(?:export\s+)?([A-Z][A-Z0-9_]{1,63})\s*=\s*(.*)$/);
    if (assignment) { envKey = assignment[1]; value = assignment[2]; }
    else value = value.replace(/^(?:Authorization:\s*)?Bearer\s+/i, '');
    if (/^["']/.test(value)) {
      if (value.at(-1) !== value[0]) throw invalid();
      value = value.slice(1, -1);
    }
  }
  if (value.length < 8 || /[\s<>"'`]/.test(value) || /^(https?:|curl\b)/i.test(value)) throw invalid();
  if (envKey) {
    envKey = aliases[envKey] || envKey;
    const label = labels[envKey];
    const format = providers.find(p => p[3].test(value));
    const conflict = Boolean(format && format[2] !== envKey);
    // Arbitrary labels stay metadata-only and are never evaluated or sent anywhere.
    return { name: label?.[0] || 'Imported API key', cat: label?.[1] || 'infra', envKey, value, ambiguous: conflict || !label || envKey === 'GOOGLE_API_KEY', evidence: conflict ? 'The label and key format suggest different services' : envKey === 'GOOGLE_API_KEY' ? 'Google key; choose its intended service' : 'Environment label' };
  }
  const provider = providers.find(p => p[3].test(value));
  if (provider) return { name: provider[0], cat: provider[1], envKey: provider[2], value, ambiguous: false, evidence: 'Key format' };
  if (/^AIza/.test(value)) return { name: 'Google API key', cat: 'infra', envKey: 'GOOGLE_API_KEY', value, ambiguous: true, evidence: 'Google key; choose its intended service' };
  return { name: 'Imported API key', cat: 'infra', envKey: 'CUSTOM_API_KEY', value, ambiguous: true, evidence: 'Provider cannot be determined from this key alone' };
}

export function planCredentialImport(apis, credential, id, savedAt = new Date().toISOString()) {
  const duplicate = apis.find(api => api.values?.[credential.envKey] === credential.value);
  if (duplicate) return { apis, id: duplicate.id, duplicate: true };
  const target = apis.find(api => api.fields.some(f => f.key === credential.envKey) && !api.values?.[credential.envKey]);
  if (target) return {
    apis: apis.map(api => api === target ? { ...api, values: { ...api.values, [credential.envKey]: credential.value }, savedAt } : api),
    id: target.id, duplicate: false,
  };
  const existing = apis.some(api => api.fields.some(f => f.key === credential.envKey) && api.values?.[credential.envKey]);
  const card = {
    id, name: credential.name + (existing ? ' — additional key' : ''), cat: credential.cat,
    icon: '🔑', color: '#888', desc: 'Saved on this browser. Provider connection has not been tested.',
    fields: [{ label: 'API Key / Token', key: credential.envKey, ph: 'API key' }],
    required: 'optional', inject: [], values: { [credential.envKey]: credential.value },
    custom: true, clipboardImported: true, savedAt,
  };
  return { apis: [...apis, card], id, duplicate: false };
}
