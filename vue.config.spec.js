// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const Service = require('@vue/cli-service/lib/Service')

afterEach(() => vi.unstubAllEnvs())

it('keeps host credentials out of browser definitions while preserving public configuration', async () => {
  vi.stubEnv('NODE_ENV', 'prod')
  vi.stubEnv('GITHUB_PERSONAL_ACCESS_TOKEN', 'private-build-canary-do-not-publish')
  vi.stubEnv('CASA_PRIVATE_PATH', '/private-build-canary/local-state')
  vi.stubEnv('VUE_APP_PUBLIC_CANARY', 'public-build-setting')
  const service = new Service(process.cwd())
  await service.init('production')
  const config = service.resolveWebpackConfig()
  const definitions = config.plugins.filter(plugin => plugin.constructor.name === 'DefinePlugin')
  const serialized = JSON.stringify(definitions.map(plugin => plugin.definitions))

  // Boolean assertions keep any accidentally leaked environment out of test reports.
  expect(serialized.includes('private-build-canary')).toBe(false)
  expect(serialized.includes('GITHUB_PERSONAL_ACCESS_TOKEN')).toBe(false)
  const browser = definitions.find(plugin => plugin.definitions['process.env']).definitions
  expect(typeof browser['process.env']).toBe('object')
  expect(Object.keys(browser['process.env']).every(key => /^(NODE_ENV|BASE_URL|VUE_APP_.*)$/.test(key))).toBe(true)
  expect(browser['process.env'].NODE_ENV).toBe(JSON.stringify('prod'))
  expect(browser['process.env'].BASE_URL).toBe(JSON.stringify('/'))
  expect(browser['process.env'].VUE_APP_PUBLIC_CANARY).toBe(JSON.stringify('public-build-setting'))
  expect(typeof browser.BUILT_TIME).toBe('string')
})
