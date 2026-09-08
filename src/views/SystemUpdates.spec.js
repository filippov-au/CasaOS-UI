import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import SystemUpdates from './SystemUpdates.vue'

const installed = 'a'.repeat(40)
const latest = 'a'.repeat(12) + 'b'.repeat(28)
const response = overrides => ({ data: { success: 200, data: {
  current_version: '0.4.15', need_update: true, version: { version: 'main', change_log: '# Changes' },
  source: { enabled: true, owner: 'filippov-au', branch: 'main', operation: 'idle', checked_at: '2026-09-08T00:00:00Z', repositories: [
    { name: 'CasaOS', installed, latest },
    { name: 'CasaOS-UI', installed, latest: installed },
    { name: 'CasaOS-AppManagement', installed, latest: installed },
  ] }, ...overrides,
} } })
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }
let wrapper, api, modal
beforeEach(() => {
  vi.useFakeTimers()
  api = { sys: { getVersion: vi.fn().mockResolvedValue(response()) } }
  modal = { open: vi.fn() }
})
afterEach(() => { wrapper?.destroy(); vi.useRealTimers() })
async function render() {
  wrapper = mount(SystemUpdates, {
    mocks: { $api: api, $t: s => s, $messageBus: vi.fn(), $buefy: { modal } },
    stubs: { 'b-button': { template: '<button :disabled="$attrs.disabled" @click="$emit(\'click\')"><slot /></button>' }, 'b-message': true, 'router-link': true },
    directives: { 'dompurify-html': () => {} },
  })
  await flush()
  return wrapper
}
it('shows all installed and latest commits with repository, commit and full-SHA compare links', async () => {
  await render()
  const rows = wrapper.findAll('.updates-repository')
  expect(rows.length).toBe(3)
  const changed = rows.at(0)
  expect(changed.text()).toContain('Update available')
  expect(changed.find('.updates-compare').attributes('href')).toBe(`https://github.com/filippov-au/CasaOS/compare/${installed}...${latest}`)
  expect(changed.find(`a[href$="/commit/${installed}"]`).attributes('title')).toBe(installed)
  expect(changed.find('a[href$="/commits/main"]').exists()).toBe(true)
  expect(rows.at(1).text()).toContain('Up to date')
  expect(rows.at(1).find('.updates-compare').exists()).toBe(false)
})
it('opens the existing review modal without starting an update', async () => {
  await render()
  await wrapper.find('.updates-summary button').trigger('click')
  expect(modal.open).toHaveBeenCalledWith(expect.objectContaining({
    props: { changeLog: '# Changes', sourceRunning: false, sourceMode: true },
  }))
})
it('retains installed commits but hides stale latest/compare links and disables updates after a failed check', async () => {
  await render()
  api.sys.getVersion.mockRejectedValue(new Error('offline'))
  await wrapper.vm.refresh()
  expect(wrapper.text()).toContain('Unable to check for updates')
  expect(wrapper.findAll('.updates-compare').length).toBe(0)
  expect(wrapper.findAll('.updates-badge').wrappers.every(w => w.text() === 'Unknown')).toBe(true)
  expect(wrapper.find('.updates-summary button').attributes('disabled')).toBeDefined()
  expect(wrapper.find(`a[href$="/commit/${installed}"]`).exists()).toBe(true)
  await wrapper.vm.openUpdate()
  expect(modal.open).not.toHaveBeenCalled()
})
it('recovers from an API check error on retry', async () => {
  api.sys.getVersion.mockResolvedValueOnce(response({ check_error: 'Could not check GitHub' }))
  await render()
  expect(wrapper.findAll('.updates-compare').length).toBe(0)
  await wrapper.vm.refresh()
  expect(wrapper.findAll('.updates-compare').length).toBe(1)
  expect(wrapper.vm.canUpdate).toBe(true)
})
it('shows unknown installed revisions without claiming they are current or generating compare links', async () => {
  const data = response({ need_update: false })
  data.data.data.source.repositories[0].installed = ''
  api.sys.getVersion.mockResolvedValue(data)
  await render()
  expect(wrapper.find('.updates-badge').text()).toBe('Unknown')
  expect(wrapper.find('.updates-summary').text()).toContain('Update status unknown')
  expect(wrapper.find('.updates-compare').exists()).toBe(false)
})
it('allows viewing an in-progress update even when the remote check failed', async () => {
  const data = response({ check_error: 'Could not check GitHub' })
  data.data.data.source.operation = 'running'
  api.sys.getVersion.mockResolvedValue(data)
  await render()
  expect(wrapper.find('.updates-summary').text()).toContain('System update in progress')
  await wrapper.find('.updates-summary button').trigger('click')
  expect(modal.open).toHaveBeenCalledWith(expect.objectContaining({ props: expect.objectContaining({ sourceRunning: true }) }))
})
it('keeps official release updates working without source metadata', async () => {
  api.sys.getVersion.mockResolvedValue(response({ source: undefined, version: { version: '0.4.16', change_log: '# Release' } }))
  await render()
  expect(wrapper.text()).toContain('Release details')
  expect(wrapper.text()).toContain('0.4.16')
  await wrapper.vm.openUpdate()
  expect(modal.open).toHaveBeenCalledWith(expect.objectContaining({ props: { sourceMode: false, sourceRunning: false, changeLog: '# Release' } }))
})
it('stops polling after leaving the page', async () => {
  await render()
  wrapper.destroy()
  await vi.advanceTimersByTimeAsync(300000)
  expect(api.sys.getVersion).toHaveBeenCalledOnce()
})
