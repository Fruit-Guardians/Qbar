<template>
  <section
    id="settings-about"
    class="about-qbar"
    :aria-label="$t('About QBar')"
  >
    <header class="about-brand">
      <img src="/icon.svg" alt="QBar" width="40" height="40" />
      <div>
        <h2>QBar</h2>
        <p>{{ $t('HTTP request workbench') }}</p>
      </div>
      <span class="about-version"
        >{{ $t('Version') }} {{ packageJson.version }}</span
      >
    </header>
    <p class="about-lead">
      {{ $t('Inspect, edit, and send. Right in DevTools.') }}
    </p>
    <p class="about-description">
      {{
        $t(
          'A focused HTTP workspace for everyday debugging. Load a page request, adjust its URL, headers and body, then inspect the response — without leaving your browser.',
        )
      }}
    </p>
    <div class="about-capabilities" :aria-label="$t('Core features')">
      <span>{{ $t('Basic & Raw') }}</span
      ><span>cURL</span><span>{{ $t('JSON & JWT') }}</span
      ><span>{{ $t('Request history') }}</span>
    </div>
    <h3>{{ $t('Project') }}</h3>
    <nav class="about-links" :aria-label="$t('Project links')">
      <a
        v-for="link in links"
        :key="link.href"
        :href="link.href"
        target="_blank"
        rel="noopener noreferrer"
        ><VIcon :icon="link.icon" size="18" /><span
          ><strong>{{ $t(link.label) }}</strong
          ><small>{{ $t(link.description) }}</small></span
        ><VIcon :icon="mdiOpenInNew" size="14" class="about-external"
      /></a>
    </nav>
    <section class="about-data" aria-labelledby="about-data-title">
      <h3 id="about-data-title">{{ $t('Your workspace, on this device') }}</h3>
      <p>
        {{
          $t(
            'History stores request headers and bodies locally, including any credentials they contain. Response bodies are not saved. JWT keys and comparison baselines stay in memory.',
          )
        }}
      </p>
      <p class="about-note">
        {{
          $t(
            'Chrome and Firefox DevTools · Project links open an external website. Credits and dependency notices are maintained in NOTICE.md.',
          )
        }}
      </p>
    </section>
  </section>
</template>

<script setup lang="ts">
import {
  mdiBookOpenOutline,
  mdiCodeBraces,
  mdiMessageAlertOutline,
  mdiOpenInNew,
  mdiTextBoxOutline,
} from '@mdi/js'
import packageJson from '../../../package.json'
const repo = 'https://github.com/Fruit-Guardians/Qbar'
const links = [
  {
    label: 'Repository',
    description: 'Fruit-Guardians / Qbar',
    href: repo,
    icon: mdiCodeBraces,
  },
  {
    label: 'Usage guide',
    description: 'Installation, requests and tools',
    href: `${repo}/blob/main/docs/usage.md`,
    icon: mdiBookOpenOutline,
  },
  {
    label: 'Report an issue',
    description: 'Bugs and feature requests',
    href: `${repo}/issues`,
    icon: mdiMessageAlertOutline,
  },
  {
    label: 'Credits & notices',
    description: 'Project and third-party acknowledgements',
    href: `${repo}/blob/main/NOTICE.md`,
    icon: mdiTextBoxOutline,
  },
]
</script>

<style lang="scss" scoped>
.about-qbar {
  max-width: 680px;
  color: var(--native-text);
}
.about-brand {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 2px 0 24px;
  h2 {
    font-size: 22px;
    line-height: 28px;
    font-weight: 500;
    margin: 0;
  }
  p {
    color: var(--native-muted);
    font-size: 12px;
    line-height: 20px;
  }
}
.about-version {
  margin-left: auto;
  color: var(--native-muted);
  padding: 4px 8px;
  border: 1px solid var(--native-border);
  border-radius: 6px;
  font-size: 12px;
  white-space: nowrap;
}
.about-lead {
  font-size: 16px;
  line-height: 24px;
  font-weight: 500;
  margin-bottom: 8px;
}
.about-description {
  font-size: 13px;
  line-height: 21px;
  color: var(--native-muted);
  max-width: 64ch;
}
.about-capabilities {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 16px 0 28px;
  span {
    font-size: 11px;
    line-height: 22px;
    color: var(--native-muted);
    background: var(--native-surface-raised);
    padding: 0 8px;
    border-radius: 4px;
  }
}
h3 {
  font-size: 13px;
  line-height: 20px;
  font-weight: 600;
  margin: 0 0 10px;
}
.about-links {
  border: 1px solid var(--native-border-subtle);
  border-radius: 8px;
  overflow: hidden;
  background: var(--native-surface);
  a {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 16px;
    min-height: 60px;
    color: var(--native-muted);
    text-decoration: none;
    border-bottom: 1px solid var(--native-border-subtle);
  }
  a:last-child {
    border-bottom: 0;
  }
  a:hover,
  a:focus-visible {
    background: var(--native-hover);
    outline-offset: -2px;
  }
  strong {
    display: block;
    color: var(--native-primary);
    font-weight: 500;
    font-size: 13px;
    line-height: 20px;
  }
  small {
    display: block;
    color: var(--native-muted);
    font-size: 12px;
    line-height: 18px;
  }
  .about-external {
    margin-left: auto;
    flex-shrink: 0;
  }
}
.about-data {
  margin-top: 28px;
  p {
    color: var(--native-muted);
    font-size: 12px;
    line-height: 20px;
  }
  .about-note {
    margin-top: 10px;
    font-size: 11px;
  }
}
@media (max-width: 440px) {
  .about-brand {
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 20px;
  }
  .about-version {
    margin-left: 0;
  }
  .about-lead {
    font-size: 15px;
  }
  .about-links a {
    padding: 10px 12px;
    gap: 10px;
  }
}
</style>
