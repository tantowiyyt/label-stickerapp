import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Hasil build berupa satu file dist/index.html yang bisa dibuka langsung (offline, tanpa server).
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
});
