<script lang="ts">
  import { appName, t } from '@/lib/i18n';

  const A = t.about;
  const REPO = 'https://github.com/morikules/UrTube';
  /** AMO resolves the add-on by its ID. */
  const REVIEWS = `https://addons.mozilla.org/firefox/addon/${encodeURIComponent(browser.runtime.id)}/reviews/`;
  const manifest = browser.runtime.getManifest();
  const icon = browser.runtime.getURL('/icon/128.png');

  const credits = [
    {
      name: 'YouTube Watchmarker',
      author: 'Simon Niklaus',
      url: 'https://github.com/sniklaus/youtube-watchmarker',
      text: A.credits.watchmarker,
    },
    {
      name: 'Better Subscriptions for YouTube',
      author: 'Oscar Hernandez (OsaSoft)',
      url: 'https://github.com/OsaSoft/youtube-better-subscriptions',
      text: A.credits.betterSubs,
    },
    {
      name: 'Youtube Fullscreen Mode',
      author: 'ndaesik',
      url: 'https://greasyfork.org/scripts/434075-youtube-fullscreen-mode',
      text: A.credits.fullscreen,
    },
  ];
</script>

<div class="about">
  <section class="intro">
    <img src={icon} alt="" width="56" height="56" />
    <div>
      <h2>{appName()} <span class="version">{A.version(manifest.version)}</span></h2>
      <p class="tagline">{A.tagline}</p>
      <p class="lead">{A.lead}</p>
      <p class="lead muted">{A.lead2}</p>
      <a class="button" href="#welcome">{A.showWelcome}</a>
    </div>
  </section>

  <section>
    <h3>{A.featuresTitle}</h3>
    <div class="grid">
      {#each A.features as [title, text]}
        <div class="tile">
          <b>{title}</b>
          <p>{text}</p>
        </div>
      {/each}
    </div>
  </section>

  <section>
    <h3>{A.privacyTitle}</h3>
    <div class="box privacy">
      <p class="claim">{A.privacyClaim}</p>
      <ul>
        {#each A.privacy as p}
          <li>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" /></svg>
            <span>{p}</span>
          </li>
        {/each}
      </ul>
    </div>
  </section>

  <section>
    <h3>{A.faqTitle}</h3>
    <div class="box faq">
      {#each A.faq as [q, a]}
        <details>
          <summary>{q}</summary>
          <p>{a}</p>
        </details>
      {/each}
    </div>
  </section>

  <section>
    <h3>{A.feedbackTitle}</h3>
    <p class="muted">{A.feedbackText}</p>
    <div class="buttons">
      <a class="button" href={`${REPO}/issues/new?template=bug.yml`} target="_blank" rel="noreferrer">{A.feedbackBug}</a>
      <a class="button" href={`${REPO}/issues/new?template=idea.yml`} target="_blank" rel="noreferrer">{A.feedbackIdea}</a>
      <a class="button" href={REVIEWS} target="_blank" rel="noreferrer">{A.feedbackReview}</a>
    </div>
  </section>

  <section>
    <h3>{A.creditsTitle}</h3>
    <p class="muted">{A.creditsIntro}</p>
    <div class="grid">
      {#each credits as c}
        <a class="tile link" href={c.url} target="_blank" rel="noreferrer">
          <b>{c.name}</b>
          <span class="author">{A.by(c.author)}</span>
          <p>{c.text}</p>
        </a>
      {/each}
    </div>
  </section>

  <footer class="muted">
    {A.license} {A.madeBy('morikules', 'Claude Opus 5.5')}
    <a href={REPO} target="_blank" rel="noreferrer">GitHub</a>
  </footer>
</div>

<style>
  .about {
    display: flex;
    flex-direction: column;
    gap: 26px;
  }
  section {
    margin: 0;
  }
  h3 {
    margin: 0 0 10px;
    font-size: 1.05em;
  }
  .intro {
    display: flex;
    gap: 18px;
    align-items: flex-start;
    padding-bottom: 22px;
    border-bottom: 1px solid var(--border);
  }
  .intro img {
    flex: none;
    border-radius: 12px;
  }
  .intro h2 {
    margin: 0 0 6px;
    font-size: 1.35em;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 10px;
  }
  .version {
    font-size: 0.55em;
    font-weight: 600;
    color: var(--accent);
    border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
    border-radius: 6px;
    padding: 1px 7px;
  }
  .tagline {
    margin: 0 0 8px;
    color: var(--accent);
    font-weight: 600;
  }
  .buttons a.button {
    text-decoration: none;
  }
  .intro .button {
    display: inline-block;
    margin-top: 8px;
    text-decoration: none;
  }
  .lead {
    margin: 0 0 6px;
    line-height: 1.6;
    max-width: 70ch;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 10px;
  }
  .tile {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 12px 14px;
    border-radius: 10px;
    border: 1px solid var(--border);
    color: inherit;
    text-decoration: none;
  }
  .tile p {
    margin: 3px 0 0;
    color: var(--muted);
    font-size: 0.92em;
    line-height: 1.5;
  }
  .tile.link {
    transition: border-color 0.15s;
  }
  .tile.link:hover {
    border-color: var(--accent);
  }
  .author {
    font-size: 0.88em;
    color: var(--accent);
  }
  .privacy {
    padding: 12px 16px;
  }
  .privacy .claim {
    margin: 0 0 10px;
    font-weight: 600;
  }
  .privacy ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  .privacy li {
    display: flex;
    gap: 10px;
    line-height: 1.5;
  }
  .privacy svg {
    flex: none;
    width: 18px;
    height: 18px;
    margin-top: 2px;
    fill: var(--accent);
  }
  .faq {
    padding: 0 16px;
  }
  .faq details + details {
    border-top: 1px solid var(--border);
  }
  summary {
    cursor: pointer;
    padding: 11px 0;
    font-weight: 600;
    list-style: none;
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary::after {
    content: '+';
    color: var(--muted);
    font-weight: 400;
  }
  details[open] summary::after {
    content: '–';
  }
  summary:hover {
    color: var(--accent);
  }
  details p {
    margin: 0;
    padding: 0 0 12px;
    color: var(--muted);
    line-height: 1.6;
  }
  footer {
    font-size: 0.9em;
    padding-top: 14px;
    border-top: 1px solid var(--border);
  }
  @media (max-width: 560px) {
    .intro {
      flex-direction: column;
    }
  }
</style>
