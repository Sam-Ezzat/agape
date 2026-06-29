/**
 * Vite Configuration
 * 
 * WHY: Configure Vite build tool with path aliases, plugins, and dev server
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  
  // WHY: Path aliases for clean imports (e.g., @/components instead of ../../components)
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@services': path.resolve(__dirname, './src/services'),
      '@store': path.resolve(__dirname, './src/store'),
      '@types': path.resolve(__dirname, './src/types'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@lib': path.resolve(__dirname, './src/lib'),
    },
  },
  
  // Development server configuration
  server: {
    port: 5173,
    open: true, // WHY: Auto-open browser on dev server start
    proxy: {
      // WHY: Proxy API requests to backend during development
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  
  // Build configuration
  build: {
    outDir: 'dist',
    sourcemap: true, // WHY: Enable sourcemaps for debugging production issues
    // WHY: Chunk splitting for better caching
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor': ['@dnd-kit/core', '@dnd-kit/sortable'],
          'data-vendor': ['@tanstack/react-query', 'axios', 'zustand'],
        },
      },
    },
  },
});
