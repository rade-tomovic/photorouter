// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://photorouter.pages.dev',
  trailingSlash: 'always',
  vite: {
    plugins: [tailwindcss()],
    // Keep every script a separate file, however small, so pages hold script-src 'self'.
    build: { assetsInlineLimit: (file) => (/\.[cm]?[jt]s$/.test(file) ? false : undefined) },
  },
  integrations: [react(), sitemap()],
});
