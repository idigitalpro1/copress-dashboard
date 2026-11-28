// Gateway state: passkeys, recovery-code hashes, bot-token hashes, append-only audit. No secret values.
import { DatabaseSync } from 'node:sqlite';
export const db = new DatabaseSync(process.env.DB_PATH || ':memory:');
db.exec(`
CREATE TABLE IF NOT EXISTS passkeys (id TEXT PRIMARY KEY, public_key BLOB NOT NULL, counter INTEGER NOT NULL,
  transports TEXT, label TEXT, created_at TEXT NOT NULL, revoked_at TEXT);
CREATE TABLE IF NOT EXISTS recovery_codes (hash TEXT PRIMARY KEY, used_at TEXT);
CREATE TABLE IF NOT EXISTS bot_tokens (id TEXT PRIMARY KEY, name TEXT NOT NULL, hash TEXT NOT NULL,
  scopes TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT, revoked_at TEXT, last_used_at TEXT);
CREATE TABLE IF NOT EXISTS audit (seq INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, actor TEXT NOT NULL,
  action TEXT NOT NULL, key_name TEXT, ip TEXT, ua TEXT, result TEXT NOT NULL);
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'append-only'); END;
`);
export function audit({ actor, action, key_name = null, ip = null, ua = null, result }) {
  db.prepare('INSERT INTO audit (ts,actor,action,key_name,ip,ua,result) VALUES (?,?,?,?,?,?,?)')
    .run(new Date().toISOString(), actor, action, key_name, ip, ua, result);
}
