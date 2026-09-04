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
        notFound: resolve(__dirname, '404.html'),
        react: resolve(__dirname, 'react.html'),
        wordpress: resolve(__dirname, 'wordpress.html'),
        vsUserway: resolve(__dirname, 'vs-userway.html'),
      },
    },
  },
});
