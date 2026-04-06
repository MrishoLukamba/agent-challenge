import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const dir = path.dirname(fileURLToPath(import.meta.url));

/** Maps `@noble/hashes/foo.js` → ESM file (package exports omit the `.js` suffix). */
function nobleHashesResolve() {
  return {
    name: 'zerem-noble-hashes-resolve',
    enforce: 'pre' as const,
    resolveId(id: string) {
      const m = id.match(/^@noble\/hashes\/(.+)\.js$/);
      if (!m || m[1].includes('/')) return undefined;
      const file = path.join(dir, 'node_modules', '@noble', 'hashes', 'esm', `${m[1]}.js`);
      return file;
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [nobleHashesResolve(), react()],
  publicDir: 'public',
  build: {
    rollupOptions: {
      input: {
        popup: path.resolve(dir, 'popup.html'),
        background: path.resolve(dir, 'src/background/service-worker.ts'),
        tracker: path.resolve(dir, 'src/content/tracker.ts'),
      },
      output: {
        entryFileNames(chunkInfo) {
          if (chunkInfo.name === 'background') return 'background/service-worker.js';
          if (chunkInfo.name === 'tracker') return 'content/tracker.js';
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/chunk-[name]-[hash].js',
        assetFileNames: 'assets/asset-[name]-[hash][extname]',
      },
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
  resolve: {
    dedupe: ['react', 'react-dom', '@noble/hashes'],
  },
  optimizeDeps: {
    include: ['@dynamic-labs/sdk-react-core', '@dynamic-labs/solana', '@solana/web3.js'],
  },
});
