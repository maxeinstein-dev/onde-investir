/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
  },
});
