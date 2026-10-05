import { studioEnabled, verifySession, parseCookies, SESSION_COOKIE } from '../auth.js';
import { attachCookieTokens, createPublishStore, scopeStoreToWorkspace } from './store.js';
import { isWorkspaceId, DEFAULT_WORKSPACE } from '../workspaces.js';
import { youtubeEnvConfigured, youtubeRedirectUri, utcDay } from './config.js';
import { reserveUnits } from './quota.js';
import { verifyOauthState, oauthStateWorkspace, exchangeCode, channelSummary, saveTokens } from './youtube.js';

function htmlRedirect(res, location, extraHeaders = {}) {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(extraHeaders)) {
    if (v !== undefined && v !== null) res.setHeader(k, v);
  }
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
      const now = clock();
      const cookies = parseCookies(req.headers?.cookie);
      const session = cookies[SESSION_COOKIE];
      if (!code || !verifyOauthState(env, state, now, session)) return htmlRedirect(res, `${studio}?youtube=error`);
      // SameSite=Lax session cookie should arrive on this top-level GET. If a
      // browser still omits it, the signed state (issued only after login) is
      // the CSRF + session proof.
      if (session && !verifySession(env, session, now)) return htmlRedirect(res, `${studio}?youtube=signin`);
      const stateWorkspace = oauthStateWorkspace(state);
      const workspace = isWorkspaceId(stateWorkspace) ? stateWorkspace : DEFAULT_WORKSPACE;
      const wsQuery = workspace === DEFAULT_WORKSPACE ? '' : `&workspace=${encodeURIComponent(workspace)}`;
      const tokens = await exchangeCode(env, code, fetchImpl);
      if (!tokens.refresh_token) return htmlRedirect(res, `${studio}?youtube=norefresh${wsQuery}`);
      const outgoing = [];
      const publishStore = scopeStoreToWorkspace(
        attachCookieTokens(store || (memory ||= createPublishStore(env, fetchImpl)), env, cookies, outgoing),
        workspace,
      );
      await reserveUnits(publishStore, utcDay(now), 'channels.list');
      const channel = await channelSummary(tokens.access_token, fetchImpl).catch(() => ({}));
      await saveTokens(env, publishStore, tokens, channel);
      await publishStore.insertAudit({ action: 'oauth_connect', target: 'youtube', status: 'ok', metadata: { channel_id: channel.channel_id || undefined } });
      return htmlRedirect(res, `${studio}?youtube=connected${wsQuery}`, outgoing[0] ? { 'Set-Cookie': outgoing[0] } : {});
    } catch {
      return htmlRedirect(res, `${studio}?youtube=error`);
    }
  };
}
