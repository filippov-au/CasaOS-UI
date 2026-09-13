import { createLocalVue, mount } from '@vue/test-utils'
import Buefy from 'buefy'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { openAssistantDialog } from './dialog'

const localVue = createLocalVue()
localVue.use(Buefy)
const Chat = { render: h => h('section', { class: 'assistant-panel' }, [h('button', 'Settings'), h('textarea')]) }
const Settings = { render: h => h('section', [h('button', 'Close settings')]) }
let parent
let opened
beforeEach(() => {
  vi.useFakeTimers()
  parent = mount({ template: '<button>Open chat</button>' }, { localVue, attachTo: document.body })
  opened = []
})
afterEach(async () => {
  for (const modal of opened.reverse()) if (!modal._isDestroyed) modal.close()
  await vi.runAllTimersAsync()
  parent.destroy()
  vi.useRealTimers()
  document.body.innerHTML = ''
})
const open = (owner, component, options) => {
  const modal = openAssistantDialog(owner, component, options)
  opened.push(modal)
  return modal
}

it('prevents duplicate dialogs and closes only settings on Escape, restoring chat focus and scroll lock', async () => {
  parent.element.focus()
  const chat = open(parent.vm, Chat)
  await localVue.nextTick()
  const chatPanel = chat.$children[0]
  const trigger = chatPanel.$el.querySelector('button')
  trigger.focus()
  const onClose = vi.fn()
  const settings = open(chatPanel, Settings, { onClose })
  await localVue.nextTick()
  expect(openAssistantDialog(chatPanel, Settings)).toBe(settings)
  expect(document.querySelectorAll('.modal').length).toBe(2)
  expect(chat.$el.inert).toBe(true)
  document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }))
  expect(chat.isActive).toBe(true)
  expect(settings.isActive).toBe(false)
  expect(onClose).toHaveBeenCalledOnce()
  await vi.advanceTimersByTimeAsync(200)
  expect(chat.$el.inert).toBeFalsy()
  expect(chat.$el.hasAttribute('aria-hidden')).toBe(false)
  expect(document.activeElement).toBe(trigger)
  expect(document.body.classList.contains('is-noscroll')).toBe(true)
  document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }))
  await vi.advanceTimersByTimeAsync(200)
  expect(document.activeElement).toBe(parent.element)
})

it('keeps Escape from closing a dialog during a provider request', async () => {
  let busy = true
  const settings = open(parent.vm, Settings, { canDismiss: () => !busy })
  await localVue.nextTick()
  document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }))
  expect(settings.isActive).toBe(true)
  busy = false
  document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }))
  expect(settings.isActive).toBe(false)
})

it('wraps Tab between visible controls and ignores hidden mobile controls', async () => {
  const chat = open(parent.vm, Chat)
  await localVue.nextTick()
  const [first, last] = chat.$el.querySelectorAll('button, textarea')
  for (const el of [first, last]) el.getClientRects = () => [{}]
  const hidden = document.createElement('button')
  chat.$el.appendChild(hidden)
  last.focus()
  last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
  expect(document.activeElement).toBe(first)
  first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }))
  expect(document.activeElement).toBe(last)
})
