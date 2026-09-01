import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['iife'],
      name: 'AccessPathEmbed',
      fileName: () => 'embed.js',
    },
    outDir: 'dist',
    cssCodeSplit: false,
  },
});
