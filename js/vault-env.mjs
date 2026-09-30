import { parseCredential, planCredentialImport } from './vault-clipboard.mjs';

const MAX_FILE_BYTES = 256 * 1024;
const MAX_CREDENTIALS = 200;
const MAX_DIAGNOSTICS = 100;
const credentialName = /(?:KEY|TOKEN|SECRET|PASSWORD)$/i;
const forbiddenNames = new Set(['__proto__', 'constructor', 'prototype']);
const supportedCredentialName = /^[A-Z][A-Z0-9_]{1,63}$/;

function closingQuote(text, quote, start = 0) {
  let escaped = false;
  for (let index = start; index < text.length; index++) {
    const character = text[index];
    if (character === quote && !escaped) return index;
    escaped = character === '\\' && !escaped;
    if (character !== '\\') escaped = false;
  }
  return -1;
}

function continuesLine(text) {
  return ((text.match(/\\+$/)?.[0].length || 0) % 2) === 1;
}

// No interpolation, command execution, escape decoding, or provider requests.
// An unclosed quoted assignment suppresses its continuation lines so that text
// inside a rejected multiline value cannot become another imported credential.
export function parseEnvFile(text) {
  const entries = [];
  const issues = [];
  let skipped = 0;
  const result = () => ({ entries, skipped, issues });
  if (typeof text !== 'string') {
    issues.push({ line: 0, message: 'Choose a plain-text environment file.' });
    return result();
  }
  if (new TextEncoder().encode(text).byteLength > MAX_FILE_BYTES) {
    issues.push({ line: 0, message: 'The file exceeds the 256 KiB limit. Choose a smaller file.' });
    return result();
  }

  const seen = new Set();
  const duplicates = new Set();
  let continuationQuote = null;
  let continuationLine = false;
  let limitReported = false;
  const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);
  const issue = (line, message) => {
    if (issues.length < MAX_DIAGNOSTICS) issues.push({ line, message });
    else if (issues.length === MAX_DIAGNOSTICS) {
      issues.push({ line, message: 'Additional issues omitted. Review a smaller file to see the remaining issues.' });
    }
  };

  for (let index = 0; index < lines.length; index++) {
    const line = index + 1;
    const source = lines[index];
    if (continuationLine) {
      continuationLine = continuesLine(source.trimEnd());
      continue;
    }
    if (continuationQuote) {
      if (closingQuote(source, continuationQuote) !== -1) continuationQuote = null;
      continue;
    }
    const trimmed = source.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const assignment = source.match(/^\s*(?:export[ \t]+)?([A-Za-z_][A-Za-z0-9_]*)[ \t]*=[ \t]*(.*)$/);
    if (!assignment) {
      issue(line, 'Invalid assignment. Use one NAME=value entry per line.');
      continue;
    }

    const sourceKey = assignment[1];
    let value = assignment[2];
    let invalidValue = false;
    if (/^["']/.test(value)) {
      const quote = value[0];
      const end = closingQuote(value, quote, 1);
      if (end === -1) {
        issue(line, 'Multiline or unclosed quoted values are not supported.');
        continuationQuote = quote;
        invalidValue = true;
      } else {
        const tail = value.slice(end + 1).trim();
        if (tail && !tail.startsWith('#')) {
          issue(line, 'Unexpected text after a quoted value.');
          invalidValue = true;
        }
        value = value.slice(1, end);
      }
    } else {
      // Only whitespace-delimited comments are removed. Embedded # is data.
      value = value.startsWith('#') ? '' : value.replace(/[ \t]+#.*$/, '').trim();
      if (continuesLine(value)) {
        issue(line, 'Multiline continuation values are not supported.');
        continuationLine = true;
        invalidValue = true;
      }
    }

    if (forbiddenNames.has(sourceKey.toLowerCase())) {
      issue(line, 'This environment name is not allowed.');
      continue;
    }
    if (seen.has(sourceKey)) {
      duplicates.add(sourceKey);
      const first = entries.findIndex(entry => entry.sourceKey === sourceKey);
      if (first !== -1) entries.splice(first, 1);
      issue(line, 'Duplicate environment name. Every occurrence of this name is excluded.');
      continue;
    }
    seen.add(sourceKey);
    if (invalidValue) continue;
    if (!credentialName.test(sourceKey) || value === '') {
      skipped++;
      continue;
    }
    if (!supportedCredentialName.test(sourceKey)) {
      issue(line, 'Credential names must use 2–64 uppercase letters, digits, or underscores, starting with a letter.');
      continue;
    }
    if (/[\u0000-\u001f\u007f]/.test(value)) {
      issue(line, 'Control characters are not supported in credential values.');
      continue;
    }
    if (/[$`]|[;|<>]|&&/.test(value) || /^(?:eval|exec|source)\b/i.test(value)) {
      issue(line, 'Interpolation, commands, and continuation syntax are not supported.');
      continue;
    }

    let credential;
    try {
      // A JSON entry keeps the source label authoritative and preserves all
      // literal value bytes. Provider conflicts remain visible to the picker.
      credential = parseCredential(JSON.stringify({ [sourceKey]: value }));
    } catch {
      issue(line, 'The credential is empty, too short, too long, or uses an unsupported value format.');
      continue;
    }
    if (entries.length === MAX_CREDENTIALS) {
      if (!limitReported) {
        issue(line, 'Only 200 credential entries can be reviewed from one file. Split the file to import the rest.');
        limitReported = true;
      }
      continue;
    }
    if (!duplicates.has(sourceKey)) entries.push({ line, sourceKey, credential });
  }
  return result();
}

// Build the whole change in memory. The caller performs one storage write only
// after the operator has reviewed and selected the credentials.
export function planEnvImport(apis, credentials, idFactory, savedAt = new Date().toISOString()) {
  if (!Array.isArray(apis) || !Array.isArray(credentials) || !credentials.length || credentials.length > MAX_CREDENTIALS) {
    throw new Error('Choose between 1 and 200 credential entries to import.');
  }
  if (typeof idFactory !== 'function') throw new Error('A card identifier generator is required.');
  if (typeof savedAt !== 'string' || !Number.isFinite(Date.parse(savedAt))) throw new Error('A valid saved timestamp is required.');

  let plannedApis = apis;
  let imported = 0;
  let duplicates = 0;
  const ids = new Set();
  for (const credential of credentials) {
    if (!credential || !supportedCredentialName.test(credential.envKey)
      || typeof credential.value !== 'string' || typeof credential.name !== 'string'
      || typeof credential.cat !== 'string') throw new Error('A selected credential is invalid. Review the selection again.');
    try { parseCredential(JSON.stringify({ [credential.envKey]: credential.value })); }
    catch { throw new Error('A selected credential is invalid. Review the selection again.'); }

    const id = idFactory();
    if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error('A safe, unique card identifier is required.');
    const plan = planCredentialImport(plannedApis, credential, id, savedAt);
    if (plan.apis.length > plannedApis.length && plannedApis.some(api => api.id === id)) {
      throw new Error('A new card identifier was repeated. Try the import again.');
    }
    plannedApis = plan.apis;
    ids.add(plan.id);
    if (plan.duplicate) duplicates++;
    else imported++;
  }
  return { apis: plannedApis, ids: [...ids], imported, duplicates, savedAt };
}
