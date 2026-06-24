import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// NOTE: For a GitHub *project* page the site is served under /open-ai-course-atlas/.
// If deploying to a user/org page or a custom domain, set base: '/' and update site.
export default defineConfig({
  site: 'https://example.github.io',
  base: '/open-ai-course-atlas',
  vite: { plugins: [tailwindcss()] },
});
