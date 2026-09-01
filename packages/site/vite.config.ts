import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        license: resolve(__dirname, 'license.html'),
        privacy: resolve(__dirname, 'privacy.html'),
        terms: resolve(__dirname, 'terms.html'),
        accessibilityGuide: resolve(__dirname, 'accessibility-guide.html'),
        integrationGuide: resolve(__dirname, 'integration-guide.html'),
      },
    },
  },
});
