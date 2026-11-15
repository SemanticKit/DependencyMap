/* The build of the page. The parts of the page are in web/: one file for each view and each component. Vite puts
   them together into dist/, and server.js serves dist/. */
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  root: 'web',
  base: './',
  plugins: [vue()],
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
});
