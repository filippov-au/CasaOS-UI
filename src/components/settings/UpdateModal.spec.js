import { mount } from '@vue/test-utils'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import UpdateModal from './UpdateModal.vue'
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }
let wrapper, api, toast, router
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('localStorage', { setItem: vi.fn() })
  api = { sys: { updateCasaOS: vi.fn().mockResolvedValue({}) }, file: { getContent: vi.fn().mockResolvedValue({ data: { data: 'Building…' } }) } }
  toast = { open: vi.fn() }
  router = { replace: vi.fn() }
})
afterEach(() => { wrapper?.destroy(); vi.useRealTimers(); vi.unstubAllGlobals() })
function render(propsData = {}) {
  wrapper = mount(UpdateModal, { propsData: { sourceMode: true, ...propsData }, mocks: { $api: api, $t: s => s, $buefy: { toast }, $router: router },
    directives: { 'dompurify-html': () => {} }, stubs: ['b-icon', 'b-button'] })
  return wrapper
}
it('uses the existing update API and log path', async () => {
  render(); await wrapper.vm.updateSystem(); await flush()
  expect(api.sys.updateCasaOS).toHaveBeenCalledOnce()
  expect(api.file.getContent).toHaveBeenCalledWith('/var/log/casaos/upgrade.log')
  expect(wrapper.vm.isUpdating).toBe(true)
})
it('handles start rejection and allows retry', async () => {
  api.sys.updateCasaOS.mockRejectedValue({ response: { data: { message: 'Docker unavailable' } } })
  render(); await wrapper.vm.updateSystem()
  expect(wrapper.vm.isUpdating).toBe(false)
  expect(toast.open).toHaveBeenCalledWith(expect.objectContaining({ message: 'Docker unavailable' }))
  expect(api.file.getContent).not.toHaveBeenCalled()
})
it('reconnects after a CasaOS restart and completes', async () => {
  api.file.getContent.mockRejectedValueOnce(new Error('restarting'))
  render(); await wrapper.vm.updateSystem(); await flush()
  api.file.getContent.mockResolvedValue({ data: { data: 'Done\nCasaOS upgrade successfully\n' } })
  await vi.advanceTimersByTimeAsync(2000)
  expect(router.replace).toHaveBeenCalledWith({ path: '/logout' })
})
it('resumes log viewing without starting a second build', async () => {
  render({ sourceRunning: true }); await flush()
  expect(api.sys.updateCasaOS).not.toHaveBeenCalled()
  expect(api.file.getContent).toHaveBeenCalledOnce()
})
it('does not confuse a compiler message with successful completion', async () => {
  api.file.getContent.mockResolvedValue({ data: { data: 'Testing CasaOS upgrade successfully handler\nBuilding UI' } })
  render(); await wrapper.vm.updateSystem(); await flush()
  expect(router.replace).not.toHaveBeenCalled()
})
it('shows failure and stops polling when the updater fails', async () => {
  api.file.getContent.mockResolvedValue({ data: { data: 'Recovery complete\nCasaOS upgrade failed\n' } })
  render(); await wrapper.vm.updateSystem(); await flush()
  expect(wrapper.vm.isUpdating).toBe(false)
  await vi.advanceTimersByTimeAsync(4000)
  expect(api.file.getContent).toHaveBeenCalledOnce()
})
it('cleans up polling on close', async () => {
  render(); await wrapper.vm.updateSystem(); await flush(); wrapper.destroy()
  await vi.advanceTimersByTimeAsync(6000)
  expect(api.file.getContent).toHaveBeenCalledOnce()
})
