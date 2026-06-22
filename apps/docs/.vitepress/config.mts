import { defineConfig, type DefaultTheme } from 'vitepress';

// `SITE_URL` lets preview deployments override the canonical hostname at
// build time. Default is the production URL.
const SITE_URL = process.env.SITE_URL ?? 'https://docs.archora.dev';

const sharedThemeConfig: Partial<DefaultTheme.Config> = {
  socialLinks: [{ icon: 'github', link: 'https://github.com/archora-dev/archora' }],
  search: { provider: 'local' },
};

const enThemeConfig: DefaultTheme.Config = {
  ...sharedThemeConfig,
  nav: [
    { text: 'Guide', link: '/guide/getting-started', activeMatch: '/guide/' },
    { text: 'CLI', link: '/cli/', activeMatch: '/cli/' },
    { text: 'How it works', link: '/how-it-works/', activeMatch: '/how-it-works/' },
    {
      text: 'More',
      items: [
        { text: 'FAQ', link: '/faq' },
        { text: 'Troubleshooting', link: '/troubleshooting' },
        { text: 'Changelog', link: '/changelog' },
        { text: 'Privacy', link: '/privacy' },
        { text: 'Security', link: '/security' },
      ],
    },
  ],
  sidebar: {
    '/guide/': [
      {
        text: 'Guide',
        items: [
          { text: 'Getting Started', link: '/guide/getting-started' },
          { text: 'Installation', link: '/guide/installation' },
          { text: 'First Scan', link: '/guide/first-scan' },
          { text: 'Cockpit surfaces', link: '/guide/cockpit-surfaces' },
          { text: 'Architecture Workspace', link: '/guide/working-with-graph' },
          { text: 'Reports', link: '/guide/reports' },
          { text: 'Configuration', link: '/guide/configuration' },
          { text: 'Desktop release', link: '/guide/desktop-release' },
          { text: 'Licensing flow', link: '/guide/licensing' },
          { text: 'Demo script', link: '/guide/demo-script' },
          { text: 'Compared to madge / dependency-cruiser', link: '/guide/comparison' },
        ],
      },
    ],
    '/cli/': [
      {
        text: 'CLI',
        items: [
          { text: 'Overview', link: '/cli/' },
          { text: 'analyze', link: '/cli/analyze' },
          { text: 'check', link: '/cli/check' },
          { text: 'diff', link: '/cli/diff' },
          { text: 'report', link: '/cli/report' },
          { text: 'matrix / impact / explain', link: '/cli/views' },
          { text: 'Exit codes', link: '/cli/exit-codes' },
          { text: 'CI integration', link: '/cli/ci' },
        ],
      },
    ],
    '/how-it-works/': [
      {
        text: 'How it works',
        items: [
          { text: 'Overview', link: '/how-it-works/' },
          { text: 'Cycle detection', link: '/how-it-works/cycles' },
          { text: 'Hot zones', link: '/how-it-works/hot-zones' },
          { text: 'Layered architecture', link: '/how-it-works/layers' },
          { text: 'Feedback Arc Set', link: '/how-it-works/feedback-arc-set' },
          { text: 'Recommendations', link: '/how-it-works/recommendations' },
        ],
      },
    ],
  },
  footer: {
    message:
      'Core and CLI are <a href="https://github.com/archora-dev/archora/blob/main/LICENSE">Apache-2.0</a>. The desktop app is a paid product.',
    copyright: 'Copyright © 2026 Aleksandr Kotov',
  },
  editLink: {
    pattern: 'https://github.com/archora-dev/archora/edit/main/apps/docs/:path',
    text: 'Edit this page on GitHub',
  },
};

export default defineConfig({
  cleanUrls: true,
  lastUpdated: true,
  sitemap: { hostname: SITE_URL },

  head: [
    ['link', { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' }],
    ['meta', { name: 'theme-color', content: '#3b82f6' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'Archora' }],
    [
      'meta',
      {
        property: 'og:description',
        content: 'Architectural reconnaissance for large frontend codebases.',
      },
    ],
    ['meta', { property: 'og:image', content: `${SITE_URL}/og.svg` }],
    ['meta', { property: 'og:url', content: SITE_URL }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:title', content: 'Archora' }],
    [
      'meta',
      {
        name: 'twitter:description',
        content: 'Architectural reconnaissance for large frontend codebases.',
      },
    ],
    ['meta', { name: 'twitter:image', content: `${SITE_URL}/og.svg` }],
  ],

  locales: {
    root: {
      label: 'English',
      lang: 'en',
      title: 'Archora',
      description: 'Architectural reconnaissance for large frontend codebases.',
      themeConfig: enThemeConfig,
    },
  },
});
