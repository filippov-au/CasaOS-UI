import { mount } from '@vue/test-utils'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import AppUpdates from './AppUpdates.vue'
import updates from '@/service/updates'

vi.mock('@/service/updates', () => ({ default: { list: vi.fn(), check: vi.fn(), update: vi.fn(), rollback: vi.fn() } }))
vi.mock('@/mixins/base/common-i18n', () => ({ ice_i18n: title => title.en_us }))
const app = overrides => ({ id: 'audiobookshelf', title: { en_us: 'Audiobookshelf' }, icon: '', current_version: '2.23.0', target_version: '2.36.0', check_status: 'available', operation: 'idle', update_ready: true, update_token: 'checked-2.36.0', rollback_available: true, rollback_version: '2.22.0', rollback_date: '2026-09-06T00:00:00Z', ...overrides })
const response = apps => ({ data: { data: apps, combined_updates_supported: true } })
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }
const wrappers = []
function render() {
  const wrapper = mount(AppUpdates, {
    mocks: { $t: (key, values = {}) => key.replace(/\{(\w+)\}/g, (_, name) => values[name] ?? name) },
    stubs: { 'b-modal': { props: ['active'], template: '<div v-if="active"><slot /></div>' } },
  })
  wrappers.push(wrapper)
  return wrapper
}
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks()
  updates.list.mockResolvedValue(response([app()]))
  updates.check.mockResolvedValue(response([app()]))
  updates.update.mockResolvedValue({}); updates.rollback.mockResolvedValue({})
})
afterEach(() => { wrappers.splice(0).forEach(w => w.destroy()); vi.useRealTimers() })

describe('Unified app updates', () => {
  it('shows an Update button for the newer registry version without a source selector', async () => {
    const wrapper = render(); await flush()
    expect(updates.check).toHaveBeenCalledWith()
    expect(wrapper.find('select').exists()).toBe(false)
    expect(wrapper.find('.app-row').text()).toContain('Audiobookshelf')
    expect(wrapper.find('.app-row').text()).toContain('2.23.0')
    expect(wrapper.find('.app-row').text()).toContain('2.36.0')
    expect(wrapper.find('.update-actions button').text()).toBe('Update')
    expect(wrapper.find('.update-actions button').attributes('disabled')).toBeUndefined()
    expect(wrapper.text()).toContain('1 update available')
    await wrapper.find('.update-actions button').trigger('click')
    expect(wrapper.find('.confirmation-version').text()).toContain('2.36.0')
    await wrapper.find('.confirm-button').trigger('click'); await flush()
    expect(updates.update).toHaveBeenCalledWith('audiobookshelf', 'checked-2.36.0')
  })
  it('keeps technical image references under closed details and hides image hashes', async () => {
    const item = app({ registry_images: [{ service: 'main', installed_image: 'ghcr.io/advplyr/audiobookshelf:2.23.0', latest_image: 'ghcr.io/advplyr/audiobookshelf:2.36.0', current_image_id: 'sha256:abc', latest_image_id: 'sha256:def' }] })
    updates.list.mockResolvedValue(response([item])); updates.check.mockResolvedValue(response([item]))
    const wrapper = render(); await flush()
    expect(wrapper.find('details').attributes('open')).toBeUndefined()
    expect(wrapper.find('.app-row').text()).not.toContain('ghcr.io')
    expect(wrapper.find('details').text()).toContain('ghcr.io/advplyr/audiobookshelf:2.36.0')
    expect(wrapper.text()).not.toContain('sha256:')
  })
  it('groups available apps, errors and current apps with clear states', async () => {
    const apps = [app(), app({ id: 'broken', title: { en_us: 'Broken' }, check_status: 'failed', update_ready: false, check_error: 'Registry unavailable' }), app({ id: 'current', title: { en_us: 'Current' }, check_status: 'up_to_date', update_ready: false })]
    updates.list.mockResolvedValue(response(apps)); updates.check.mockResolvedValue(response(apps))
    const wrapper = render(); await flush()
    expect(wrapper.findAll('.group-header h3').wrappers.map(w => w.text())).toEqual(['Available updates', 'Needs attention', 'Installed apps'])
    expect(wrapper.find('[data-app-id="broken"]').text()).toContain('Registry unavailable')
    expect(wrapper.find('[data-app-id="broken"] .update-button').exists()).toBe(false)
    expect(wrapper.find('[data-app-id="current"] .current-mark').exists()).toBe(true)
  })
  it('uses a new-build label when the image changes under the same tag', async () => {
    const item = app({ current_version: 'latest', target_version: 'latest' })
    updates.list.mockResolvedValue(response([item])); updates.check.mockResolvedValue(response([item]))
    const wrapper = render(); await flush()
    expect(wrapper.find('.app-version').text()).toContain('New update available')
    expect(wrapper.find('.update-button').exists()).toBe(true)
  })
  it('explains older backend support without offering an unsupported registry update', async () => {
    updates.list.mockResolvedValue({ data: { data: [app({ update_ready: false })], registry_supported: true } })
    const wrapper = render(); await flush()
    expect(wrapper.text()).toContain('require a newer CasaOS app-management service')
    expect(updates.check).not.toHaveBeenCalled()
    expect(wrapper.find('.update-actions button').exists()).toBe(false)
  })
  it('shows endpoint failure and empty states separately', async () => {
    updates.list.mockRejectedValue({ response: { status: 404 } })
    let wrapper = render(); await flush()
    expect(wrapper.text()).toContain('require a newer CasaOS app-management service')
    wrapper.destroy()
    updates.list.mockResolvedValue(response([])); updates.check.mockResolvedValue(response([]))
    wrapper = render(); await flush()
    expect(wrapper.text()).toContain('No installed apps')
    expect(wrapper.text()).not.toContain('All apps are up to date')
  })
  it('prevents duplicate submissions and preserves the reviewed token during polling', async () => {
    const wrapper = render(); await flush()
    wrapper.vm.confirm(wrapper.vm.apps[0], false)
    updates.list.mockResolvedValue(response([app({ target_version: '2.37.0', update_token: 'new-token' })]))
    await wrapper.vm.refresh(false)
    let finish
    updates.update.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const first = wrapper.vm.submit(); await wrapper.vm.submit()
    expect(updates.update).toHaveBeenCalledOnce()
    expect(updates.update).toHaveBeenCalledWith('audiobookshelf', 'checked-2.36.0')
    finish({}); await first
  })
  it('keeps stale-plan and other action errors visible in the confirmation', async () => {
    const wrapper = render(); await flush()
    updates.update.mockRejectedValue({ response: { status: 409, data: { message: 'Check for updates again' } } })
    wrapper.vm.confirm(wrapper.vm.apps[0], false); await wrapper.vm.submit()
    expect(wrapper.vm.confirmOpen).toBe(true)
    expect(wrapper.find('[role="alert"]').text()).toContain('Check for updates again')
  })
  it('keeps restore in Details with a data-preservation confirmation', async () => {
    const wrapper = render(); await flush()
    await wrapper.find('.restore-row button').trigger('click')
    expect(wrapper.text()).toContain('cannot undo database changes')
    expect(wrapper.find('.confirmation-version').text()).toContain('2.22.0')
    await wrapper.find('.confirm-button').trigger('click'); await flush()
    expect(updates.rollback).toHaveBeenCalledWith('audiobookshelf')
  })
  it('disables conflicting actions while updating and stops polling on close', async () => {
    const item = app({ operation: 'applying' })
    updates.list.mockResolvedValue(response([item])); updates.check.mockResolvedValue(response([item]))
    const wrapper = render(); await flush()
    expect(wrapper.find('.update-actions button').attributes('disabled')).toBeDefined()
    expect(wrapper.find('progress').exists()).toBe(true)
    expect(wrapper.text()).toContain('Starting updated app')
    wrapper.destroy()
    const count = updates.list.mock.calls.length
    await vi.advanceTimersByTimeAsync(30000)
    expect(updates.list).toHaveBeenCalledTimes(count)
  })
})
