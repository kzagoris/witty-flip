import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    fileParallelism: false,
    exclude: [
      'node_modules/**',
      'dist/**',
      '.output/**',
      'drizzle/**',
      'tests/fixtures/**',
    ],
  },
  resolve: {
    alias: {
      '~': resolve(__dirname, './app'),
    },
  },
})
