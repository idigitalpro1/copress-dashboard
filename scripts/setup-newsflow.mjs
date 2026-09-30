import { randomBytes } from 'node:crypto';
import { mkdirSync, lstatSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const input = process.argv[2];
const webRoot = realpathSync(fileURLToPath(new URL('../', import.meta.url)));
if (!input || !isAbsolute(input) || /[\r\n"']/.test(input)) {
  console.error('Provide an absolute private directory outside the website.');
  process.exit(1);
}
const directory = resolve(input);
if (directory === webRoot || directory.startsWith(webRoot + '/')) {
  console.error('The private directory must be outside the website.');
  process.exit(1);
}
mkdirSync(directory, { recursive: true, mode: 0o700 });
const stat = lstatSync(directory);
const realDirectory = realpathSync(directory);
if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077)
  || realDirectory === webRoot || realDirectory.startsWith(webRoot + '/')) {
  console.error('Use a private directory with mode 700 outside the website.');
  process.exit(1);
}
const config = join(directory, 'newsflow.env');
const data = join(realDirectory, 'data');
try {
  writeFileSync(config, [
    'NEWSFLOW_BETA_ENABLED=1',
    'NEWSFLOW_MCP_TOKEN=' + randomBytes(32).toString('hex'),
    'NEWSFLOW_MASTER_KEY=' + randomBytes(32).toString('hex'),
    'NEWSFLOW_DATA_DIR="' + data + '"',
    'NEWSFLOW_ALLOWED_ORIGINS=http://127.0.0.1:4321,http://localhost:4321',
    'NEWSFLOW_ALLOW_EXECUTION=0',
    '',
  ].join('\n'), { flag: 'wx', mode: 0o600 });
  console.log('Created private beta configuration: ' + config);
  console.log('Secrets were not printed. Back up this file securely with the encrypted vault.');
} catch {
  console.error('Configuration was not created. Existing files were preserved.');
  process.exitCode = 1;
}
