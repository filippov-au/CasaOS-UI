import { shallowMount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import NPMSettings from './NPMSettings.vue'
import api from '@/service/assistant'
vi.mock('@/service/assistant', () => ({ default: { npmDiscover: vi.fn(), npmSettings: vi.fn(), npmVerify: vi.fn(), npmSave: vi.fn(), npmDisconnect: vi.fn() } }))
const response = data => ({ data: { data } })
const inventory = () => ({ suffixes: ['example.com'], certificates: [{ id: 1, domain_names: ['*.example.com'], expires_on: '2099-01-01T00:00:00Z' }], access_lists: [{ id: 2, name: 'Home network' }] })
let wrapper
beforeEach(() => { vi.clearAllMocks(); api.npmDiscover.mockResolvedValue(response([{ app: 'npm', service: 'web', ready: true }])); api.npmSettings.mockResolvedValue(response({ connection: null })) })
afterEach(() => wrapper?.destroy())
async function open() { wrapper = shallowMount(NPMSettings); await wrapper.vm.open() }
it('discovers the instance and derives domains from wildcard certificates', async () => {
  await open(); expect(wrapper.vm.instanceKey).toBe('npm/web')
  await wrapper.setData({ username: 'owner', password: 'private-secret' }); api.npmVerify.mockResolvedValue(response(inventory())); await wrapper.vm.verify()
  expect(wrapper.vm.suffix).toBe('example.com'); expect(wrapper.text()).toContain('https://app.example.com')
  expect(wrapper.vm.accessListID).toBe(''); expect(wrapper.find('.npm-save').attributes('disabled')).toBeDefined()
  await wrapper.setData({ accessListID: 0 }); api.npmSave.mockResolvedValue(response({ saved: true })); await wrapper.vm.save()
  expect(api.npmSave).toHaveBeenCalledWith({ app: 'npm', service: 'web', username: 'owner', password: 'private-secret', suffix: 'example.com', access_list_id: 0 })
  expect(wrapper.vm.password).toBe(''); expect(wrapper.vm.connected).toBe(true)
})
it('blocks saving when there are no eligible wildcard certificates', async () => {
  await open(); await wrapper.setData({ username: 'owner', password: 'secret' }); api.npmVerify.mockResolvedValue(response({ ...inventory(), suffixes: [] })); await wrapper.vm.verify()
  expect(wrapper.text()).toContain('No valid wildcard certificate'); expect(wrapper.find('.npm-save').exists()).toBe(false); await wrapper.vm.save(); expect(api.npmSave).not.toHaveBeenCalled()
})
it('requires a choice when multiple wildcard domains exist and clears failed credentials', async () => {
  await open(); api.npmVerify.mockResolvedValue(response({ ...inventory(), suffixes: ['one.example.com', 'two.example.com'] })); await wrapper.vm.verify(); expect(wrapper.vm.suffix).toBe('')
  api.npmVerify.mockRejectedValue(new Error('NPM login failed')); await wrapper.setData({ password: 'private-secret' }); await wrapper.vm.verify(); expect(wrapper.vm.password).toBe(''); expect(wrapper.find('[role="alert"]').text()).toContain('login failed')
})
it('disconnects without deleting hosts and clears drafts on destroy', async () => {
  api.npmSettings.mockResolvedValue(response({ ...inventory(), connection: { app: 'npm', service: 'web', username: 'owner', suffix: 'example.com', access_list_id: 2 } })); await open()
  expect(wrapper.vm.connected).toBe(true); api.npmDisconnect.mockResolvedValue(response({ disconnected: true })); await wrapper.vm.disconnect(); expect(api.npmDisconnect).toHaveBeenCalledOnce(); expect(wrapper.vm.connected).toBe(false)
  await wrapper.setData({ password: 'draft' }); wrapper.destroy(); expect(wrapper.vm.password).toBe('')
})
