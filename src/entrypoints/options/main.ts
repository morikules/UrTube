import { mount } from 'svelte';
import { appName, setLanguage, t } from '@/lib/i18n';
import { loadSettings } from '@/lib/settings';
import App from './App.svelte';
import '@/assets/ui.css';

// The language must be known before the first text is rendered.
loadSettings().then((settings) => {
  setLanguage(settings.language);
  document.title = t.app.pageTitle(appName());
  mount(App, { target: document.getElementById('app')! });
});
