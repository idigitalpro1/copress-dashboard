import { header, verifyInkboxSignature, verifyTwilioSignature } from './signatures.js';
import { normalizePhone } from './phones.js';

const INKBOX_API = 'https://inkbox.ai/api/v1';

export function smsDryRun(env = process.env) {
  return env.SMS_DRY_RUN !== 'false';
}

export function parseFormBody(raw) {
  const params = {};
  const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw || '');
  for (const [key, value] of new URLSearchParams(text)) params[key] = value;
  return params;
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
      const publicUrl = (env.SATCOM_VIDEO_PUBLIC_URL || '').replace(/\/$/, '');
      const webhookPath = env.SATCOM_VIDEO_SMS_WEBHOOK_PATH || '/api/video-review-sms';
      const url = `${publicUrl}${webhookPath}`;
      const params = parseFormBody(rawBody);
      const ok = verifyTwilioSignature({
        authToken: env.TWILIO_AUTH_TOKEN,
        url,
        params,
        signature: header(headers, 'x-twilio-signature'),
      });
      return ok ? { ok: true } : { ok: false, reason: 'signature' };
    },
    parseInbound({ rawBody }) {
      return twilioInbound(parseFormBody(rawBody));
    },
    async send({ to, body }) {
      const sid = env.TWILIO_ACCOUNT_SID;
      const token = env.TWILIO_AUTH_TOKEN;
      const from = env.TWILIO_FROM_NUMBER || env.SATCOM_VIDEO_SMS_FROM;
      if (!sid || !token || !from) throw new Error('Twilio send is not configured');
      const response = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
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
  const provider = (env.SATCOM_VIDEO_SMS_PROVIDER || 'inkbox').toLowerCase();
  const inner = provider === 'twilio' ? createTwilioAdapter({ env, fetchImpl, logger }) : createInkboxAdapter({ env, fetchImpl, logger });
  const dryRun = smsDryRun(env);
  return {
    name: inner.name,
    dryRun,
    verifyInbound: inner.verifyInbound,
    parseInbound: inner.parseInbound,
    async send({ to, body }) {
      if (dryRun) {
        const id = `dry-run-${Date.now()}`;
        logger?.info?.('sms-dry-run', { provider: inner.name, to, body, id });
        return { id, dryRun: true };
      }
      return inner.send({ to, body });
    },
  };
}
