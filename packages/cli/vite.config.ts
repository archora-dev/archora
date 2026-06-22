import { builtinModules } from 'node:module';
import path from 'node:path';
import { defineConfig } from 'vite';

const nodeBuiltins = builtinModules.flatMap((name) => [name, `node:${name}`]);

export default defineConfig({
  resolve: {
    alias: {
      '@archora/core': path.resolve(__dirname, '../core/src'),
    },
  },
  build: {
    emptyOutDir: true,
    outDir: 'dist',
    ssr: 'src/index.ts',
    target: 'node20',
    rollupOptions: {
      external: nodeBuiltins,
      output: {
        entryFileNames: 'index.js',
      },
    },
  },
});
