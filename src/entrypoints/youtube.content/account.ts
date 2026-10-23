/**
 * The YouTube account of this tab (see lib/accounts.ts), read from the page's
 * configuration. Its name is asked from YouTube once and kept with the key.
 */
import { ACCOUNTS_KEY, LOGGED_OUT, accountKey, type AccountInfo } from '@/lib/accounts';
import { text, walkKey } from '@/lib/ytjson';
import { innertube, readConfig } from './innertube';

let cached: Promise<string | undefined> | undefined;

/** Key of the account this tab is logged in with, "anon" when logged out; undefined if unknown. */
export function currentAccount(): Promise<string | undefined> {
  cached ??= (async () => {
    try {
      const cfg = (window as unknown as { wrappedJSObject?: any }).wrappedJSObject?.ytcfg;
      if (!cfg?.get) return undefined;
      if (cfg.get('LOGGED_IN') === false) return LOGGED_OUT;
      const id = cfg.get('DATASYNC_ID');
      if (typeof id !== 'string' || !id) return undefined;
      const key = await accountKey(id);
      remember(key);
      return key;
    } catch {
      return undefined;
    }
  })();
  return cached;
}

/** Notes the account as seen; asks YouTube for its name the first time. */
async function remember(key: string): Promise<void> {
  const stored = ((await browser.storage.local.get(ACCOUNTS_KEY))[ACCOUNTS_KEY] as Record<string, AccountInfo>) ?? {};
  const now = Date.now();
  const info: AccountInfo = { ...stored[key], firstSeen: stored[key]?.firstSeen ?? now, lastSeen: now };
  if (!info.name) {
    try {
      const menu = await innertube(readConfig(), 'account/account_menu', {}, location.pathname);
      walkKey(menu, 'activeAccountHeaderRenderer', (h) => {
        const header = h as { accountName?: unknown; channelHandle?: unknown };
        info.name ??= text(header.accountName);
        info.handle ??= text(header.channelHandle);
      });
    } catch {
      // name stays unknown; asked again on the next page load
    }
  }
  await browser.storage.local.set({ [ACCOUNTS_KEY]: { ...stored, [key]: info } });
}
