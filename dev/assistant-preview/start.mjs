import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
const require = createRequire(import.meta.url)
// Reuse the Vite version already locked by the project's Vitest dependency.
const vite = require.resolve('vite/package.json', { paths: [dirname(require.resolve('vitest/package.json'))] })
const child = spawn(process.execPath, [join(dirname(vite), 'bin/vite.js'), '--config', fileURLToPath(new URL('./vite.config.mjs', import.meta.url))], { stdio: 'inherit' })
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
child.on('exit', code => { process.exitCode = code || 0 })
child.on('error', error => { console.error(error.message); process.exitCode = 1 })
