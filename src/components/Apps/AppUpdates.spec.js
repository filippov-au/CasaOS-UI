import { mount } from '@vue/test-utils'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import AppUpdates from './AppUpdates.vue'
import updates from '@/service/updates'

vi.mock('@/service/updates', () => ({ default: { list: vi.fn(), check: vi.fn(), update: vi.fn(), rollback: vi.fn() } }))
vi.mock('@/mixins/base/common-i18n', () => ({ ice_i18n: title => title.en_us }))

const app = overrides => ({ id: 'demo', title: { en_us: 'Demo app' }, icon: '', current_version: '1.0', target_version: '2.0', check_status: 'available', operation: 'idle', rollback_available: true, rollback_version: '0.9', rollback_date: '2026-09-06T00:00:00Z', ...overrides })
const response = apps => ({ data: { data: apps, registry_supported: true } })
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }
const wrappers = []
function render(source = 'store') {
  const wrapper = mount(AppUpdates, {
    data: () => ({ source }),
    mocks: { $t: key => key },
    stubs: {
      'b-button': { props: ['disabled', 'loading'], template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>' },
      'b-message': { template: '<div><slot /></div>' },
      'b-modal': { props: ['active'], template: '<div v-if="active"><slot /></div>' },
      'b-select': { props: ['value', 'disabled'], template: '<select :value="value" :disabled="disabled" @change="$emit(\'input\', $event.target.value)"><slot /></select>' },
    },
  })
  wrappers.push(wrapper)
  return wrapper
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  updates.list.mockResolvedValue(response([app()]))
  updates.check.mockResolvedValue(response([app()]))
  updates.update.mockResolvedValue({})
  updates.rollback.mockResolvedValue({})
})
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.destroy()); vi.useRealTimers() })

describe('App Store Updates', () => {
  it('explains missing registry support while keeping legacy store checks usable', async () => {
    updates.list.mockResolvedValue({ data: { data: [app()] } })
    const wrapper = render('registry'); await flush()
    expect(wrapper.text()).toContain('Docker registry checks require a newer')
    expect(updates.check).not.toHaveBeenCalled()
    await wrapper.find('select').setValue('store'); await flush()
    expect(updates.check).toHaveBeenCalledWith('store')
  })
  it('checks registries independently and displays configured and offered images without a store install action', async () => {
    const registryApp = app({ registry_checked_at: '2026-09-08T00:00:00Z', registry_images: [
      { service: 'web', image: 'example/demo:1.0.0', status: 'available', latest_image: 'example/demo:2.0.0', current_image_id: 'sha256:' + 'a'.repeat(64), latest_image_id: 'sha256:' + 'b'.repeat(64) },
      { service: 'db', image: 'postgres@sha256:abc', status: 'pinned' },
    ] })
    updates.list.mockResolvedValue(response([registryApp])); updates.check.mockResolvedValue(response([registryApp]))
    const wrapper = render('registry'); await flush()
    expect(updates.check).toHaveBeenCalledWith('registry')
    expect(wrapper.text()).toContain('Configured image: example/demo:1.0.0')
    expect(wrapper.text()).toContain('Registry image: example/demo:2.0.0')
    expect(wrapper.text()).toContain('Registry update available')
    expect(wrapper.text()).toContain('Pinned to an exact image')
    expect(wrapper.text()).not.toContain('Store version')
    expect(wrapper.findAll('.update-actions button').wrappers.map(w => w.text())).toEqual(['Revert to previous version'])
    await wrapper.find('select').setValue('store'); await flush()
    expect(updates.check).toHaveBeenLastCalledWith('store')
    expect(wrapper.text()).toContain('Store version: 2.0')
  })
  it('shows per-image failures without hiding successful registry checks', async () => {
    const registryApp = app({ check_status: 'unmanaged', registry_checked_at: '2026-09-08T00:00:00Z', registry_images: [
      { service: 'web', image: 'example/demo:latest', status: 'up_to_date' },
      { service: 'db', image: 'example/db:latest', status: 'failed', error: 'Registry rate limit reached' },
    ] })
    updates.list.mockResolvedValue(response([registryApp])); updates.check.mockResolvedValue(response([registryApp]))
    const wrapper = render('registry'); await flush()
    expect(wrapper.text()).toContain('Up to date')
    expect(wrapper.text()).toContain('Check failed')
    expect(wrapper.text()).toContain('Registry rate limit reached')
    expect(wrapper.text()).not.toContain('No matching store app')
  })
  it('checks on opening and displays versions with a rollback action', async () => {
    const wrapper = render(); await flush()
    expect(updates.check).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('Demo app')
    expect(wrapper.text()).toContain('Installed: 1.0')
    expect(wrapper.text()).toContain('Store version: 2.0')
    expect(wrapper.text()).toContain('Revert to previous version')
  })
  it('explains unavailable support on older backends without checking', async () => {
    updates.list.mockRejectedValue({ response: { status: 404 } })
    const wrapper = render(); await flush()
    expect(wrapper.text()).toContain('require a newer CasaOS app-management service')
    expect(updates.check).not.toHaveBeenCalled()
  })
  it('distinguishes an empty list and failed checks', async () => {
    updates.list.mockResolvedValue(response([])); updates.check.mockResolvedValue(response([]))
    const wrapper = render(); await flush()
    expect(wrapper.text()).toContain('No installed apps')
    updates.list.mockResolvedValue(response([app({ check_status: 'failed', check_error: 'Registry unavailable' })]))
    await wrapper.vm.refresh(false); await flush()
    expect(wrapper.text()).toContain('Check failed')
    expect(wrapper.text()).toContain('Registry unavailable')
    expect(wrapper.find('.update-actions').text()).not.toContain('Update')
  })
  it('confirms version-only recovery and submits only one request', async () => {
    const wrapper = render(); await flush()
    wrapper.vm.confirm(wrapper.vm.apps[0], true); await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('cannot undo database changes')
    let finish
    updates.rollback.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const first = wrapper.vm.submit(); await wrapper.vm.submit()
    expect(updates.rollback).toHaveBeenCalledOnce()
    expect(updates.rollback).toHaveBeenCalledWith('demo')
    finish({}); await first
  })
  it('disables conflicting actions and shows errors from an operation', async () => {
    const running = app({ operation: 'applying' })
    updates.list.mockResolvedValue(response([running])); updates.check.mockResolvedValue(response([running]))
    const wrapper = render(); await flush()
    expect(wrapper.findAll('.update-actions button').wrappers.every(button => button.attributes('disabled') !== undefined)).toBe(true)
    expect(wrapper.find('progress').exists()).toBe(true)
    updates.list.mockResolvedValue(response([app({ operation: 'failed', error: 'Health check failed' })]))
    await wrapper.vm.refresh(false)
    expect(wrapper.text()).toContain('Health check failed')
  })
  it('keeps action errors visible and prevents polling after closing', async () => {
    const wrapper = render(); await flush()
    updates.update.mockRejectedValue({ response: { status: 409, data: { message: 'Another operation is running' } } })
    wrapper.vm.confirm(wrapper.vm.apps[0], false)
    await wrapper.vm.submit()
    expect(wrapper.text()).toContain('Another operation is running')
    expect(wrapper.vm.confirmOpen).toBe(true)
    wrapper.destroy()
    const count = updates.list.mock.calls.length
    await vi.advanceTimersByTimeAsync(10000)
    expect(updates.list).toHaveBeenCalledTimes(count)
  })
})
