import { shallowMount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import TopBar from './TopBar.vue'

vi.mock('./account/AccountPanel.vue', () => ({ default: { render: h => h('div') } }))
vi.mock('./logsAndTerminal/TerminalPanel.vue', () => ({ default: {} }))
vi.mock('./settings/PortPanel.vue', () => ({ default: {} }))
vi.mock('@/assets/lang', () => ({ default: {} }))
vi.mock('@/mixins/mixin', () => ({ mixin: { methods: { getLangFromBrowser: () => 'en_us' } } }))

let wrapper
beforeEach(() => vi.stubGlobal('localStorage', { getItem: () => null }))
afterEach(() => { wrapper?.destroy(); vi.unstubAllGlobals() })
const response = () => ({ data: { success: 200, data: { current_version: '0.4.15', need_update: true, source: {
  enabled: true, branch: 'main', operation: 'idle', repositories: [{ installed: 'a'.repeat(40), latest: 'b'.repeat(40) }],
} } } })
function render(getVersion) {
  // Isolate the update flow from unrelated account and hardware initialization.
  wrapper = shallowMount({ ...TopBar, created: [], mounted: [], render: h => h('div') }, {
    propsData: { initBarData: {} },
    mocks: { $store: { state: { user: {} } }, $api: { sys: { getVersion } }, $t: s => s, $messageBus: vi.fn() },
  })
  return wrapper.vm
}

it('removes a stale alert on failed or malformed checks and recovers on retry', async () => {
  const getVersion = vi.fn().mockResolvedValue(response())
  const vm = render(getVersion)
  expect(vm.updateStatus).toBe('checking')
  await vm.checkVersion()
  expect(vm.updateAvailable).toBe(true)
  getVersion.mockRejectedValueOnce(new Error('offline'))
  await vm.checkVersion()
  expect(vm.updateAvailable).toBe(false)
  expect(vm.updateStatus).toBe('failed')
  getVersion.mockResolvedValueOnce({ data: { success: 500 } })
  await vm.checkVersion()
  expect(vm.updateStatus).toBe('failed')
  await vm.checkVersion()
  expect(vm.updateAvailable).toBe(true)
})

it('prevents overlapping checks from restoring an older result', async () => {
  let finish
  const getVersion = vi.fn(() => new Promise(resolve => { finish = resolve }))
  const vm = render(getVersion)
  const first = vm.checkVersion()
  await vm.checkVersion()
  expect(getVersion).toHaveBeenCalledOnce()
  const running = response(); running.data.data.source.operation = 'running'
  finish(running); await first
  expect(vm.updateAvailable).toBe(false)
  expect(vm.updateStatusText).toBe('System update in progress')
})
