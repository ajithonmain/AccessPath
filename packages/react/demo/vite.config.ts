import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  server: { port: 5174 },
  resolve: {
    alias: {
      '@accesspath/react': resolve(__dirname, '../src/index.ts'),
    },
  },
});
