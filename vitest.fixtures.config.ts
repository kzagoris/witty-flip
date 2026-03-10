import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    fileParallelism: false,
    include: ['tests/fixtures/**/*.test.ts'],
    exclude: [
      'node_modules/**',
      'dist/**',
      '.output/**',
      'drizzle/**',
    ],
  },
  resolve: {
    alias: {
      '~': resolve(__dirname, './app'),
    },
  },
})
