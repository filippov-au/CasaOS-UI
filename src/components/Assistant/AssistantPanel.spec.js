import { shallowMount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import AssistantPanel from './AssistantPanel.vue'
import api from '@/service/assistant'

vi.mock('@/service/assistant', () => ({ default: {
  disconnect: vi.fn(), addCredential: vi.fn(), list: vi.fn(), settings: vi.fn(), saveSettings: vi.fn(), deleteSettings: vi.fn(), start: vi.fn(), get: vi.fn(), reply: vi.fn(), decide: vi.fn(), cancel: vi.fn(), remove: vi.fn(),
} }))
const response = data => ({ data: { data } })
const view = (status = 'running') => ({ id: 'a'.repeat(32), mode: 'review', status, events: [{ kind: 'user', text: 'Investigate', time: 'now' }] })
let wrapper
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); await wrapper.vm.$nextTick() }
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); sessionStorage.clear()
  api.list.mockResolvedValue(response([]))
  api.settings.mockResolvedValue(response({ settings: { provider: 'deepseek', model: 'deepseek-flash', configured: true }, presets: [{ id: 'deepseek', name: 'DeepSeek', models: ['deepseek-flash'] }] }))
})
afterEach(() => { wrapper?.destroy(); vi.useRealTimers() })
function mount() { wrapper = shallowMount(AssistantPanel, { mocks: { $t: s => s, $store: { state: { user: { username: 'owner' } } } }, stubs: ['b-icon'] }); return wrapper }
it('starts a review session and polls through to approval without executing it', async () => {
  api.start.mockResolvedValue(response(view()))
  const pending = { ...view('approval'), pending: { id: 'approval', tool: 'configure_service', summary: 'Set timezone' } }
  api.get.mockResolvedValue(response(pending))
  mount(); await flush(); await wrapper.setData({ draft: 'Fix this app' }); await wrapper.vm.send()
  expect(api.start).toHaveBeenCalledWith('Fix this app', 'review')
  expect(wrapper.find('textarea').attributes('disabled')).toBeDefined()
  await vi.advanceTimersByTimeAsync(1500)
  expect(wrapper.text()).toContain('Set timezone'); expect(api.decide).not.toHaveBeenCalled()
  api.decide.mockResolvedValue(response(view()))
  await wrapper.vm.decide(true)
  expect(api.decide).toHaveBeenCalledWith(view().id, 'approval', true)
})
it('resumes a session after reopening, and stops further polling on close', async () => {
  sessionStorage.setItem('casa-assistant-session:owner', view().id); api.get.mockResolvedValue(response(view()))
  mount(); await flush(); expect(wrapper.vm.session.id).toBe(view().id)
  wrapper.destroy(); await vi.advanceTimersByTimeAsync(10000); expect(api.get).toHaveBeenCalledTimes(1)
})
it('clears a conversation that was deleted elsewhere', async () => {
  sessionStorage.setItem('casa-assistant-session:owner', view().id); api.get.mockRejectedValue({ response: { status: 404 } })
  mount(); await flush(); expect(wrapper.vm.session).toBeNull(); expect(sessionStorage.length).toBe(0)
  expect(wrapper.text()).toContain('no longer available')
})
it('renders untrusted model and log output as text', async () => {
  mount(); await flush(); await wrapper.setData({ session: { ...view('done'), events: [{ kind: 'assistant', text: '<img src=x onerror=alert(1)>' }, { kind: 'tool', tool: 'app_logs', text: '<script>bad()</script>' }] } })
  expect(wrapper.find('img').exists()).toBe(false); expect(wrapper.find('script').exists()).toBe(false)
  expect(wrapper.text()).toContain('<img src=x onerror=alert(1)>')
})
it('stops the task and requires a new conversation after cancellation', async () => {
  mount(); await flush(); await wrapper.setData({ session: view(), draft: 'Continue' })
  api.cancel.mockResolvedValue(response(view('cancelled'))); await wrapper.vm.stop()
  expect(api.cancel).toHaveBeenCalledWith(view().id); expect(wrapper.vm.canSend).toBe(false)
  await wrapper.vm.newConversation(); expect(api.remove).not.toHaveBeenCalled(); expect(wrapper.vm.session).toBeNull(); await wrapper.setData({ draft: 'Continue' }); expect(wrapper.vm.canSend).toBe(true)
})

it('lists prior topics and starts a new chat without deleting history', async () => {
  api.list.mockResolvedValue(response([{ id: view().id, title: 'Media stack', status: 'done' }]))
  api.get.mockResolvedValue(response(view('done')))
  mount(); await flush(); expect(wrapper.text()).toContain('Media stack')
  await wrapper.vm.selectTopic(view().id); expect(wrapper.vm.session.id).toBe(view().id)
  await wrapper.vm.newConversation(); expect(wrapper.vm.session).toBeNull(); expect(api.remove).not.toHaveBeenCalled()
  expect(wrapper.text()).toContain('Media stack')
})

it('sends credentials outside chat and clears their values from the form', async () => {
  mount(); await flush(); await wrapper.setData({ session: view('done'), credentialName: 'usenet_password', credentialValue: 'private-secret', showCredential: true })
  api.addCredential.mockResolvedValue(response(view('done')))
  await wrapper.vm.saveCredential()
  expect(api.addCredential).toHaveBeenCalledWith(view().id, 'usenet_password', 'private-secret')
  expect(api.reply).not.toHaveBeenCalled(); expect(api.start).not.toHaveBeenCalled()
  expect(wrapper.vm.credentialValue).toBe(''); expect(wrapper.vm.draft).toContain('$secret:usenet_password')
  expect(JSON.stringify(Object.entries(sessionStorage))).not.toContain('private-secret')
})

it('searches connected models by display name and selects without resending credentials', async () => {
  mount(); await flush()
  await wrapper.setData({ presets: [
    { id: 'deepseek', name: 'DeepSeek', models: ['deepseek-flash', 'deepseek-v4-pro'], model_details: [{ id: 'deepseek-flash', name: 'Flash' }, { id: 'deepseek-v4-pro', name: 'Pro' }] },
    { id: 'opencode-go', name: 'OpenCode Go', models: ['glm-5.2'] },
  ] })
  await wrapper.find('.model-trigger').trigger('click')
  await wrapper.find('#model-search').setValue('pro')
  expect(wrapper.findAll('.model-group button').length).toBe(1)
  api.saveSettings.mockResolvedValue(response({ provider: 'deepseek', model: 'deepseek-v4-pro', configured: true }))
  await wrapper.find('.model-group button').trigger('click'); await flush()
  expect(api.saveSettings).toHaveBeenCalledWith({ provider: 'deepseek', model: 'deepseek-v4-pro' })
  expect(wrapper.vm.settings.model).toBe('deepseek-v4-pro'); expect(wrapper.vm.showModels).toBe(false)
})

it('directs setup to CasaOS Settings without exposing provider settings in chat', async () => {
  api.settings.mockResolvedValueOnce(response({ settings: { provider: 'deepseek', configured: false }, presets: [], connections: [] }))
  mount(); await flush(); await wrapper.setData({ draft: 'Help with my apps' })
  expect(wrapper.vm.canSend).toBe(false)
  expect(wrapper.find('.provider-row').exists()).toBe(false)
  expect(wrapper.find('.assistant-setup').text()).toContain('CasaOS Settings')
  expect(wrapper.find('.assistant-setup button').exists()).toBe(false)
  expect(wrapper.find('.sidebar-settings').exists()).toBe(false)
  await wrapper.find('.model-trigger').trigger('click')
  expect(wrapper.find('.connect-more').exists()).toBe(false)
  expect(wrapper.find('.model-picker').text()).toContain('CasaOS Settings')
  await wrapper.vm.refreshSettings(); await flush()
  expect(wrapper.vm.draft).toBe('Help with my apps')
  expect(wrapper.vm.canSend).toBe(true)
  expect(wrapper.find('.assistant-setup').exists()).toBe(false)
})

it('keeps the conversation model, history and draft when settings selects another provider', async () => {
  mount(); await flush()
  const session = { ...view('done'), provider: 'deepseek', model: 'deepseek-flash' }
  await wrapper.setData({ session, draft: 'Continue here' })
  api.settings.mockResolvedValue(response({
    settings: { provider: 'opencode-go', model: 'glm-5.2', configured: true },
    connections: [{ provider: 'deepseek', configured: true }, { provider: 'opencode-go', configured: true }], presets: [],
  }))
  await wrapper.vm.refreshSettings(); await flush()
  expect(wrapper.vm.session).toEqual(session)
  expect(wrapper.vm.selectedModelName).toBe('deepseek-flash')
  expect(wrapper.vm.draft).toBe('Continue here')
  expect(wrapper.vm.canSend).toBe(true)
  expect(api.start).not.toHaveBeenCalled()
  expect(api.get).not.toHaveBeenCalled()
})

it('disables replies when the conversation provider is disconnected, even with another selected provider', async () => {
  mount(); await flush()
  await wrapper.setData({ session: { ...view('done'), provider: 'deepseek' }, draft: 'Continue' })
  api.settings.mockResolvedValue(response({
    settings: { provider: 'opencode-go', configured: true },
    connections: [{ provider: 'opencode-go', configured: true }], presets: [],
  }))
  await wrapper.vm.refreshSettings()
  expect(wrapper.vm.canSend).toBe(false)
  await wrapper.vm.newConversation()
  await wrapper.setData({ draft: 'Start with the connected provider' })
  expect(wrapper.vm.canSend).toBe(true)
})

it('recovers from a failed settings refresh without losing an existing conversation', async () => {
  mount(); await flush(); await wrapper.setData({ session: view('done'), draft: 'Continue' })
  api.settings.mockRejectedValueOnce(new Error('Settings unavailable'))
  await wrapper.vm.retry(); await flush()
  expect(wrapper.vm.error).toBe('Settings unavailable')
  expect(wrapper.vm.canSend).toBe(false)
  api.get.mockResolvedValue(response(view('done')))
  await wrapper.vm.retry()
  expect(wrapper.vm.error).toBe('')
  expect(wrapper.vm.canSend).toBe(true)
  expect(wrapper.vm.draft).toBe('Continue')
})
