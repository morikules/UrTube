import { defineConfig } from 'wxt';

// See https://wxt.dev/api/reference/wxt/interfaces/inlineconfig.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  zip: {
    // The sources archive is uploaded to addons.mozilla.org: never include secrets or data.
    excludeSources: ['.env', '.env.*', 'signed/**', '**/*.database', 'data/**'],
  },
  manifest: {
    // Texts in public/_locales (English default, German).
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    // Toolbar button without popup: a click opens the add-on page (see background.ts).
    action: {
      default_title: '__MSG_actionTitle__',
      default_icon: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png' },
    },
    // No "tabs": YouTube tabs are found through the host permission below.
    permissions: ['storage', 'unlimitedStorage', 'alarms'],
    // Requested only when the user enables "browser history" in the settings.
    optional_permissions: ['history'],
    host_permissions: ['*://*.youtube.com/*'],
    browser_specific_settings: {
      gecko: {
        // Fixed ID so the extension (and its database) stays the same across reloads.
        // Changing it later would make Firefox treat it as a new add-on (data loss).
        id: 'youtube-tracker@privat.local',
        // Required by addons.mozilla.org: nothing leaves the browser.
        data_collection_permissions: { required: ['none'] },
      },
    },
  },
});
