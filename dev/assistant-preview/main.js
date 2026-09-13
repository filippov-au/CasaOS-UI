import Vue from 'vue/dist/vue.esm.js'
import Buefy from 'buefy'
import 'buefy/dist/buefy.css'
import '@mdi/font/css/materialdesignicons.css'
import Panel from '../../src/components/Assistant/AssistantPanel.vue'
import openAssistantSettings from '../../src/components/Assistant/openSettings'

Vue.use(Buefy)
Vue.prototype.$t = text => text
Vue.prototype.$store = { state: { user: { username: 'local-preview' } } }
new Vue({
  methods: {
    openSettings() {
      openAssistantSettings(this, {
        onClose: () => this.$refs.chat.refreshSettings().catch(error => this.$refs.chat.report(error)),
      })
    },
  },
  render(h) {
    return h('div', { attrs: { class: 'preview' } }, [
      h('div', { class: 'preview-note' }, [
        h('span', 'Local verification · Docker inspection only · Provider messages use your saved API key'),
        h('button', { class: 'button is-small is-rounded ml-3', attrs: { type: 'button' }, on: { click: this.openSettings } }, 'AI settings'),
      ]),
      h(Panel, { ref: 'chat', props: { inspectionOnly: true } }),
    ])
  },
}).$mount('#app')
const style = document.createElement('style')
style.textContent = 'html,body{margin:0;background:#eceeeb}.preview{padding:14px 24px}.preview-note{font:12px system-ui,sans-serif;text-align:center;color:#68716a;margin:0 0 12px}@media(max-width:620px){.preview{padding:0}.preview-note{padding:10px;margin:0}.assistant-panel{height:calc(100dvh - 50px)!important}}'
document.head.append(style)
