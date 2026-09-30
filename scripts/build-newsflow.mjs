import { build as bundle } from 'esbuild';
import { build as viteBuild } from 'vite';
import { fileURLToPath } from 'node:url';
const serviceRoot = new URL('../services/mcp-vault/', import.meta.url);
const bundled = await bundle({
  entryPoints: [fileURLToPath(new URL('server/entry.ts', serviceRoot))],
  outfile: fileURLToPath(new URL('build/runtime.mjs', serviceRoot)),
  bundle: true, platform: 'node', format: 'esm', target: 'node22',
  packages: 'external', sourcemap: false, metafile: true,
});
const exports = Object.values(bundled.metafile.outputs).flatMap(output => output.exports);
if (!exports.includes('createNewsflowApp') || !exports.includes('mountNewsflowMcp')) {
  throw new Error('NewsFlow must export its guarded application and MCP factory.');
}
await viteBuild({ configFile: fileURLToPath(new URL('vite.config.ts', serviceRoot)) });
console.log('Built the isolated NewsFlow backend and /newsflow/ application.');
