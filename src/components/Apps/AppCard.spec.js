import { shallowMount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import AppCard from './AppCard.vue'

vi.mock('@/mixins/base/common-i18n', () => ({
  default: { methods: { i18n: title => title?.en_us } },
  ice_i18n: title => title?.en_us,
}))

const appName = 'Demo'

function render() {
  return shallowMount(AppCard, {
    propsData: {
      item: { name: appName, title: { en_us: appName }, icon: '', status: 'running', app_type: 'v2app' },
    },
    provide: { homeShowFiles: vi.fn(), openAppStore: vi.fn() },
    mocks: { $t: key => key, $buefy: { toast: { open: vi.fn() } } },
    stubs: {
      'b-button': true,
      'b-dropdown': true,
      'b-dropdown-item': true,
      'b-icon': true,
      'b-image': true,
      'b-loading': true,
      'b-tooltip': true,
    },
  })
}

// vue-socket.io-extended is not installed under test, so handlers live on the component options.
const socket = (wrapper, event, properties) => wrapper.vm.$options.sockets[event].call(wrapper.vm, { Properties: properties })

describe('App card update progress', () => {
  it('shows the pull percentage on the tile while the app is updated, then clears it', async () => {
    const wrapper = render()
    expect(wrapper.find('.app-progress').exists()).toBe(false)

    socket(wrapper, 'app:update-begin', { 'app:name': appName })
    socket(wrapper, 'app:install-progress', { 'app:name': appName, 'app:progress': '42' })
    await wrapper.vm.$nextTick()

    const bar = wrapper.find('.app-progress')
    expect(bar.text()).toBe('42%')
    expect(bar.attributes('aria-valuenow')).toBe('42')
    expect(bar.find('.app-progress-fill').attributes('style')).toContain('width: 42%')

    socket(wrapper, 'app:install-progress', { 'app:name': appName, 'app:progress': '130' })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.app-progress-fill').attributes('style')).toContain('width: 100%')

    socket(wrapper, 'app:update-end', { 'app:name': appName })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.app-progress').exists()).toBe(false)
  })

  it('ignores progress of other apps and clears the bar when the update fails', async () => {
    const wrapper = render()
    socket(wrapper, 'app:install-progress', { 'app:name': 'Other', 'app:progress': '80' })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.app-progress').exists()).toBe(false)

    socket(wrapper, 'app:update-begin', { 'app:name': appName })
    socket(wrapper, 'app:install-progress', { 'app:name': appName, 'app:progress': '80' })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.app-progress').exists()).toBe(true)

    socket(wrapper, 'app:update-error', { 'app:name': appName })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.app-progress').exists()).toBe(false)
  })
})
