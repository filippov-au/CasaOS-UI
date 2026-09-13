import { shallowMount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import AssistantSettings from './AssistantSettings.vue'
import api from '@/service/assistant'

vi.mock('@/service/assistant', () => ({ default: {
  disconnect: vi.fn(), settings: vi.fn(), saveSettings: vi.fn(),
} }))
const response = data => ({ data: { data } })
let wrapper
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); await wrapper.vm.$nextTick() }
beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear()
  vi.stubGlobal('localStorage', { setItem: vi.fn() })
  api.settings.mockResolvedValue(response({ settings: { provider: 'deepseek', model: 'deepseek-flash', configured: true }, presets: [{ id: 'deepseek', name: 'DeepSeek', models: ['deepseek-flash'] }] }))
})
afterEach(() => { wrapper?.destroy(); vi.unstubAllGlobals() })
function mount() { wrapper = shallowMount(AssistantSettings, { mocks: { $t: s => s } }); return wrapper }
it('never puts provider credentials into browser storage', async () => {
  api.saveSettings.mockResolvedValue(response({ provider: 'deepseek', model: 'deepseek-flash', configured: true }))
  mount(); await flush(); await wrapper.setData({ apiKey: 'private-provider-key' }); await wrapper.vm.saveSettings()
  expect(wrapper.vm.apiKey).toBe(''); expect(sessionStorage.length).toBe(0)
  expect(localStorage.setItem).not.toHaveBeenCalled()
  expect(api.saveSettings).toHaveBeenCalledWith({ provider: 'deepseek', model: 'deepseek-flash', api_key: 'private-provider-key', verify: true })
})

it('shows provider buttons before connection and clears key drafts when switching', async () => {
  api.settings.mockResolvedValue(response({ settings: { provider: 'deepseek', model: 'deepseek-flash', configured: false }, connections: [], presets: [
    { id: 'deepseek', name: 'DeepSeek', models: ['deepseek-flash'], key_url: 'https://platform.deepseek.com/api_keys' },
    { id: 'opencode-go', name: 'OpenCode Go', models: ['glm-5.2'], key_url: 'https://opencode.ai/auth' },
  ] }))
  mount(); await flush()
  expect(wrapper.findAll('.provider-row').length).toBe(2)
  expect(wrapper.find('.connection-heading').text()).toContain('DeepSeek')
  await wrapper.setData({ apiKey: 'draft-secret' })
  await wrapper.findAll('.provider-row').at(1).trigger('click')
  expect(wrapper.vm.apiKey).toBe('')
  expect(wrapper.find('.connection-heading').text()).toContain('OpenCode Go')
  expect(wrapper.vm.settings.provider).toBe('deepseek')
})

it('disconnects only the chosen provider', async () => {
  mount(); await flush()
  await wrapper.setData({ connections: [...wrapper.vm.connections, { provider: 'opencode-go', configured: true }], connectingProvider: 'opencode-go' })
  api.disconnect.mockResolvedValue(response({ deleted: true }))
  await wrapper.vm.forgetKey()
  expect(api.disconnect).toHaveBeenCalledWith('opencode-go')
  expect(wrapper.vm.settings.configured).toBe(true); expect(wrapper.vm.connections.length).toBe(1)
})

it('retains the saved model and clears the draft key when connection verification fails', async () => {
  mount(); await flush()
  api.saveSettings.mockRejectedValue(new Error('provider returned HTTP 401'))
  await wrapper.setData({ apiKey: 'invalid-private-key' }); await wrapper.vm.saveSettings()
  expect(wrapper.vm.apiKey).toBe(''); expect(wrapper.vm.settings.configured).toBe(true)
  expect(wrapper.vm.error).toContain('401')
})

it('retries a failed settings load', async () => {
  api.settings.mockRejectedValueOnce(new Error('Service unavailable'))
  mount(); await flush()
  expect(wrapper.find('[role="alert"]').text()).toContain('Service unavailable')
  await wrapper.find('[role="alert"] button').trigger('click'); await flush()
  expect(wrapper.findAll('.provider-row').length).toBe(1)
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
})

it('keeps the dialog open until verification finishes and clears key drafts on destroy', async () => {
  mount(); await flush()
  let finish
  api.saveSettings.mockReturnValue(new Promise(resolve => { finish = resolve }))
  await wrapper.setData({ apiKey: 'draft-key' })
  const saving = wrapper.vm.saveSettings(); await flush()
  expect(wrapper.vm.apiKey).toBe('')
  expect(wrapper.find('.settings-close').attributes('disabled')).toBeDefined()
  finish(response({ provider: 'deepseek', model: 'deepseek-flash', configured: true }))
  await saving; await flush()
  expect(wrapper.find('[role="status"]').text()).toContain('Provider connected')
  expect(wrapper.find('.settings-close').attributes('disabled')).toBeUndefined()
  await wrapper.setData({ apiKey: 'another-draft' })
  wrapper.destroy()
  expect(wrapper.vm.apiKey).toBe('')
})

it('keeps settings open while the NPM connection is being saved', async () => {
  mount(); await flush(); await wrapper.setData({ npmBusy: true })
  expect(wrapper.find('.settings-close').attributes('disabled')).toBeDefined()
  expect(wrapper.find('footer button').attributes('disabled')).toBeDefined()
  expect(wrapper.attributes('aria-busy')).toBe('true')
})
