import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import mcp from '../api/mcp.js';
import health from '../api/health.js';
import board from '../api/development-board.js';
import videos from '../api/videos.js';
import studio from '../api/studio/index.js';
import newsflow from '../api/newsflow.js';
const root = resolve(new URL('..', import.meta.url).pathname);
createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (/^\/api\/(?:vault|prompts|newsflow)(?:\/|$)/.test(pathname) || pathname === '/sse' || pathname === '/message') return newsflow(req, res);
  if (pathname === '/mcp' || pathname === '/api/mcp') return mcp(req, res);
  if (pathname === '/api/health') return health(req, res);
  if (pathname === '/api/development-board') return board(req, res);
  if (pathname === '/api/videos' || pathname === '/data/video-feed.json') return videos(req, res);
  if (pathname === '/api/studio') return studio(req, res);
  let file = pathname === '/newsflow' || pathname === '/newsflow/' ? '/newsflow/index.html' : pathname === '/apikeys' ? '/apistore.html' : pathname === '/video' || pathname === '/video/' ? '/video/index.html' : pathname === '/' ? '/index.html' : pathname;
  if (!extname(file)) file += '.html';
  const target = resolve(root, '.' + file);
  if (!target.startsWith(root + '/') || /(?:^|\/)\./.test(file) || file.includes('/node_modules/') || file.startsWith('/services/')) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(target);
    const types = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.md':'text/plain' };
    res.writeHead(200, {'Content-Type': types[extname(file)] || 'application/octet-stream'}).end(body);
  } catch { res.writeHead(404).end('Not found'); }
}).listen(Number(process.env.PORT || 4321), '127.0.0.1', () => console.log('SATCOM preview: http://127.0.0.1:' + (process.env.PORT || 4321)));
