// Buefy listens for Escape on every modal, including dialogs behind another one.
// Keep dismissal, focus and scroll ownership with the top assistant dialog.
const dialogs = new Map()

export function openAssistantDialog(parent, component, options = {}) {
  if (dialogs.has(component)) return dialogs.get(component)

  const { onClose, canDismiss = () => true, focusTarget = document.activeElement, ...props } = options
  const underneath = parent.$el?.closest?.('.modal') || parent.$el?.closest?.('.assistant-panel')
  const wasInert = underneath?.inert
  const previousHidden = underneath?.getAttribute('aria-hidden')
  if (underneath) {
    underneath.inert = true
    underneath.setAttribute('aria-hidden', 'true')
  }
  const modal = parent.$buefy.modal.open({
    parent, component, hasModalCard: true, width: 1160,
    trapFocus: false, canCancel: ['escape', 'outside'], scroll: 'keep',
    ariaRole: 'dialog', ariaModal: true,
    ...props,
  })
  dialogs.set(component, modal)
  const isTop = () => Array.from(dialogs.values()).pop() === modal
  const onEscape = event => {
    if (!isTop() || !['Escape', 'Esc'].includes(event.key)) return
    event.stopImmediatePropagation()
    if (modal.isActive && canDismiss(modal)) modal.cancel('escape')
  }
  // Buefy's focus trap includes hidden mobile controls. Filter by visibility here.
  const onTab = event => {
    if (!isTop() || !modal.isActive || event.key !== 'Tab') return
    const controls = Array.from(modal.$el.querySelectorAll('button, a[href], input, select, textarea, [tabindex]'))
      .filter(el => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length && !el.closest('[inert]'))
    const first = controls[0]
    const last = controls[controls.length - 1]
    if (!first) { event.preventDefault(); modal.$el.focus(); return }
    if (!controls.includes(document.activeElement) || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
      event.preventDefault()
      ;(event.shiftKey ? last : first).focus()
    }
  }
  document.addEventListener('keyup', onEscape, true)
  document.addEventListener('keydown', onTab, true)
  const closeWithParent = () => { if (!modal._isDestroyed) modal.close() }
  modal.$once('close', () => {
    if (!parent._isDestroyed) onClose?.()
  })
  modal.$once('hook:destroyed', () => {
    dialogs.delete(component)
    document.removeEventListener('keyup', onEscape, true)
    document.removeEventListener('keydown', onTab, true)
    parent.$off('hook:beforeDestroy', closeWithParent)
    if (underneath) {
      underneath.inert = wasInert
      if (previousHidden === null) underneath.removeAttribute('aria-hidden')
      else underneath.setAttribute('aria-hidden', previousHidden)
    }
    // Buefy clears the body's scroll lock when any modal is destroyed.
    const remaining = Array.from(dialogs.values()).pop()
    if (remaining?.isActive) remaining.handleScroll()
    if (!parent._isDestroyed) {
      if (focusTarget?.isConnected && !focusTarget.disabled) focusTarget.focus()
      else if (remaining?.isActive) remaining.$el.focus()
    }
  })
  parent.$once('hook:beforeDestroy', closeWithParent)
  return modal
}
