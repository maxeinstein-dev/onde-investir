/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    // calcularEquivalencias faz ~320 simulações dia a dia; sob carga paralela passa de 5 s.
    testTimeout: 20000,
  },
});
