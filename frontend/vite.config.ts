import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const apiProxy = {
  '/api': {
    target: 'http://localhost:5000',
    changeOrigin: true,
  },
  '/health': {
    target: 'http://localhost:5000',
    changeOrigin: true,
  },
  '/socket.io': {
    target: 'http://localhost:5000',
    ws: true,
    changeOrigin: true,
  },
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isDev = mode === 'development'

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        manifest: {
          name: 'EdBase Student Management System',
          short_name: 'EdBase',
          description: 'Offline-capable Student & Academic Management Platform',
          theme_color: '#4f46e5',
          background_color: '#fafafa',
          display: 'standalone',
          start_url: '/',
          icons: [
            {
              src: '/favicon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any maskable',
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'classic',
          navigateFallback: '/index.html',
          navigateFallbackAllowlist: [/^(?!\/(?:api|socket\.io|health)\b)/],
          suppressWarnings: true,
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//, /^\/socket\.io\//, /^\/health$/],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          runtimeCaching: [
            {
              urlPattern: ({ url }) =>
                url.pathname.startsWith('/api/') ||
                url.pathname.startsWith('/socket.io/') ||
                url.pathname === '/health',
              handler: 'NetworkOnly',
            },
            ...(isDev
              ? [
                  {
                    urlPattern: ({
                      sameOrigin,
                      url,
                      request,
                    }: {
                      sameOrigin: boolean
                      url: URL
                      request: Request
                    }) =>
                      sameOrigin &&
                      (url.pathname.startsWith('/src/') ||
                        url.pathname.startsWith('/@') ||
                        url.pathname.startsWith('/node_modules/') ||
                        url.pathname === '/manifest.webmanifest' ||
                        url.pathname === '/favicon.svg' ||
                        request.destination === 'script' ||
                        request.destination === 'style' ||
                        request.destination === 'manifest'),
                    handler: 'NetworkFirst' as const,
                    options: {
                      cacheName: 'edbase-vite-dev-modules',
                      networkTimeoutSeconds: 2,
                      matchOptions: {
                        ignoreVary: true,
                      },
                      cacheableResponse: {
                        statuses: [0, 200],
                      },
                      expiration: {
                        maxEntries: 5000,
                        maxAgeSeconds: 60 * 60 * 24,
                      },
                    },
                  },
                ]
              : []),
            {
              urlPattern: ({ request, url }) =>
                request.destination === 'style' ||
                request.destination === 'script' ||
                request.destination === 'font' ||
                request.destination === 'image' ||
                request.destination === 'manifest' ||
                url.pathname === '/manifest.webmanifest' ||
                url.pathname === '/favicon.svg',
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'edbase-static-assets',
                matchOptions: {
                  ignoreVary: true,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
                expiration: {
                  maxEntries: 300,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
              },
            },
          ],
        },
      }),
    ],
    build: {
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: 'xlsx',
                test: /node_modules[\\/]xlsx/,
                priority: 10,
              },
              {
                name: 'charts',
                test: /node_modules[\\/](recharts|d3-|victory-vendor)/,
                priority: 9,
              },
              {
                name: 'offline',
                test: /node_modules[\\/]dexie/,
                priority: 8,
              },
              {
                name: 'icons',
                test: /node_modules[\\/]lucide-react/,
                priority: 7,
              },
              {
                name: 'socket',
                test: /node_modules[\\/](socket\.io-client|engine\.io-client)/,
                priority: 6,
              },
              {
                name: 'react-vendor',
                test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|@tanstack|zustand)/,
                priority: 5,
              },
            ],
          },
        },
      },
    },
    server: {
      proxy: apiProxy,
    },
    preview: {
      proxy: apiProxy,
    },
  }
})
