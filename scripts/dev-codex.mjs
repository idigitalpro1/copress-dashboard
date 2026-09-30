import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import mcp from '../api/mcp.js';
import health from '../api/health.js';
import board from '../api/development-board.js';
import videos from '../api/videos.js';
import studio from '../api/studio/index.js';
import newsflow from '../api/newsflow.js';
const root = resolve(new URL('..', import.meta.url).pathname);
const port = Number(process.env.PORT || 4321);
const newsflowCsp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
const server = createServer({ maxHeaderSize: 16384 }, async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // A loopback listener still needs a Host check to reject DNS rebinding.
  const hosts = [`localhost:${req.socket.localPort}`, `127.0.0.1:${req.socket.localPort}`, `[::1]:${req.socket.localPort}`];
  const hostCount = req.rawHeaders.filter((_, index) => index % 2 === 0 && req.rawHeaders[index].toLowerCase() === 'host').length;
  if (hostCount !== 1 || !hosts.includes(req.headers.host?.toLowerCase())) { res.writeHead(403).end('Forbidden'); return; }
  let pathname;
  try {
    if (!req.url?.startsWith('/') || req.url.startsWith('//')) throw new Error();
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname.includes('\\') || pathname.includes('\0')) throw new Error();
  } catch { res.writeHead(400).end('Invalid request path'); return; }
  if (pathname === '/newsflow' || pathname.startsWith('/newsflow/')) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Content-Security-Policy', newsflowCsp);
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  }
  if (/^\/api\/(?:vault|prompts|newsflow)(?:\/|$)/.test(pathname) || pathname === '/sse' || pathname === '/message') return newsflow(req, res);
  if (pathname === '/mcp' || pathname === '/api/mcp') return mcp(req, res);
  if (pathname === '/api/health') return health(req, res);
  if (pathname === '/api/development-board') return board(req, res);
  if (pathname === '/api/videos' || pathname === '/data/video-feed.json') return videos(req, res);
  if (pathname === '/api/studio') return studio(req, res);
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed'); return; }
  let file = pathname === '/newsflow' || pathname === '/newsflow/' ? '/newsflow/index.html' : pathname === '/apikeys' ? '/apistore.html' : pathname === '/video' || pathname === '/video/' ? '/video/index.html' : pathname === '/' ? '/index.html' : pathname;
  if (!extname(file)) file += '.html';
  const target = resolve(root, '.' + file);
  if (!target.startsWith(root + '/') || /(?:^|\/)\./.test(file) || /^\/(?:node_modules|services|scripts|tests|api|lib|packages)(?:\/|$)/.test(file) || /^\/(?:package(?:-lock)?\.json|vercel\.json|tsconfig[^/]*\.json)$/.test(file)) { res.writeHead(403).end(); return; }
  try {
    const actualTarget = await realpath(target);
    if (!actualTarget.startsWith(root + '/')) { res.writeHead(403).end(); return; }
    const body = await readFile(target);
    const types = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.md':'text/plain' };
    res.writeHead(200, {'Content-Type': types[extname(file)] || 'application/octet-stream', 'Content-Length': body.length}).end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(404).end('Not found'); }
});
server.headersTimeout = 10000;
server.requestTimeout = 30000;
server.keepAliveTimeout = 5000;
server.maxRequestsPerSocket = 100;
server.listen(port, '127.0.0.1', () => console.log('SATCOM preview: http://127.0.0.1:' + port));
