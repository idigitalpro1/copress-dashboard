import { randomBytes } from 'node:crypto';
import { mkdirSync, lstatSync, realpathSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, isAbsolute, join, dirname, basename, parse } from 'node:path';
import { fileURLToPath } from 'node:url';

const input = process.argv[2];
const webRoot = realpathSync(fileURLToPath(new URL('../', import.meta.url)));
if (!input || !isAbsolute(input) || /[\r\n"'\\]/.test(input)) {
  console.error('Provide an absolute private directory outside the website.');
  process.exit(1);
}
const directory = resolve(input);
let ancestor = directory;
const missing = [];
while (!existsSync(ancestor)) {
  missing.unshift(basename(ancestor));
  ancestor = dirname(ancestor);
}
const prospective = resolve(realpathSync(ancestor), ...missing);
if (directory === parse(directory).root || prospective === webRoot || prospective.startsWith(webRoot + '/')) {
  console.error('The private directory must be outside the website.');
  process.exit(1);
}
mkdirSync(directory, { recursive: true, mode: 0o700 });
const stat = lstatSync(directory);
const realDirectory = realpathSync(directory);
if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o7777) !== 0o700
  || (typeof process.getuid === 'function' && stat.uid !== process.getuid())
  || realDirectory === webRoot || realDirectory.startsWith(webRoot + '/')) {
  console.error('Use a directory you own with mode 700 outside the website.');
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
