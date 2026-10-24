import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Standalone local development: the dev server tells the page it runs against a local Boxity (the
// portal does this itself when the game is embedded). Never part of a production build, which is told
// its environment by Boxity. Run with BOXITY_LOCAL_ENV=off to try the dev server against prod instead.
const LOCAL_ENV = { env: 'local', apiUrl: 'http://localhost:4000', playUrl: 'http://localhost:2567', portalUrl: 'http://localhost:3000', staticUrl: 'https://static.bloxity.io' };
const boxityLocalEnv = {
  name: 'boxity-local-env',
  apply: 'serve',
  transformIndexHtml: () => (process.env.BOXITY_LOCAL_ENV === 'off'
    ? []
    : [{ tag: 'script', children: `window.BLOXITY_ENV = ${JSON.stringify(LOCAL_ENV)};`, injectTo: 'head-prepend' }]),
};

export default defineConfig({
  plugins: [react(), boxityLocalEnv],
  base: './',
  server: { port: 5173, host: true },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: { manualChunks: { three: ['three'] } },
    },
  },
});
