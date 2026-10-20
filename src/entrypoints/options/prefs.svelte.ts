/**
 * Settings shared by all panes of the options page. Changes made elsewhere
 * (e.g. the switch on YouTube) are picked up, so they are never overwritten.
 */
import { loadSettings, onSettingsChanged, saveSettings, type Settings } from '@/lib/settings';

export const prefs = $state<{ s: Settings | null }>({ s: null });

loadSettings().then((s) => (prefs.s = s));
onSettingsChanged((s) => {
  // Texts are not re-rendered one by one: a new language reloads the page.
  if (prefs.s && s.language !== prefs.s.language) location.reload();
  prefs.s = s;
});

export async function setPref<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
  if (!prefs.s) return;
  prefs.s[key] = value;
  await saveSettings($state.snapshot(prefs.s) as Settings);
}

/** Runs an action with busy state and shows its result or error (see Notice.svelte). */
export function createRunner() {
  const state = $state({ message: '', error: '', busy: false });
  async function run(action: () => Promise<string>): Promise<void> {
    state.busy = true;
    state.message = '';
    state.error = '';
    try {
      state.message = await action();
    } catch (e) {
      state.error = String(e instanceof Error ? e.message : e);
    } finally {
      state.busy = false;
    }
  }
  return { state, run };
}

export { n } from '@/lib/i18n';
