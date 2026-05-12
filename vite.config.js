import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'EDGE Trading Journal',
        short_name: 'EDGE Journal',
        description: 'ICT Smart Money Concepts Trading Journal — Cloud Sync, MT5 Integration',
        theme_color: '#0c0e1a',
        background_color: '#0c0e1a',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        icons: [
          { src:'icons/icon-192.png', sizes:'192x192', type:'image/png', purpose:'any maskable' },
          { src:'icons/icon-512.png', sizes:'512x512', type:'image/png', purpose:'any maskable' },
        ],
        shortcuts: [
          { name:'Log Trade', short_name:'Log', url:'/?action=new-trade', description:'Quickly log a trade' }
        ],
        categories: ['finance','productivity'],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName:'fonts-cache', expiration:{ maxEntries:10, maxAgeSeconds:365*24*60*60 } }
          },
        ],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react:    ['react','react-dom'],
          recharts: ['recharts','react-is'],
        }
      }
    }
  }
});
