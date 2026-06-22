import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';

// Cytoscape удалён из dependencies. Раньше vite держал
// virtual:cytoscape-source / cytoscape-fcose-source plugin для inline'а
// UMD-бандлов в standalone HTML отчёт; теперь buildHtmlReport генерирует
// чистый SVG (pre-computed концентрический layout) с DOM-event handlers
// для pan/zoom. UMD-бандлов больше нет → vendor plugin тоже не нужен.

export default defineConfig({
  plugins: [vue()],
  build: {
    chunkSizeWarningLimit: 4500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/typescript/')) return 'vendor-typescript';
          if (id.includes('/node_modules/@vue/compiler-sfc/')) return 'vendor-vue-compiler';
          if (
            id.includes('/node_modules/vue/') ||
            id.includes('/node_modules/@vue/runtime-') ||
            id.includes('/node_modules/@vue/reactivity/') ||
            id.includes('/node_modules/@vue/shared/')
          ) {
            return 'vendor-vue';
          }
          if (id.includes('/node_modules/pinia/') || id.includes('/node_modules/vue-router/')) {
            return 'vendor-vue';
          }
          if (id.includes('/packages/core/src/codegen/')) return 'core-codegen';
          return undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      // Order matters: longer prefixes first so '@/core' is matched before
      // the catch-all '@'. Vite resolves aliases in declaration order.
      '@/core': path.resolve(__dirname, 'packages/core/src'),
      '@archora/core': path.resolve(__dirname, 'packages/core/src'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'happy-dom',
    globals: false,
    include: [
      'src/**/*.{test,spec}.ts',
      'packages/core/src/**/*.{test,spec}.ts',
      'packages/cli/src/**/*.{test,spec}.ts',
    ],
    coverage: {
      provider: 'v8',
      // Gate on core/analyzer only. Branch threshold is lower because
      // defensive early-returns are hard to hit without crafted bad AST.
      include: ['packages/core/src/analyzer/**/*.ts'],
      exclude: [
        '**/__tests__/**',
        '**/*.test.ts',
        // Type-only - v8 reports 0% after TS erasure.
        'packages/core/src/analyzer/types.ts',
        'packages/core/src/analyzer/fileSource.ts',
      ],
      reporter: ['text', 'json-summary'],
      thresholds: {
        statements: 80,
        lines: 80,
        functions: 80,
        branches: 75,
      },
    },
  },
});
