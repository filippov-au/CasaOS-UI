<template>
  <section class="assistant-settings modal-card" aria-labelledby="ai-settings-title" :aria-busy="busy">
    <header class="modal-card-head">
      <div>
        <h2 id="ai-settings-title">{{ $t('AI settings') }}</h2>
        <p>{{ $t('Connect once. Choose your model in chat.') }}</p>
      </div>
      <button type="button" class="settings-close" :disabled="busy" :aria-label="$t('Close AI settings')" @click="$emit('close')">×</button>
    </header>
    <section class="modal-card-body">
      <div v-if="error" class="settings-error" role="alert">
        {{ error }}
        <button v-if="!loaded" type="button" class="button is-small" :disabled="busy" @click="load">{{ $t('Retry connection') }}</button>
      </div>
      <p v-if="!loaded && busy" role="status">{{ $t('Loading AI settings…') }}</p>
      <template v-if="loaded">
        <h3 class="providers-title">{{ $t('Providers') }}</h3>
        <div class="provider-list">
          <button v-for="preset in presets" :key="preset.id" type="button" :class="['provider-row', { chosen: connectingProvider === preset.id }]" :aria-pressed="connectingProvider === preset.id" :disabled="busy" @click="connectProvider(preset.id)">
            <span class="provider-monogram" aria-hidden="true">{{ preset.name.charAt(0) }}</span>
            <span>{{ preset.name }}<small>{{ $t(isConnected(preset.id) ? 'Connected' : 'Connect with an API key') }}</small></span>
            <span :class="['connection-state', { connected: isConnected(preset.id) }]">{{ $t(isConnected(preset.id) ? 'Manage' : 'Connect') }}</span>
          </button>
        </div>
        <form v-if="connectingPreset" class="connection-form" @submit.prevent="saveSettings">
          <div class="connection-heading">
            <h3>{{ connectingPreset.name }}</h3>
            <a :href="connectingPreset.key_url" target="_blank" rel="noopener noreferrer">{{ $t('Get API key') }} ↗</a>
          </div>
          <label for="assistant-key">{{ $t('API key') }}</label>
          <input id="assistant-key" v-model="apiKey" type="password" autocomplete="new-password" maxlength="4096" :disabled="busy" :placeholder="$t(isConnected(connectingProvider) ? 'Leave blank to keep your saved key' : 'Paste your API key')" />
          <p class="settings-note">{{ $t('Stored privately on your CasaOS server. Connecting tests a short message with the provider. Your chats and tool results are sent to the model you choose.') }}</p>
          <div class="settings-actions">
            <button class="button is-small is-dark is-rounded" type="submit" :disabled="busy || (!apiKey.trim() && !isConnected(connectingProvider))">{{ $t(saving ? 'Connecting…' : isConnected(connectingProvider) ? 'Test & save' : 'Connect') }}</button>
            <button v-if="isConnected(connectingProvider)" type="button" class="button is-small is-rounded" :disabled="busy" @click="forgetKey">{{ $t('Disconnect') }}</button>
          </div>
          <p v-if="notice" class="settings-success" role="status">{{ notice }}</p>
        </form>
        <p class="catalog-credit">{{ catalogSource }}</p>
      </template>
    </section>
    <footer class="modal-card-foot">
      <button type="button" class="button is-small is-rounded" :disabled="busy" @click="$emit('close')">{{ $t('Done') }}</button>
    </footer>
  </section>
</template>

<script>
import assistant from '@/service/assistant'

export default {
  name: 'AssistantSettings',
  data: () => ({
    settings: { provider: 'deepseek', model: '', configured: false },
    presets: [], connections: [], connectingProvider: '', apiKey: '',
    catalogSource: 'Models.dev', loaded: false, busy: false, saving: false,
    error: '', notice: '', disposed: false,
  }),
  computed: {
    connectingPreset() { return this.presets.find(p => p.id === this.connectingProvider) },
  },
  mounted() { this.load() },
  beforeDestroy() { this.disposed = true; this.apiKey = '' },
  methods: {
    isConnected(id) { return this.connections.some(c => c.provider === id && c.configured) },
    connectProvider(id) { this.connectingProvider = id; this.apiKey = ''; this.error = ''; this.notice = '' },
    report(error) { this.error = error?.response?.data?.message || error?.message || this.$t('Could not reach the assistant service.') },
    async load() {
      this.busy = true; this.error = ''
      try {
        const { data } = await assistant.settings()
        if (this.disposed) return
        this.settings = data.data.settings; this.presets = data.data.presets
        this.connections = data.data.connections || (this.settings.configured ? [this.settings] : [])
        this.catalogSource = data.data.catalog_source || 'Models.dev'
        this.connectingProvider = this.settings.provider || this.presets[0]?.id || ''
        this.loaded = true
      } catch (error) { if (!this.disposed) this.report(error) } finally { this.busy = false }
    },
    async saveSettings() {
      if (this.busy || !this.connectingPreset) return
      this.busy = true; this.saving = true; this.error = ''; this.notice = ''
      const provider = this.connectingProvider
      const saved = this.connections.find(c => c.provider === provider)
      const available = this.connectingPreset.models || []
      const model = available.includes(saved?.model) ? saved.model : available[0]
      const apiKey = this.apiKey
      this.apiKey = ''
      try {
        const { data } = await assistant.saveSettings({ provider, model, api_key: apiKey, verify: true })
        if (this.disposed) return
        this.settings = data.data
        this.connections = [...this.connections.filter(c => c.provider !== provider), data.data]
        this.notice = this.$t('Provider connected. Choose your model in chat.')
      } catch (error) { if (!this.disposed) this.report(error) } finally { this.busy = false; this.saving = false }
    },
    async forgetKey() {
      if (this.busy) return
      this.busy = true; this.error = ''; this.notice = ''; this.apiKey = ''
      const provider = this.connectingProvider
      try {
        await assistant.disconnect(provider)
        if (this.disposed) return
        this.connections = this.connections.filter(c => c.provider !== provider)
        if (this.settings.provider === provider) this.settings.configured = false
        this.notice = this.$t('Provider disconnected.')
      } catch (error) { if (!this.disposed) this.report(error) } finally { this.busy = false }
    },
  },
}
</script>

<style scoped>
.assistant-settings.modal-card { width:min(640px,calc(100vw - 32px)); max-height:90vh; max-height:90dvh; margin:auto; border-radius:16px; overflow:hidden; color:#242424; background:#fff; box-shadow:0 20px 80px #0002; }
.assistant-settings .modal-card-head,.assistant-settings .modal-card-foot { background:#f7f7f6; padding:20px 24px; flex-shrink:0; }
.assistant-settings .modal-card-head { display:flex; align-items:flex-start; justify-content:space-between; border-bottom:1px solid #e8e8e8; }
.assistant-settings .modal-card-body { background:#fff; padding:24px; min-height:0; overflow:auto; }
.assistant-settings .modal-card-foot { justify-content:flex-end; border-top:1px solid #e8e8e8; }
.assistant-settings h2 { font-size:20px; font-weight:600; }
.modal-card-head p { font-size:12px; color:#757575; margin-top:5px; }
.settings-close { background:transparent; border:0; padding:0 4px; font-size:26px; color:#757575; cursor:pointer; }
.providers-title { font-size:12px; font-weight:600; margin-bottom:12px; }
.provider-list { display:grid; gap:8px; }
.provider-row { display:flex; align-items:center; gap:12px; width:100%; padding:14px; border:1px solid #e8e8e8; background:#fff; border-radius:10px; text-align:left; color:#353a36; font:inherit; font-size:14px; cursor:pointer; }
.provider-row.chosen { border-color:#9ead9f; background:#fafcf9; }
.provider-row small { display:block; color:#757575; font-size:11px; margin-top:4px; }
.provider-monogram { display:grid; place-items:center; width:34px; height:34px; border-radius:8px; background:#f0f2ee; font-size:16px; }
.connection-state { margin-left:auto; color:#757575; font-size:12px; }
.connection-state.connected { color:#547361; }
.connection-form { margin-top:24px; padding-top:20px; border-top:1px solid #e8e8e8; }
.connection-heading { display:flex; align-items:center; justify-content:space-between; gap:10px; }
.connection-heading h3 { font-size:14px; font-weight:600; }
.connection-heading a { color:#547361; font-size:12px; }
.connection-form label { display:block; font-size:12px; margin:16px 0 8px; }
.connection-form input { width:100%; padding:12px; border:1px solid #dedede; border-radius:8px; font:inherit; font-size:13px; color:#242424; background:#fff; }
.settings-note { font-size:12px; line-height:1.6; color:#757575; margin:12px 0 18px; }
.settings-actions { display:flex; gap:8px; flex-wrap:wrap; }
.settings-error { padding:12px; margin-bottom:16px; border:1px solid #f1ded1; border-radius:8px; background:#fff6f1; color:#9d5a3c; font-size:13px; overflow-wrap:anywhere; }
.settings-success { margin-top:14px; color:#547361; font-size:12px; }
.catalog-credit { margin-top:24px; color:#757575; font-size:10px; }
.assistant-settings button:disabled { opacity:.5; cursor:default; }
.assistant-settings button:focus-visible,.assistant-settings input:focus-visible,.assistant-settings a:focus-visible { outline:2px solid #5e8d76; outline-offset:3px; }
@media(max-width:620px) { .assistant-settings .modal-card-head,.assistant-settings .modal-card-body,.assistant-settings .modal-card-foot { padding:18px; } }
</style>
