import { header, verifyInkboxSignature, verifyTwilioSignature } from './signatures.js';
import { normalizePhone } from './phones.js';

const INKBOX_API = 'https://inkbox.ai/api/v1';
const TWILIO_MESSAGES = sid => `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
const WEBHOOK_PATH = '/api/video-review-sms';

export function smsDryRun(env = process.env) {
  return env.SMS_DRY_RUN !== 'false';
}

export function smsProviderName(env = process.env) {
  const value = String(env.SATCOM_VIDEO_SMS_PROVIDER || env.SMS_PROVIDER || 'twilio').trim().toLowerCase();
  return value === 'inkbox' ? 'inkbox' : 'twilio';
}

export function twilioAdvancedOptOut(env = process.env) {
  const value = String(env.TWILIO_ADVANCED_OPT_OUT || '').trim().toLowerCase();
  return value === 'true' || value === '1' || value === 'yes';
}

export function twilioFromNumber(env = process.env) {
  return env.TWILIO_FROM_NUMBER || env.TWILIO_PHONE_NUMBER || env.SATCOM_VIDEO_SMS_FROM || '';
}

export function twilioBasicAuth(env = process.env) {
  const apiKey = env.TWILIO_API_KEY_SID || env.TWILIO_API_KEY;
  const apiSecret = env.TWILIO_API_KEY_SECRET || env.TWILIO_API_SECRET;
  if (apiKey && apiSecret) return { username: apiKey, password: apiSecret, mode: 'api-key' };
  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN) {
    return { username: env.TWILIO_ACCOUNT_SID, password: env.TWILIO_AUTH_TOKEN, mode: 'auth-token' };
  }
  return null;
}

export function parseFormBody(raw) {
  const params = {};
  const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw || '');
  for (const [key, value] of new URLSearchParams(text)) params[key] = value;
  return params;
}

export function twilioWebhookPath(env = process.env) {
  return env.SATCOM_VIDEO_SMS_WEBHOOK_PATH || WEBHOOK_PATH;
}

export function twilioWebhookUrls(env = {}, headers = {}) {
  const path = twilioWebhookPath(env);
  const urls = [];
  const configured = String(env.SATCOM_VIDEO_PUBLIC_URL || '').replace(/\/$/, '');
  if (configured) urls.push(`${configured}${path}`);
  const host = (header(headers, 'x-forwarded-host') || header(headers, 'host') || '').split(',')[0].trim();
  if (host) {
    const forwarded = (header(headers, 'x-forwarded-proto') || '').split(',')[0].trim();
    const proto = forwarded || (host.includes('localhost') || host.startsWith('127.') ? 'http' : 'https');
    const fromHost = `${proto}://${host}${path}`;
    if (!urls.includes(fromHost)) urls.push(fromHost);
  }
  return urls;
}

export function parseTwilioMedia(params = {}) {
  const media = [];
  const declared = Number(params.NumMedia);
  const limit = Number.isFinite(declared) && declared > 0 ? Math.min(declared, 10) : 10;
  for (let i = 0; i < limit; i += 1) {
    const url = params[`MediaUrl${i}`];
    if (!url) continue;
    media.push({
      url: String(url),
      contentType: String(params[`MediaContentType${i}`] || ''),
    });
  }
  return media;
}

export function firstVideoMedia(media = []) {
  return media.find(item => String(item.contentType || '').toLowerCase().startsWith('video/')) || null;
}

export function buildTwilioMessageRequest(env, { to, body }) {
  const accountSid = env.TWILIO_ACCOUNT_SID || '<SID>';
  const form = { To: to, Body: body };
  const messagingServiceSid = env.TWILIO_MESSAGING_SERVICE_SID || '';
  if (messagingServiceSid) form.MessagingServiceSid = messagingServiceSid;
  else form.From = twilioFromNumber(env);
  const auth = twilioBasicAuth(env);
  const headers = {
    Authorization: auth ? `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}` : 'Basic [redacted]',
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  return {
    url: TWILIO_MESSAGES(accountSid),
    method: 'POST',
    headers,
    form,
  };
}

export function publicTwilioRequest(request) {
  if (!request) return null;
  return {
    url: request.url,
    method: request.method || 'POST',
    To: request.form?.To,
    From: request.form?.From,
    Body: request.form?.Body,
    ...(request.form?.MessagingServiceSid ? { MessagingServiceSid: request.form.MessagingServiceSid } : {}),
  };
}

function inkboxInbound(payload) {
  if (!payload || payload.event_type !== 'text.received') return null;
  const message = payload.data?.text_message || {};
  const from = normalizePhone(message.sender_phone_number || message.remote_phone_number);
  const to = normalizePhone(message.local_phone_number);
  if (!from) return null;
  return {
    provider: 'inkbox',
    messageId: String(payload.id || message.id || ''),
    from,
    to,
    body: message.text == null ? '' : String(message.text),
    media: [],
  };
}

function twilioInbound(params) {
  const from = normalizePhone(params.From);
  if (!from || !params.MessageSid) return null;
  return {
    provider: 'twilio',
    messageId: String(params.MessageSid),
    from,
    to: normalizePhone(params.To),
    body: params.Body == null ? '' : String(params.Body),
    media: parseTwilioMedia(params),
  };
}

function createInkboxAdapter({ env, fetchImpl, logger }) {
  const secret = env.INKBOX_WEBHOOK_SECRET || env.INKBOX_SIGNING_KEY || '';
  const authToken = env.INKBOX_WEBHOOK_AUTH_TOKEN || '';
  return {
    name: 'inkbox',
    verifyInbound({ headers, rawBody, now }) {
      if (authToken) {
        const authorization = header(headers, 'authorization');
        if (authorization !== `Bearer ${authToken}`) return { ok: false, reason: 'auth' };
      }
      const ok = verifyInkboxSignature({
        secret,
        requestId: header(headers, 'x-inkbox-request-id'),
        timestamp: header(headers, 'x-inkbox-timestamp'),
        rawBody,
        signature: header(headers, 'x-inkbox-signature'),
        now,
      });
      return ok ? { ok: true } : { ok: false, reason: 'signature' };
    },
    parseInbound({ rawBody }) {
      try {
        return inkboxInbound(JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody || '')));
      } catch {
        return null;
      }
    },
    async send({ to, body }) {
      const base = (env.INKBOX_API_BASE_URL || INKBOX_API).replace(/\/$/, '');
      const numberId = env.INKBOX_PHONE_NUMBER_ID;
      const key = env.INKBOX_API_KEY;
      if (!numberId || !key) throw new Error('Inkbox send is not configured');
      const response = await fetchImpl(`${base}/phone/numbers/${numberId}/texts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
        body: JSON.stringify({ to, text: body }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        logger?.error?.('inkbox-send-failed', response.status);
        throw new Error('Inkbox send failed');
      }
      const payload = await response.json().catch(() => ({}));
      return { id: payload.id || `inkbox-${Date.now()}` };
    },
  };
}

function createTwilioAdapter({ env, fetchImpl, logger }) {
  return {
    name: 'twilio',
    verifyInbound({ headers, rawBody }) {
      const signature = header(headers, 'x-twilio-signature');
      if (!signature) return { ok: false, reason: 'signature' };
      const params = parseFormBody(rawBody);
      const urls = twilioWebhookUrls(env, headers);
      if (!urls.length) return { ok: false, reason: 'signature' };
      const ok = urls.some(url => verifyTwilioSignature({
        authToken: env.TWILIO_AUTH_TOKEN,
        url,
        params,
        signature,
      }));
      return ok ? { ok: true } : { ok: false, reason: 'signature' };
    },
    parseInbound({ rawBody }) {
      return twilioInbound(parseFormBody(rawBody));
    },
    async send({ to, body }) {
      const request = buildTwilioMessageRequest(env, { to, body });
      const accountSid = env.TWILIO_ACCOUNT_SID;
      const auth = twilioBasicAuth(env);
      if (!accountSid || accountSid === '<SID>' || !auth || (!request.form.From && !request.form.MessagingServiceSid)) {
        throw new Error('Twilio send is not configured');
      }
      const response = await fetchImpl(request.url, {
        method: 'POST',
        headers: request.headers,
        body: new URLSearchParams(request.form).toString(),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        logger?.error?.('twilio-send-failed', response.status);
        throw new Error('Twilio send failed');
      }
      const payload = await response.json().catch(() => ({}));
      return { id: payload.sid || `twilio-${Date.now()}` };
    },
  };
}

export function createSmsAdapter({ env = process.env, fetchImpl = fetch, logger = console } = {}) {
  const provider = smsProviderName(env);
  const inner = provider === 'twilio' ? createTwilioAdapter({ env, fetchImpl, logger }) : createInkboxAdapter({ env, fetchImpl, logger });
  const dryRun = smsDryRun(env);
  return {
    name: inner.name,
    dryRun,
    verifyInbound: inner.verifyInbound,
    parseInbound: inner.parseInbound,
    async send({ to, body }) {
      if (inner.name === 'twilio') {
        const request = buildTwilioMessageRequest(env, { to, body });
        const publicRequest = publicTwilioRequest(request);
        if (dryRun) {
          const id = `dry-run-${Date.now()}`;
          logger?.info?.('sms-dry-run', { provider: 'twilio', to, id, twilioRequest: publicRequest });
          return { id, dryRun: true, request: publicRequest };
        }
        return inner.send({ to, body });
      }
      if (dryRun) {
        const id = `dry-run-${Date.now()}`;
        logger?.info?.('sms-dry-run', { provider: inner.name, to, body, id });
        return { id, dryRun: true };
      }
      return inner.send({ to, body });
    },
  };
}
