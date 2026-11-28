// Minimal OpenBao KV v2 client. The gateway never encrypts anything itself.
const ADDR = process.env.BAO_ADDR, TOKEN = process.env.BAO_GATEWAY_TOKEN;
async function call(method, path, body) {
  const r = await fetch(`${ADDR}/v1/${path}`, {
    method, headers: { 'X-Vault-Token': TOKEN, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`openbao ${method} ${path} -> ${r.status}`);
  return r.status === 204 ? {} : r.json();
}
export const listKeys = async () => (await call('LIST', 'secret/metadata/keys'))?.data?.keys ?? [];
export const meta = (n) => call('GET', `secret/metadata/keys/${n}`);
export const read = async (n) => (await call('GET', `secret/data/keys/${n}`))?.data;
export const create = (n, data) => call('POST', `secret/data/keys/${n}`, { options: { cas: 0 }, data });
export const rotate = (n, data) => call('POST', `secret/data/keys/${n}`, { data });
export const softDelete = (n) => call('DELETE', `secret/data/keys/${n}`);
export const destroyAll = (n) => call('DELETE', `secret/metadata/keys/${n}`);
