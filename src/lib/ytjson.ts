/** Helpers for reading YouTube's internal JSON responses (history, playlists). */

export type Json = Record<string, unknown>;

export const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null;

/** Text from YouTube's text objects: {simpleText}, {content} or {runs: [{text}]}. */
export function text(v: unknown): string | undefined {
  if (!isObj(v)) return undefined;
  if (typeof v.simpleText === 'string') return v.simpleText;
  if (typeof v.content === 'string') return v.content;
  if (Array.isArray(v.runs)) return v.runs.map((r) => (isObj(r) ? String(r.text ?? '') : '')).join('');
  return undefined;
}

/** Path to an object below `node`, e.g. path(x, 'a', 'b') = x.a.b. */
function path(node: unknown, ...keys: string[]): unknown {
  let n = node;
  for (const k of keys) n = isObj(n) ? n[k] : undefined;
  return n;
}

/**
 * Token for the next page anywhere below `node`. Old layout:
 * continuationItemRenderer.continuationEndpoint.continuationCommand.token;
 * new layout (playlists since 2026): continuationItemViewModel.continuationCommand
 * .innertubeCommand.continuationCommand.token.
 */
export function findContinuation(node: unknown): string | undefined {
  if (Array.isArray(node)) {
    for (const n of node) {
      const t = findContinuation(n);
      if (t) return t;
    }
    return undefined;
  }
  if (!isObj(node)) return undefined;
  const token =
    path(node, 'continuationItemRenderer', 'continuationEndpoint', 'continuationCommand', 'token') ??
    path(node, 'continuationItemViewModel', 'continuationCommand', 'innertubeCommand', 'continuationCommand', 'token') ??
    path(node, 'continuationItemViewModel', 'continuationCommand', 'continuationCommand', 'token');
  if (typeof token === 'string') return token;
  for (const value of Object.values(node)) {
    const t = findContinuation(value);
    if (t) return t;
  }
  return undefined;
}

/** Calls `fn` for every property below `node`, in document order. */
export function walkKeys(node: unknown, fn: (key: string, value: unknown) => void): void {
  if (Array.isArray(node)) {
    for (const n of node) walkKeys(n, fn);
    return;
  }
  if (!isObj(node)) return;
  for (const [k, v] of Object.entries(node)) {
    fn(k, v);
    walkKeys(v, fn);
  }
}

/** Calls `fn` for every object below `node` that has the property `key`. */
export function walkKey(node: unknown, key: string, fn: (value: unknown) => void): void {
  if (Array.isArray(node)) {
    for (const n of node) walkKey(n, key, fn);
    return;
  }
  if (!isObj(node)) return;
  for (const [k, v] of Object.entries(node)) {
    if (k === key) fn(v);
    else walkKey(v, key, fn);
  }
}
