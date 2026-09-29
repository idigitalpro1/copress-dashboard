import { studioEnabled, verifySession, parseCookies, SESSION_COOKIE } from '../auth.js';
import { createPublishStore } from './store.js';
import { youtubeEnvConfigured, youtubeRedirectUri } from './config.js';
import { verifyOauthState, exchangeCode, channelSummary, saveTokens } from './youtube.js';

function htmlRedirect(res, location) {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.setHeader('Cache-Control', 'no-store');
  res.end();
}

export function createYoutubeCallbackHandler({ getEnv = () => process.env, fetchImpl = (...a) => fetch(...a), clock = Date.now, store } = {}) {
  let memory;
  return async function handler(req, res) {
    const env = getEnv();
    const studio = '/video/studio';
    try {
      if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        res.statusCode = 405;
        res.end();
        return;
      }
      if (!studioEnabled(env) || !youtubeEnvConfigured(env)) {
        return htmlRedirect(res, `${studio}?youtube=disabled`);
      }
      const url = new URL(req.url, youtubeRedirectUri(env));
      if (url.searchParams.get('error')) return htmlRedirect(res, `${studio}?youtube=denied`);
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      if (!code || !verifyOauthState(env, state, clock())) return htmlRedirect(res, `${studio}?youtube=error`);
      const cookie = parseCookies(req.headers?.cookie)[SESSION_COOKIE];
      if (!verifySession(env, cookie, clock())) return htmlRedirect(res, `${studio}?youtube=signin`);
      const tokens = await exchangeCode(env, code, fetchImpl);
      if (!tokens.refresh_token) return htmlRedirect(res, `${studio}?youtube=norefresh`);
      const channel = await channelSummary(tokens.access_token, fetchImpl).catch(() => ({}));
      const publishStore = store || (memory ||= createPublishStore(env, fetchImpl));
      await saveTokens(env, publishStore, tokens, channel);
      await publishStore.insertAudit({ action: 'oauth_connect', target: 'youtube', status: 'ok', metadata: { channel_id: channel.channel_id || undefined } });
      return htmlRedirect(res, `${studio}?youtube=connected`);
    } catch {
      return htmlRedirect(res, `${studio}?youtube=error`);
    }
  };
}
