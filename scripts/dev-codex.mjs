import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import mcp from '../api/mcp.js';
import health from '../api/health.js';
import board from '../api/development-board.js';
const root = resolve(new URL('..', import.meta.url).pathname);
createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/mcp' || pathname === '/api/mcp') return mcp(req, res);
  if (pathname === '/api/health') return health(req, res);
  if (pathname === '/api/development-board') return board(req, res);
  let file = pathname === '/' ? '/index.html' : pathname;
  if (!extname(file)) file += '.html';
  const target = resolve(root, '.' + file);
  if (!target.startsWith(root + '/') || /(?:^|\/)\./.test(file) || file.includes('/node_modules/')) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(target);
    const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.md':'text/plain' };
    res.writeHead(200, {'Content-Type': types[extname(file)] || 'application/octet-stream'}).end(body);
  } catch { res.writeHead(404).end('Not found'); }
}).listen(Number(process.env.PORT || 4321), '127.0.0.1', () => console.log('SATCOM preview: http://127.0.0.1:' + (process.env.PORT || 4321)));
