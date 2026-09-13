import AssistantSettings from './AssistantSettings.vue'
import { openAssistantDialog } from './dialog'

export default function openAssistantSettings(parent, options = {}) {
  return openAssistantDialog(parent, AssistantSettings, {
    width: 640,
    ariaLabel: parent.$t('AI settings'),
    canCancel: ['escape'],
    canDismiss: modal => !modal.$children[0]?.busy && !modal.$children[0]?.npmBusy,
    ...options,
  })
}
