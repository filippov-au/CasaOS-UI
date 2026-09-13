import { shallowMount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import AppSection from './AppSection.vue'
import AssistantPanel from '@/components/Assistant/AssistantPanel.vue'
import { openAssistantDialog } from '@/components/Assistant/dialog'

vi.mock('./AppCard.vue', () => ({ default: {} }))
vi.mock('./AppPanel.vue', () => ({ default: {} }))
vi.mock('@/components/Apps/ExternalLinkPanel.vue', () => ({ default: {} }))
vi.mock('@/components/Assistant/AssistantPanel.vue', () => ({ default: {} }))
vi.mock('@/components/Assistant/dialog', () => ({ openAssistantDialog: vi.fn() }))
vi.mock('@/mixins/app/Business_ShowNewAppTag', () => ({ default: {} }))
vi.mock('@/mixins/app/Business_LinkApp', () => ({ default: {} }))
vi.mock('@/mixins/base/common-i18n', () => ({ ice_i18n: vi.fn() }))

let wrapper
afterEach(() => { wrapper?.destroy(); vi.unstubAllGlobals() })
it('keeps the assistant beside the add menu while apps load and opens the chat dialog', async () => {
  vi.stubGlobal('localStorage', { getItem: () => null })
  const commit = vi.fn()
  wrapper = shallowMount({ ...AppSection, created: [], mounted: [] }, {
    mocks: { $t: s => s, $store: { state: {}, commit } },
    stubs: ['b-icon', 'b-dropdown', 'b-dropdown-item'],
  })
  await wrapper.setData({ isLoading: true })
  const button = wrapper.find('.app-section-header button.assistant-launcher')
  expect(button.text()).toBe('AI assistant')
  expect(button.element.nextElementSibling.tagName.toLowerCase()).toBe('b-dropdown-stub')
  await button.trigger('click')
  expect(commit).toHaveBeenCalledWith('SET_SIDEBAR_CLOSE')
  expect(openAssistantDialog).toHaveBeenCalledWith(wrapper.vm, AssistantPanel, { ariaLabel: 'AI assistant' })
})
