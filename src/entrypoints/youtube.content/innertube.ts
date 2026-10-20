/**
 * Requests to YouTube's internal API ("youtubei/v1/…") from inside a YouTube
 * tab, the same way YouTube's own pages do, with the user's login. Running
 * them here instead of in the background avoids needing the cookies permission.
 */
import { t } from '@/lib/i18n';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function getCookie(name: string): string | undefined {
  return document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1];
}

/** Authorization header YouTube's own scripts send for logged-in requests. */
async function authHeader(): Promise<string | undefined> {
  const sapisid = getCookie('SAPISID') ?? getCookie('__Secure-3PAPISID');
  if (!sapisid) return undefined;
  const ts = Math.floor(Date.now() / 1000);
  const data = new TextEncoder().encode(`${ts} ${sapisid} ${location.origin}`);
  const hash = await crypto.subtle.digest('SHA-1', data);
  const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `SAPISIDHASH ${ts}_${hex}`;
}

export interface YtConfig {
  context: unknown;
  apiKey?: string;
  sessionIndex?: string;
}

/** Reads YouTube's client configuration from the page (Firefox: wrappedJSObject). */
export function readConfig(): YtConfig {
  const page = (window as unknown as { wrappedJSObject?: any }).wrappedJSObject;
  const cfg = page?.ytcfg;
  const ctx = cfg?.get?.('INNERTUBE_CONTEXT');
  if (!ctx) throw new Error(t.errors.ytConfig);
  // Serialize inside the page so no page objects leak into the extension.
  const context = JSON.parse(page.JSON.stringify(ctx));
  const apiKey = cfg.get('INNERTUBE_API_KEY');
  const sessionIndex = cfg.get('SESSION_INDEX');
  return {
    context,
    apiKey: typeof apiKey === 'string' ? apiKey : undefined,
    sessionIndex: sessionIndex !== undefined && sessionIndex !== null ? String(sessionIndex) : undefined,
  };
}

/** POST to YouTube's internal API ("browse", "feedback", …) as the logged-in page. */
export async function innertube(
  cfg: YtConfig,
  endpoint: string,
  body: Record<string, unknown>,
  referrerPath = '/feed/history',
): Promise<unknown> {
  // Firefox: `content.fetch` sends the request as the page itself (origin, cookies).
  const content = (globalThis as unknown as { content?: { fetch: typeof fetch } }).content;
  const pageFetch = content?.fetch ? content.fetch.bind(content) : fetch;
  const client = (cfg.context as { client?: { clientVersion?: string; visitorData?: string } }).client;
  // Same headers as YouTube's own pages (and Watchmarker).
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Origin': location.origin,
    'X-Goog-AuthUser': cfg.sessionIndex ?? '0',
    'X-Youtube-Client-Name': '1',
    'X-Youtube-Bootstrap-Logged-In': 'true',
  };
  if (client?.clientVersion) headers['X-Youtube-Client-Version'] = client.clientVersion;
  if (client?.visitorData) headers['X-Goog-Visitor-Id'] = client.visitorData;
  const auth = await authHeader();
  if (auth) headers.Authorization = auth;
  const key = cfg.apiKey ? `&key=${encodeURIComponent(cfg.apiKey)}` : '';
  const res = await pageFetch(`${location.origin}/youtubei/v1/${endpoint}?prettyPrint=false${key}`, {
    method: 'POST',
    credentials: 'include',
    headers,
    referrer: `${location.origin}${referrerPath}`,
    body: JSON.stringify({ context: cfg.context, ...body }),
  });
  if (!res.ok) throw new Error(`YouTube antwortet mit Status ${res.status}`);
  return res.json();
}
