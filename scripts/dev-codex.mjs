import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import mcp from '../api/mcp.js';
import health from '../api/health.js';
import board from '../api/development-board.js';
import videos from '../api/videos.js';
import studio from '../api/studio/index.js';
import videoReviewSms from '../api/video-review-sms.js';
import videoReviewSession from '../api/video-review-session.js';
import videoReviewPending from '../api/video-review-pending.js';
import videoReviewDecide from '../api/video-review-decide.js';
import videoReviewLogin from '../api/video-review-login.js';
import videoReviewSubmit from '../api/video-review-submit.js';
const root = resolve(new URL('..', import.meta.url).pathname);
createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/mcp' || pathname === '/api/mcp') return mcp(req, res);
  if (pathname === '/api/health') return health(req, res);
  if (pathname === '/api/development-board') return board(req, res);
  if (pathname === '/api/videos' || pathname === '/data/video-feed.json') return videos(req, res);
  if (pathname === '/api/studio') return studio(req, res);
  if (pathname === '/api/video-review-sms') return videoReviewSms(req, res);
  if (pathname === '/api/video-review-session') return videoReviewSession(req, res);
  if (pathname === '/api/video-review-pending') return videoReviewPending(req, res);
  if (pathname === '/api/video-review-decide') return videoReviewDecide(req, res);
  if (pathname === '/api/video-review-login') return videoReviewLogin(req, res);
  if (pathname === '/api/video-review-submit') return videoReviewSubmit(req, res);
  let file = pathname === '/apikeys' ? '/apistore.html'
    : pathname === '/video' || pathname === '/video/' ? '/video/index.html'
    : pathname === '/video/review-continue' ? '/video/review-continue.html'
    : pathname === '/video/review' ? '/video/review.html'
    : pathname === '/video/submit' ? '/video/submit.html'
    : pathname === '/video/upload' || pathname.startsWith('/video/upload/') ? '/video/creator-upload.html'
    : pathname === '/' ? '/index.html' : pathname;
  if (!extname(file)) file += '.html';
  const target = resolve(root, '.' + file);
  if (!target.startsWith(root + '/') || /(?:^|\/)\./.test(file) || file.includes('/node_modules/')) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(target);
    const types = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.md':'text/plain' };
    res.writeHead(200, {'Content-Type': types[extname(file)] || 'application/octet-stream'}).end(body);
  } catch { res.writeHead(404).end('Not found'); }
}).listen(Number(process.env.PORT || 4321), '127.0.0.1', () => console.log('SATCOM preview: http://127.0.0.1:' + (process.env.PORT || 4321)));
