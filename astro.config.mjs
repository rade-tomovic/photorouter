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
    // The planner's packages are only found when /app/ is first opened in dev, which makes Vite
    // re-bundle them mid-load and fail the page with "Outdated Optimize Dep". Bundle them up front.
    optimizeDeps: { include: ['react', 'react-dom/client', 'react/jsx-dev-runtime', 'lucide-react', 'maplibre-gl', 'zustand'] },
  },
  integrations: [react(), sitemap()],
});
