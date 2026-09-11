import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@openfield/core'] })],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].js' } } },
  },
  renderer: {},
});
