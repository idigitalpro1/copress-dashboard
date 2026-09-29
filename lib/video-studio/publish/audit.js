const PHI_OR_COPY_KEYS = /prompt|response|message|transcript|caption|description|title|phi|name|email|phone|address|medical|patient|ssn/i;

export function sanitizeAuditMetadata(meta = {}) {
  const out = {};
  for (const [k, v] of Object.entries(meta || {})) {
    if (PHI_OR_COPY_KEYS.test(k)) continue;
    if (typeof v === 'string') out[k] = v.slice(0, 120);
    else if (typeof v === 'number' || typeof v === 'boolean' || v == null) out[k] = v;
  }
  return out;
}

export function auditRow({ action, target, asset_public_id, job_id, status, metadata }) {
  return {
    action: String(action || '').slice(0, 40),
    target: target ? String(target).slice(0, 20) : null,
    asset_public_id: asset_public_id ? String(asset_public_id).slice(0, 255) : null,
    job_id: job_id || null,
    status: status ? String(status).slice(0, 40) : null,
    metadata: sanitizeAuditMetadata(metadata),
  };
}
