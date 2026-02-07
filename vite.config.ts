import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: 'src/index.ts',
    outDir: 'dist',
    target: 'node20',
    minify: true,
    rollupOptions: {
      output: {
        banner: '#!/usr/bin/env node',
      },
    },
  },
});
