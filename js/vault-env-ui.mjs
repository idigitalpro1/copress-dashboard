import { parseEnvFile, planEnvImport } from './vault-env.mjs';

// The selected file is read in memory only. Neither its name nor contents are sent anywhere.
export function setupEnvImport({ choices, closeIntake, revealCard, status, confirmCompletion }) {
  const fileInput = document.getElementById('env-import-file');
  const open = document.getElementById('env-import-open');
  const dialog = document.getElementById('env-import-dialog');
  const rows = document.getElementById('env-import-rows');
  const issues = document.getElementById('env-import-issues');
  const summary = document.getElementById('env-import-summary');
  const save = document.getElementById('env-import-save');
  let pendingRows = [];
  let skipped = 0;
  let issueCount = 0;
  let reading = false;
  let generation = 0;

  function clearPreview() {
    pendingRows = [];
    rows.replaceChildren();
    issues.replaceChildren();
    fileInput.value = '';
    save.disabled = true;
  }

  function selectedCredentials() {
    return pendingRows.filter(row => row.checkbox.checked && row.select.value).map(row => {
      const choice = choices.get(row.select.value);
      return choice ? { ...row.entry.credential, ...choice, ambiguous: false } : { ...row.entry.credential, ambiguous: false };
    });
  }

  function updateSelection() {
    const unresolved = pendingRows.some(row => row.checkbox.checked && !row.select.value);
    const count = selectedCredentials().length;
    save.disabled = unresolved || count === 0;
    save.textContent = `Import ${count} selected key${count === 1 ? '' : 's'}`;
    summary.textContent = `${pendingRows.length} credentials found. ${count} selected. ${skipped} empty or configuration entries skipped. ${issueCount} ${issueCount === 1 ? 'line needs' : 'lines need'} attention.${unresolved ? ' Choose a match for each selected key.' : ''}`;
  }

  function preview(result) {
    clearPreview();
    skipped = result.skipped;
    issueCount = result.issues.length;
    for (const [index, entry] of result.entries.entries()) {
      const row = document.createElement('div');
      row.className = 'env-import-row';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `env-entry-${index}`;
      checkbox.checked = !entry.credential.ambiguous;
      const details = document.createElement('div');
      const label = document.createElement('label');
      label.htmlFor = checkbox.id;
      label.textContent = entry.sourceKey;
      const meta = document.createElement('span');
      meta.className = 'env-import-meta';
      meta.textContent = `Line ${entry.line} · Value masked · ${entry.credential.evidence}`;
      const select = document.createElement('select');
      select.className = 'field-input';
      select.setAttribute('aria-label', `Match ${entry.sourceKey}`);
      select.add(new Option('Choose provider / key type…', ''));
      for (const [key, choice] of choices) select.add(new Option(`${choice.label} (${key})`, key));
      select.add(new Option(`Keep environment name (${entry.credential.envKey})`, 'keep'));
      select.value = entry.credential.ambiguous ? '' : choices.has(entry.credential.envKey) ? entry.credential.envKey : 'keep';
      checkbox.addEventListener('change', updateSelection);
      select.addEventListener('change', () => { checkbox.checked = Boolean(select.value); updateSelection(); });
      details.append(label, meta, select);
      row.append(checkbox, details);
      rows.append(row);
      pendingRows.push({ entry, checkbox, select });
    }
    for (const issue of result.issues) {
      const item = document.createElement('li');
      item.textContent = `${issue.line ? `Line ${issue.line}: ` : ''}${issue.message}`;
      issues.append(item);
    }
    updateSelection();
    status('Review ready. No keys have been saved.');
    closeIntake();
    dialog.showModal();
  }

  open.addEventListener('click', () => { if (!reading) fileInput.click(); });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    const request = ++generation;
    reading = true;
    open.disabled = true;
    status('Reading .env locally. No keys have been saved.');
    try {
      if (file.size > 256 * 1024) {
        status('This file is too large. Select a text .env file of 256 KB or less.');
        return;
      }
      // Reject invalid UTF-8 instead of silently changing a credential's bytes.
      const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      if (request !== generation) return;
      preview(parseEnvFile(text));
    } catch {
      if (request !== generation) return;
      status('The file could not be read as UTF-8 .env text. No keys were imported.');
    } finally {
      if (request === generation) { reading = false; open.disabled = false; }
    }
  });

  save.addEventListener('click', () => {
    if (save.disabled) return;
    const credentials = selectedCredentials();
    if (!credentials.length) return;
    save.disabled = true;
    const previous = apis;
    let plan;
    try {
      const savedAt = new Date().toISOString();
      plan = planEnvImport(apis, credentials, () => 'clipboard-' + crypto.randomUUID(), savedAt);
      if (plan.imported) {
        apis = plan.apis;
        saveVault();
      }
    } catch {
      apis = previous;
      summary.textContent = 'The browser could not save these cards. No import was completed. Check available storage and try again.';
      save.disabled = false;
      return;
    }
    dialog.close();
    clearPreview();
    revealCard(plan.ids.at(-1));
    status(`${plan.imported} keys saved from .env. ${plan.duplicates} already saved. Completed ${formatVaultTime(plan.savedAt)}.`);
    confirmCompletion(plan);
  });

  document.getElementById('env-import-cancel').addEventListener('click', () => {
    status('Import cancelled. No keys were saved.');
    dialog.close();
  });
  dialog.addEventListener('cancel', () => status('Import cancelled. No keys were saved.'));
  dialog.addEventListener('close', () => { if (!dialog.open) clearPreview(); });
  return function cancelRead() {
    if (reading) status('Import cancelled. No keys were saved.');
    generation++;
    reading = false;
    open.disabled = false;
  };
}
