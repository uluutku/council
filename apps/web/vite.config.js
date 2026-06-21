import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }

          if (id.includes('@supabase')) {
            return 'supabase';
          }

          if (id.includes('@tanstack')) {
            return 'query';
          }

          if (id.includes('react')) {
            return 'react';
          }

          if (id.includes('zod') || id.includes('zustand')) {
            return 'validation';
          }

          return 'vendor';
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    include: ['src/**/*.{test,spec}.{js,jsx}', 'tests/unit/**/*.{test,spec}.{js,jsx}'],
    restoreMocks: true,
  },
});
