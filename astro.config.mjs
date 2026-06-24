import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// Deployed on Vercel, which serves at the domain root (base: '/').
// Update `site` to the real domain once Vercel assigns it (e.g. a custom domain).
export default defineConfig({
  site: 'https://open-ai-course-atlas.vercel.app',
  base: '/',
  vite: { plugins: [tailwindcss()] },
});
