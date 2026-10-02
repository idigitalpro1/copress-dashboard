import { z } from 'zod';
import { cloudinaryConfig, signedUploadParams } from '../video-studio/cloudinary.js';
import { incomingFolder } from '../video-studio/incoming.js';
import { TOKEN_PATTERN, resolveCreatorToken, incomingPublicId, ctxField } from './tokens.js';
import {
  MAX_FILE_BYTES, SIGN_LIMIT_PER_IP, SIGN_LIMIT_PER_TOKEN, LOOKUP_LIMIT_PER_IP,
  isAllowedVideo, createLimiter,
} from './limits.js';

const UNAVAILABLE = 'This link is not available.';
const MAX_BODY = 20_000;
const lookupLimit = createLimiter();
const signLimit = createLimiter();

function fail(status, message) { return Object.assign(new Error(message), { status, expose: true }); }

function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) return JSON.parse(String(req.body) || '{}');
  const chunks = []; let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > MAX_BODY) throw fail(413, 'Request too large.');
    chunks.push(Buffer.from(chunk));
  }
  return length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

function clientIp(req) {
  return String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}

const signSchema = z.object({
  filename: z.string().min(1).max(240),
  mime: z.string().max(80).optional().default(''),
  bytes: z.number().int().positive().max(MAX_FILE_BYTES),
  title: z.string().max(200).optional().default(''),
  note: z.string().max(400).optional().default(''),
});

export function createCreatorUploadHandler({
  getEnv = () => process.env,
  fetchImpl = (...a) => fetch(...a),
  clock = Date.now,
  sleep = (ms) => new Promise(r => setTimeout(r, ms)),
} = {}) {
  return async function handler(req, res) {
    const env = getEnv();
    try {
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return send(res, 404, { error: UNAVAILABLE });
      }
      if (req.headers?.['x-creator-upload'] !== '1') return send(res, 404, { error: UNAVAILABLE });
      const body = await readBody(req).catch(e => { throw e.status ? e : fail(400, 'Invalid JSON body.'); });
      const op = String(body?.op || '');
      const now = clock();
      const ip = clientIp(req);
      const token = String(body?.token || '');

      if (lookupLimit(ip, LOOKUP_LIMIT_PER_IP, now)) return send(res, 429, { error: 'Too many attempts. Try again later.' });
      if (!TOKEN_PATTERN.test(token)) {
        await sleep(180);
        return send(res, 404, { error: UNAVAILABLE });
      }
      const creator = await resolveCreatorToken(env, token, fetchImpl);
      if (!creator) {
        await sleep(180);
        return send(res, 404, { error: UNAVAILABLE });
      }

      if (op === 'session') {
        return send(res, 200, { ok: true, creator: creator.name });
      }
      if (op !== 'sign') return send(res, 404, { error: UNAVAILABLE });

      const cfg = cloudinaryConfig(env);
      if (!cfg) return send(res, 503, { error: 'Uploads are temporarily unavailable.' });
      if (signLimit(`ip:${ip}`, SIGN_LIMIT_PER_IP, now) || signLimit(`tok:${creator.slug}`, SIGN_LIMIT_PER_TOKEN, now)) {
        return send(res, 429, { error: 'Too many uploads. Try again in a few minutes.' });
      }

      const parsed = signSchema.safeParse(body);
      if (!parsed.success) return send(res, 400, { error: 'Choose a video file under 4 GB.' });
      const file = parsed.data;
      if (!isAllowedVideo(file)) return send(res, 400, { error: 'Choose an MP4, MOV, or similar video file under 4 GB.' });

      const title = ctxField(file.title || file.filename.replace(/\.[^.]+$/, ''), 200) || 'Untitled clip';
      const note = ctxField(file.note, 400);
      const publicId = incomingPublicId(creator.slug, title, now);
      const params = {
        public_id: publicId,
        type: 'private',
        overwrite: 'false',
        tags: 'draft,creator-upload',
        context: `creator=${ctxField(creator.name, 80)}|note=${note}|uploaded_at=${new Date(now).toISOString()}|caption=${title}`,
      };
      const signed = signedUploadParams(cfg, params, now);
      return send(res, 200, {
        cloudName: signed.cloudName,
        apiKey: signed.apiKey,
        timestamp: signed.timestamp,
        signature: signed.signature,
        params,
        upload_url: `https://api.cloudinary.com/v1_1/${cfg.cloudName}/video/upload`,
        resource_type: 'video',
        max_bytes: MAX_FILE_BYTES,
        folder: incomingFolder(creator.slug),
        note: 'Received files stay private until Patrick reviews them.',
      });
    } catch (error) {
      const status = error?.status && error.status >= 400 && error.status < 600 ? error.status : 500;
      return send(res, status, { error: error?.expose ? String(error.message).slice(0, 200) : 'Upload is unavailable.' });
    }
  };
}
