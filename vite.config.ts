import { configDefaults, defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';

function normalizeProxyMountPath(raw: string): string {
  const trimmed = (raw || '').replace(/\/+$/, '');
  if (!trimmed || trimmed === '/') return '';
  if (trimmed === '/api') return '';
  if (trimmed.endsWith('/api')) {
    const withoutApi = trimmed.slice(0, -'/api'.length);
    return withoutApi && withoutApi !== '/' ? withoutApi : '';
  }
  return trimmed;
}

function joinPath(prefix: string, path: string): string {
  const base = (prefix || '').replace(/\/+$/, '');
  const suffix = (path || '').startsWith('/') ? String(path || '') : `/${String(path || '')}`;
  if (!base) return suffix || '/';
  return `${base}${suffix || '/'}`;
}

export default defineConfig(({ mode }) => {
  // Standalone UI repo should resolve env from its own root.
  const env = loadEnv(mode, __dirname, '');

  const portStr = env.VITE_PORT || process.env.VITE_PORT || '5173';
  const parsedPort = Number(portStr);
  if (!Number.isFinite(parsedPort) || parsedPort <= 0) {
    throw new Error(`VITE_PORT must be a number (received: ${portStr})`);
  }
  const serverPort = parsedPort;

  const apiProxyTarget =
    env.VITE_API_PROXY_TARGET || process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:9000';
  const parsedApiProxyTarget = (() => {
    try {
      return new URL(apiProxyTarget);
    } catch {
      return null;
    }
  })();
  const apiProxyOrigin = parsedApiProxyTarget ? parsedApiProxyTarget.origin : apiProxyTarget;
  const apiProxyMountPath = normalizeProxyMountPath(parsedApiProxyTarget?.pathname || '');

  return {
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) {
              return undefined;
            }

            if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
              return 'react-vendor';
            }
            if (id.includes('node_modules/react-router') || id.includes('node_modules/history/')) {
              return 'router-vendor';
            }
            if (id.includes('node_modules/@tanstack/')) {
              return 'query-vendor';
            }
            if (id.includes('node_modules/@asset-allocation/contracts/')) {
              return 'contracts-vendor';
            }
            if (
              id.includes('node_modules/@reduxjs/') ||
              id.includes('node_modules/react-redux/') ||
              id.includes('node_modules/use-sync-external-store/') ||
              id.includes('node_modules/reselect/') ||
              id.includes('node_modules/immer/') ||
              id.includes('node_modules/es-toolkit/') ||
              id.includes('node_modules/decimal.js-light/') ||
              id.includes('node_modules/eventemitter3/') ||
              id.includes('node_modules/tiny-invariant/')
            ) {
              return 'chart-state-vendor';
            }
            // Leave Recharts on Rollup's default chunking; custom splits created circular runtime imports.
            if (id.includes('node_modules/d3-') || id.includes('node_modules/victory-vendor/')) {
              return 'chart-math-vendor';
            }
            if (id.includes('node_modules/@radix-ui/') || id.includes('node_modules/vaul/')) {
              return 'radix-vendor';
            }
            if (
              id.includes('node_modules/cmdk/') ||
              id.includes('node_modules/embla-carousel-react/') ||
              id.includes('node_modules/react-day-picker/') ||
              id.includes('node_modules/react-responsive-masonry/') ||
              id.includes('node_modules/react-resizable-panels/') ||
              id.includes('node_modules/react-slick/') ||
              id.includes('node_modules/react-virtualized-auto-sizer/') ||
              id.includes('node_modules/react-window/') ||
              id.includes('node_modules/motion/')
            ) {
              return 'ui-misc-vendor';
            }
            if (
              id.includes('node_modules/react-dnd/') ||
              id.includes('node_modules/react-dnd-html5-backend/')
            ) {
              return 'dnd-vendor';
            }
            if (id.includes('node_modules/lucide-react/')) {
              return 'icons-vendor';
            }
            return undefined;
          }
        }
      }
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      css: false,
      testTimeout: 15000,
      hookTimeout: 15000,
      fileParallelism: false,
      exclude: [...configDefaults.exclude, '**/.pnpm-store/**', 'e2e/**']
    },
    plugins: [
      // The React and Tailwind plugins are both required for Make, even if
      // Tailwind is not being actively used – do not remove them
      react(),
      tailwindcss()
    ],
    server: {
      port: serverPort,
      strictPort: true,
      proxy: {
        '/healthz': {
          target: apiProxyOrigin,
          changeOrigin: true
        },
        '/readyz': {
          target: apiProxyOrigin,
          changeOrigin: true
        },
        '/api': {
          target: apiProxyOrigin,
          changeOrigin: true,
          ws: true,
          rewrite: (path) => joinPath(apiProxyMountPath, path)
        }
      }
    },
    resolve: {
      alias: {
        // Alias @ to the src directory
        '@': path.resolve(__dirname, './src')
      }
    }
  };
});
