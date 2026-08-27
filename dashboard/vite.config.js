import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, '../shared'),
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: false },   // no SW in dev — prevents stale cache issues
      includeAssets: ['favicon.ico'],
      workbox: {
        // Never intercept navigation requests to /api/ — OAuth redirects must reach the server
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            // Only cache GET responses — POST/PATCH/DELETE must never be intercepted
            urlPattern: ({ url, request }) =>
              url.pathname.startsWith('/api/') && request.method === 'GET',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 200, maxAgeSeconds: 86400 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: 'Cooklyt — Dashboard',
        short_name: 'POS Dashboard',
        description: 'Restaurant POS management dashboard',
        theme_color: '#0A0A0A',
        background_color: '#FAFAF8',
        display: 'standalone',
        start_url: '/',
      },
    }),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'http://localhost:3000',
        ws: true,
        changeOrigin: false,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            // ECONNABORTED / ECONNRESET / EPIPE all mean the browser tab closed
            // or refreshed before the socket was fully torn down — harmless in dev.
            if (['ECONNABORTED', 'ECONNRESET', 'EPIPE'].includes(err.code)) return;
            console.error('[ws proxy]', err.message);
          });
        },
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});