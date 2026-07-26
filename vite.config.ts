/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    // Deliberately conservative. Devices like a 2017 Galaxy Note 8 often run
    // an Android System WebView far older than the OS, and an es2022 bundle
    // fails to parse there — the app dies before a single line executes.
    // es2017 covers Chrome/WebView 58+ at a negligible size cost.
    target: ['es2017', 'chrome61', 'safari12'],
    sourcemap: false,
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: {
          pixi: ['pixi.js'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
