import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'AcquisSDK',
      fileName: 'card-sdk',
      formats: ['es', 'umd'],
    },
    rollupOptions: {
      external: [],
    },
    sourcemap: true,
  },
});
