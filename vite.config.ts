import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = env.VITE_BASE_PATH || '/kalendarz-oznaczen-/';
  return {
    base, plugins: [react(), VitePWA({
      registerType: 'prompt', injectRegister: null,
      includeAssets: ['apple-touch-icon.png', 'icon-192.png', 'icon-512.png'],
      manifest: { name: 'Mój kalendarz', short_name: 'Kalendarz', lang: 'pl',
        display: 'standalone', start_url: base + '#/calendar', scope: base,
        theme_color: '#F7F7F5', background_color: '#F7F7F5',
        icons: [192, 512].map(size => ({ src: `icon-${size}.png`, sizes: `${size}x${size}`, type: 'image/png' }))
      },
      workbox: { globPatterns: ['**/*.{js,css,html,png,json,svg,woff2}'],
        navigateFallback: 'index.html', navigateFallbackDenylist: [/\/auth\//, /\/functions\//, /\/rest\//],
        cleanupOutdatedCaches: true, runtimeCaching: [] }
    })],
  };
});
