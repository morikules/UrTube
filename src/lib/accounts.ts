/**
 * Which YouTube account a view was recorded with. Views store only a short
 * hash of YouTube's internal account ID (no e-mail address); the names seen
 * for those hashes are kept in storage.local under ACCOUNTS_KEY. For now this
 * is only recorded – nothing is filtered by it yet.
 */
export const ACCOUNTS_KEY = 'accounts';
/** Views recorded while logged out of YouTube. */
export const LOGGED_OUT = 'anon';

export interface AccountInfo {
  name?: string;
  /** "@handle" of the account's channel, if any. */
  handle?: string;
  firstSeen: number;
  lastSeen: number;
}

/** Short, stable key for an account ID: the first 12 hex digits of its SHA-256. */
export async function accountKey(accountId: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(accountId));
  return [...new Uint8Array(hash).slice(0, 6)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
