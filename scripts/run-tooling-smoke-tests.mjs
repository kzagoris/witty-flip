import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const vitestBin = path.resolve(scriptDir, '../node_modules/vitest/vitest.mjs')

const child = spawn(
  process.execPath,
  [vitestBin, 'run', 'tests/smoke/tooling-smoke.test.ts', ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      RUN_TOOLING_TESTS: '1',
    },
  },
)

child.on('exit', (code) => {
  process.exit(code ?? 1)
})

child.on('error', (error) => {
  console.error(error)
  process.exit(1)
})
