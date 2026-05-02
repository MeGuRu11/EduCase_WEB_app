import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/__tests__/setup.ts',
  },
  server: {
    proxy: { '/api': 'http://localhost:8000' },
  },
});
