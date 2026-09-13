<template>
  <section class="assistant-panel modal-card" aria-labelledby="assistant-title">
    <aside :class="['assistant-sidebar', { 'mobile-open': showTopics }]">
      <div class="sidebar-brand"><span class="brand-mark" aria-hidden="true"><b-icon icon="creation" size="is-small" /></span><span>{{ $t('AI assistant') }}</span><button type="button" class="quiet-button mobile-only" aria-label="Close conversations" @click="showTopics = false">×</button></div>
      <button class="new-chat-button" type="button" :disabled="busy" @click="newConversation"><b-icon icon="square-edit-outline" size="is-small" /><span>New chat</span></button>
      <p class="topics-label">Your conversations</p>
      <nav class="topic-list" aria-label="Conversations">
        <p v-if="!topics.length" class="no-topics">Your chats will appear here.</p>
        <div v-for="topic in topics" :key="topic.id" :class="['topic-row', { selected: session && session.id === topic.id }]">
          <button type="button" :title="topic.title" :disabled="busy" @click="selectTopic(topic.id)"><span v-if="['running', 'approval'].includes(topic.status)" class="status-dot connected" /><span class="topic-title">{{ topic.title }}</span></button>
          <button v-if="!['running', 'approval'].includes(topic.status)" class="delete-topic" type="button" :aria-label="'Delete conversation: ' + topic.title" :disabled="busy" @click="deleteTopic(topic.id)">×</button>
        </div>
      </nav>
    </aside>
    <main class="assistant-main">
      <header class="assistant-header">
        <button class="quiet-button mobile-only" type="button" aria-label="Show conversations" @click="showTopics = !showTopics"><b-icon icon="menu" /></button>
        <h1 id="assistant-title">{{ $t('AI assistant') }}</h1>
        <button type="button" class="model-trigger" :disabled="busy || settingsLoading || !!session" :title="session ? 'Start a new chat to change models' : 'Choose a model'" :aria-expanded="showModels" @click="openModels">{{ selectedModelName }} <span aria-hidden="true">⌄</span></button>
        <button class="quiet-button close-button" type="button" aria-label="Close assistant" @click="$emit('close')">×</button>
      </header>
      <div v-if="error" class="assistant-error" role="alert">{{ error }} <button type="button" class="quiet-button" @click="retry">Retry connection</button></div>
      <section v-if="showModels" class="model-picker" aria-labelledby="model-picker-title" @keydown.esc.stop="showModels = false">
        <div class="settings-title"><h2 id="model-picker-title">Choose a model</h2><button type="button" class="quiet-button" aria-label="Close model picker" @click="showModels = false">×</button></div>
        <label class="sr-only" for="model-search">Search models</label><input id="model-search" ref="modelSearch" v-model="modelSearch" type="search" placeholder="Search models or providers…" autocomplete="off" />
        <div class="model-results">
          <div v-for="group in filteredModelGroups" :key="group.id" class="model-group"><h3>{{ group.name }}</h3><button v-for="model in group.items" :key="model.id" type="button" :disabled="busy" :aria-pressed="settings.provider === group.id && settings.model === model.id" @click="chooseModel(group.id, model.id)"><span>{{ model.name }}<small>{{ model.context ? formatContext(model.context) + ' context' : model.id }}{{ model.reasoning ? ' · Reasoning' : '' }}</small></span><span v-if="settings.provider === group.id && settings.model === model.id" aria-hidden="true">✓</span></button></div>
          <p v-if="!filteredModelGroups.length" class="settings-note">{{ connections.length ? 'No matching models.' : $t('Connect a provider in CasaOS Settings to see its models.') }}</p>
        </div>
        <p class="catalog-credit">{{ catalogSource }}</p>
      </section>
      <form v-if="showCredential" class="provider-settings" @submit.prevent="saveCredential">
        <div class="settings-title"><div><h2>Add a private credential</h2><p>Use for an app password, indexer key or Plex claim token.</p></div><button type="button" class="quiet-button" aria-label="Close credential form" @click="closeCredential">×</button></div>
        <label for="credential-name">Credential name</label><input id="credential-name" v-model="credentialName" placeholder="usenet_password" pattern="[a-z][a-z0-9_]{0,47}" maxlength="48" autocomplete="off" required />
        <p v-if="credentialName === 'plex_claim'" class="settings-note">Sign in to <a href="https://plex.tv/claim" target="_blank" rel="noopener noreferrer">get a Plex claim token</a>, then paste it below. Tokens expire after four minutes.</p>
        <label for="credential-value">Secret value</label><input id="credential-value" v-model="credentialValue" type="password" autocomplete="new-password" maxlength="4096" required />
        <p class="settings-note">Used privately by this conversation’s tools. The AI provider receives only a named reference. The value is kept in server memory and must be added again after a restart.</p>
        <button class="primary-button" type="submit" :disabled="busy || active || !credentialName || !credentialValue">Add credential</button>
      </form>
      <p v-if="!busy && !settingsLoading && !providerConfigured" class="assistant-setup" role="status">{{ $t('Connect an AI provider in CasaOS Settings to start chatting.') }}</p>
      <div ref="transcript" class="assistant-transcript" role="log" aria-label="Assistant conversation" :aria-busy="running">
        <div v-if="!session && !showCredential" class="assistant-empty"><div class="empty-mark" aria-hidden="true"><b-icon icon="creation" /></div><h2>What can I help with?</h2><p>Your apps, your server. Let’s work on it together.</p><div class="assistant-suggestions"><button v-for="suggestion in suggestions" :key="suggestion.title" type="button" @click="draft = suggestion.prompt; focusComposer()"><span>{{ suggestion.title }}</span><small>{{ suggestion.detail }}</small></button></div></div>
        <div v-else-if="session" class="conversation-content">
          <div class="session-toolbar"><span :class="['session-status', session.status]">{{ statusLabel }}</span></div>
          <article v-for="(event, index) in session.events" :key="index" :class="['assistant-event', event.kind]">
            <template v-if="event.kind === 'tool' || event.kind === 'action'"><details><summary><b-icon :icon="event.kind === 'action' ? 'cog-outline' : 'check-circle-outline'" size="is-small" />{{ event.kind === 'action' ? 'Action' : 'Result' }} · {{ toolLabel(event.tool) }}</summary><pre>{{ event.text }}</pre></details></template>
            <template v-else><p v-if="event.kind !== 'user'" class="event-label">{{ event.kind === 'assistant' ? $t('AI assistant') : 'Activity' }}</p><p class="event-text">{{ event.text }}</p></template>
          <a v-if="verifiedURL(event)" class="verified-app-link" :href="verifiedURL(event)" target="_blank" rel="noopener noreferrer">Open app ↗ <span>{{ verifiedURL(event) }}</span></a>
          </article>
          <div v-if="running" class="assistant-working" role="status"><span class="status-dot connected" />Working through your request…</div>
        </div>
      </div>
      <div v-if="session && session.pending" class="assistant-approval"><p class="approval-label">Review change</p><h3>{{ toolLabel(session.pending.tool) }}</h3><pre>{{ session.pending.summary }}</pre><div><button class="primary-button" type="button" :disabled="busy" @click="decide(true)">Apply this change</button><button class="quiet-button" type="button" :disabled="busy" @click="decide(false)">Decline</button></div></div>
      <div class="composer-container">
        <form class="assistant-composer" @submit.prevent="send">
          <label class="sr-only" for="assistant-message">Message the assistant</label><textarea id="assistant-message" ref="composer" v-model="draft" rows="2" maxlength="16000" placeholder="Ask anything about your CasaOS…" :disabled="busy || active || terminal" @keydown.enter.exact="composerEnter" @keydown.ctrl.enter.prevent="send" @keydown.meta.enter.prevent="send" />
          <div class="composer-footer"><div class="composer-tools"><button v-if="session && !inspectionOnly" type="button" class="credential-button" :disabled="busy || active || terminal" aria-label="Add private credential" title="Add private credential" :aria-expanded="showCredential" @click="toggleCredential"><b-icon icon="key-outline" size="is-small" /></button><div class="mode-control"><b-icon icon="shield-check-outline" size="is-small" /><label class="sr-only" for="assistant-mode">Permissions</label><select id="assistant-mode" v-model="mode" :disabled="!!session" :title="modeDescription"><option value="read">Inspect only</option><option v-if="!inspectionOnly" value="review">Review changes</option><option v-if="!inspectionOnly" value="auto">Automatic changes</option></select></div></div><button v-if="active" type="button" class="stop-button" :disabled="busy" @click="stop">Stop task</button><button v-else type="submit" class="send-button" :disabled="!canSend" aria-label="Send message">↑</button></div>
        </form>
        <p class="composer-note">{{ active ? 'The task continues on your server when you close this panel.' : modeDescription }}</p>
      </div>
    </main>
  </section>
</template>

<script>
import assistant from '@/service/assistant'
import events from '@/events/events'

export default {
  name: 'AssistantPanel',
  props: { inspectionOnly: { type: Boolean, default: false } },
  data: () => ({
    settings: { provider: 'deepseek', model: '', configured: false }, presets: [],
    connections: [], showModels: false, modelSearch: '', catalogSource: 'Models.dev',
    topics: [], showTopics: false, session: null, mode: 'review', draft: '', error: '', busy: false, settingsLoading: false,
    pollTimer: null, disposed: false, refreshSequence: 0,
    showCredential: false, credentialName: '', credentialValue: '',
    suggestions: [
      { title: 'Investigate a problem', detail: 'Find what is failing and why', prompt: 'Inspect my installed apps and identify anything unhealthy. Explain what you find before suggesting a fix.' },
      { title: 'Set up a media stack', detail: 'Sonarr + NZBGet + Plex', prompt: 'Help me set up Sonarr, NZBGet and Plex together. Inspect what is already installed, ask me for the storage paths and account details you need, then configure shared downloads and media libraries and verify the setup.' },
      { title: 'Install an app', detail: 'From first container to ready', prompt: 'I want to install a new app. First inspect my server and help me choose the right settings.' },
    ],
  }),
  computed: {
    storageKey() { return `casa-assistant-session:${this.$store?.state?.user?.username || 'user'}` },
    active() { return this.session && ['running', 'approval'].includes(this.session.status) },
    running() { return this.session?.status === 'running' },
    terminal() { return this.session && ['error', 'cancelled'].includes(this.session.status) },
    providerConfigured() { return this.session?.provider ? this.isConnected(this.session.provider) : this.settings.configured },
    canSend() { return !!this.draft.trim() && this.providerConfigured && !this.busy && !this.settingsLoading && !this.active && !this.terminal },
    selectedModelName() {
      const provider = this.session?.provider || this.settings.provider
      const model = this.session?.model || this.settings.model
      return this.presets.find(p => p.id === provider)?.model_details?.find(m => m.id === model)?.name || model || 'Choose a model'
    },
    filteredModelGroups() {
      const query = this.modelSearch.trim().toLowerCase()
      return this.presets.filter(p => this.isConnected(p.id)).map(p => ({ ...p, items: (p.model_details || p.models.map(id => ({ id, name: id }))).filter(m => `${p.name} ${m.name} ${m.id}`.toLowerCase().includes(query)) })).filter(p => p.items.length)
    },
    modeDescription() { return { read: 'Read status, logs and web pages. No app changes.', review: 'Inspect freely. Review each proposed change before it runs.', auto: 'Allow installation, configuration and restarts for this task without individual approvals.' }[this.mode] },
    statusLabel() { return { running: 'In progress', approval: 'Your review is needed', done: 'Ready for your reply', error: 'Task interrupted', cancelled: 'Stopped' }[this.session?.status] || '' },
  },
  async mounted() { if (this.inspectionOnly) this.mode = 'read'; await this.load() },
  beforeDestroy() { this.disposed = true; clearTimeout(this.pollTimer); this.credentialValue = '' },
  methods: {
    verifiedURL(event) {
      if (event.kind !== 'tool' || !['publish_app', 'check_app_url'].includes(event.tool) || !event.url) return ''
      try { const url = new URL(event.url); return url.protocol === 'https:' && !url.username && !url.password ? url.href : '' } catch { return '' }
    },
    composerEnter(event) { if (event.isComposing) return; event.preventDefault(); this.send() },
    isConnected(id) { return this.connections.some(c => c.provider === id && c.configured) },
    formatContext(count) { return count >= 1000000 ? `${+(count / 1000000).toFixed(1)}M` : `${Math.round(count / 1000)}K` },
    openModels() { this.closeCredential(); this.showModels = !this.showModels; this.modelSearch = ''; if (this.showModels) this.$nextTick(() => this.$refs.modelSearch?.focus()) },
    async chooseModel(provider, model) {
      if (this.busy || this.settingsLoading || this.session) return
      this.busy = true; this.error = ''
      try { const { data } = await assistant.saveSettings({ provider, model }); this.settings = data.data; this.showModels = false; this.focusComposer() }
      catch (error) { this.report(error) } finally { this.busy = false }
    },
    toggleCredential() { if (this.showCredential) this.closeCredential(); else { this.showModels = false; this.showCredential = true } },
    closeCredential() { this.showCredential = false; this.credentialValue = ''; this.credentialName = '' },
    async saveCredential() {
      if (!this.session || this.active || this.busy || !this.credentialValue) return
      this.busy = true; this.error = ''
      try {
        const name = this.credentialName
        const { data } = await assistant.addCredential(this.session.id, name, this.credentialValue)
        this.acceptSession(data.data); this.closeCredential(); this.draft = `Use $secret:${name} for the credential I added.`; this.focusComposer()
      } catch (error) { this.report(error) } finally { this.busy = false }
    },
    async loadTopics() { const { data } = await assistant.list(); if (!this.disposed) this.topics = data.data },
    focusComposer() { this.$nextTick(() => this.$refs.composer?.focus()) },
    async selectTopic(id) { if (this.busy) return; this.closeCredential(); clearTimeout(this.pollTimer); this.showTopics = false; this.error = ''; this.busy = true; try { await this.refresh(id) } finally { this.busy = false } },
    async deleteTopic(id) { if (this.busy) return; this.busy = true; try { await assistant.remove(id); if (this.session?.id === id) { this.session = null; sessionStorage.removeItem(this.storageKey) }; await this.loadTopics() } catch (error) { this.report(error) } finally { this.busy = false } },
    toolLabel(name) { return name.replace(/_/g, ' ') },
    report(error) { this.error = error?.response?.data?.message || error?.message || 'Could not reach the assistant service.' },
    async load() {
      this.busy = true
      try {
        await this.refreshSettings()
        await this.loadTopics()
        const id = sessionStorage.getItem(this.storageKey)
        if (id) await this.refresh(id)
      } catch (error) { this.report(error) } finally { this.busy = false }
    },
    async refreshSettings() {
      this.settingsLoading = true
      try {
        const { data } = await assistant.settings()
        if (this.disposed) return
        this.settings = data.data.settings; this.presets = data.data.presets
        this.connections = data.data.connections || (this.settings.configured ? [this.settings] : [])
        this.catalogSource = data.data.catalog_source || 'Models.dev'
      } catch (error) {
        if (!this.disposed) {
          this.settings = { ...this.settings, configured: false }
          this.connections = []
        }
        throw error
      } finally { this.settingsLoading = false }
    },
    acceptSession(session) {
      if (this.disposed) return
      const previousCount = this.session?.id === session.id ? this.session.events.length : 0
      if (session.events.slice(previousCount).some(event => event.card_updated && this.verifiedURL(event))) this.$EventBus?.$emit(events.RELOAD_APP_LIST)
      this.session = session; this.mode = session.mode
      sessionStorage.setItem(this.storageKey, session.id)
      const existing = this.topics.find(t => t.id === session.id)
      const first = session.events.find(e => e.kind === 'user')
      const topic = { id: session.id, title: existing?.title || first?.text.slice(0, 72) || 'New chat', status: session.status }
      this.topics = [topic, ...this.topics.filter(t => t.id !== session.id)]
      this.schedulePoll()
    },
    schedulePoll() {
      clearTimeout(this.pollTimer)
      if (!this.disposed && this.running) this.pollTimer = setTimeout(() => this.refresh(this.session.id), 1500)
    },
    async refresh(id) {
      const sequence = ++this.refreshSequence
      try { const { data } = await assistant.get(id); if (sequence === this.refreshSequence) this.acceptSession(data.data) }
      catch (error) {
        if (sequence !== this.refreshSequence || this.disposed) return
        if (error?.response?.status === 404) { sessionStorage.removeItem(this.storageKey); this.session = null; this.error = 'This conversation is no longer available. Start a new conversation.' }
        else { this.report(error); this.schedulePoll() }
      }
    },
    async retry() {
      this.error = ''
      try {
        if (this.session) { await this.refreshSettings(); await this.refresh(this.session.id) }
        else await this.load()
      } catch (error) { this.report(error) }
    },
    async send() {
      if (!this.canSend) return
      this.busy = true; this.error = ''
      try {
        const { data } = this.session ? await assistant.reply(this.session.id, this.draft.trim()) : await assistant.start(this.draft.trim(), this.mode)
        this.acceptSession(data.data); this.draft = ''
        this.$nextTick(() => { if (this.$refs.transcript) this.$refs.transcript.scrollTop = this.$refs.transcript.scrollHeight })
      } catch (error) { this.report(error) } finally { this.busy = false }
    },
    async decide(allow) {
      if (!this.session?.pending || this.busy) return
      this.busy = true; this.error = ''
      try { const { data } = await assistant.decide(this.session.id, this.session.pending.id, allow); this.acceptSession(data.data) }
      catch (error) { this.report(error) } finally { this.busy = false }
    },
    async stop() {
      this.busy = true; this.error = ''
      try { const { data } = await assistant.cancel(this.session.id); this.acceptSession(data.data) }
      catch (error) { this.report(error) } finally { this.busy = false }
    },
    async newConversation() {
      if (this.busy) return
      this.closeCredential(); clearTimeout(this.pollTimer); this.refreshSequence++; sessionStorage.removeItem(this.storageKey)
      this.session = null; this.error = ''; this.draft = ''; this.showTopics = false; this.showModels = false
      this.focusComposer()
      try { await this.loadTopics() } catch (error) { this.report(error) }
    },
  },
}
</script>

<style scoped>
.verified-app-link { display: block; margin: 10px 0; padding: 12px 14px; border: 1px solid #d6e5db; border-radius: 10px; background: #f4f9f6; color: #24553b; font-weight: 600; }
.verified-app-link span { display: block; margin-top: 4px; font-size: 12px; font-weight: 400; overflow-wrap: anywhere; }
.model-trigger { display:flex; align-items:center; gap:10px; border:0; background:#f6f6f5; border-radius:8px; padding:8px 11px; color:#5d655f; max-width:60%; font-size:12px !important; text-align:left; }
.model-picker { position:absolute; top:70px; right:28px; z-index:5; width:min(410px,calc(100% - 28px)); background:white; border:1px solid #e3e5e2; border-radius:14px; padding:18px; box-shadow:0 14px 50px #17251d21; }
.model-picker h2 { font-size:15px; font-weight:500; }.model-picker input { width:100%; padding:11px; border:1px solid #dedede; border-radius:8px; background:#fafaf9; }.model-results { max-height:350px; overflow:auto; margin:12px -6px; }.model-group h3 { font-size:10px; text-transform:uppercase; letter-spacing:.07em; color:#8b938c; padding:12px 9px 5px; }.model-group button { display:flex; justify-content:space-between; align-items:center; gap:12px; width:100%; padding:10px; border:0; border-radius:7px; background:white; color:#353a36; text-align:left; font-size:12px; }.model-group button:hover,.model-group button[aria-pressed="true"] { background:#f2f5f1; }.model-group small { display:block; font-size:10px; color:#969c96; margin-top:4px; }.catalog-credit { color:#a1a6a1; font-size:10px; margin-top:16px; }
.composer-tools { display:flex; align-items:center; gap:6px; }.credential-button { display:flex; align-items:center; justify-content:center; border:0; background:transparent; color:#888; padding:5px; border-radius:6px; }.credential-button:hover { background:#eaeae8; }
.assistant-panel { --ai-text:#242424; --ai-muted:#757575; --ai-line:#e8e8e8; display:flex; flex-direction:row; width:min(1160px,96vw); max-width:1160px; height:min(840px,94vh); margin:auto; color:var(--ai-text); background:#fff; border:1px solid #e5e5e5; border-radius:16px; overflow:hidden; box-shadow:0 20px 80px #0002; font-size:14px; }
.assistant-panel button,.assistant-panel input,.assistant-panel select,.assistant-panel textarea { font:inherit; }.assistant-panel button { cursor:pointer; }.assistant-panel button:disabled { cursor:default; opacity:.4; }.assistant-panel button:focus-visible,.assistant-panel select:focus-visible,.assistant-panel input:focus-visible,.assistant-panel textarea:focus-visible { outline:2px solid #5e8d76; outline-offset:3px; }
.assistant-sidebar { display:flex; flex-direction:column; width:250px; flex-shrink:0; background:#f7f7f6; padding:22px 12px 12px; border-right:1px solid #efefed; }.sidebar-brand { display:flex; align-items:center; gap:8px; font-size:17px; font-weight:600; padding:0 10px 26px; }.brand-mark { display:grid; place-items:center; width:25px; height:25px; color:#fff; background:#232725; border-radius:7px; font-size:17px; font-weight:500; }.brand-ai { color:#858585; font-size:12px; font-weight:400; }.new-chat-button { display:flex; align-items:center; gap:10px; border:1px solid #dededb; border-radius:9px; background:#fff; color:#333; padding:11px 12px; margin:0 3px 28px; text-align:left; }.new-chat-button:hover { background:#fafafa; }.topics-label { font-size:11px; font-weight:500; color:#858585; padding:0 12px; margin-bottom:8px; }.topic-list { flex:1; overflow:auto; }.no-topics { font-size:12px; color:#a0a0a0; padding:10px 12px; }.topic-row { display:flex; align-items:center; border-radius:7px; margin:2px 0; }.topic-row.selected { background:#e9e9e6; }.topic-row:hover { background:#ededea; }.topic-row>button:first-child { display:flex; align-items:center; gap:6px; flex:1; min-width:0; background:transparent; border:0; text-align:left; padding:10px 12px; color:#454545; font-size:12px; }.topic-title { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.delete-topic { border:0; background:transparent; color:#858585; padding:5px 10px; opacity:0; }.topic-row:hover .delete-topic,.delete-topic:focus-visible { opacity:1; }
.assistant-main { display:flex; flex-direction:column; flex:1; min-width:0; min-height:0; position:relative; }.assistant-header { display:flex; align-items:center; justify-content:space-between; padding:20px 28px; gap:10px; flex-shrink:0; }.assistant-header h1 { font-size:18px; font-weight:500; flex:1; letter-spacing:-.3px; }.assistant-header h1 span { color:#999; font-size:11px; font-weight:400; margin-left:10px; }.quiet-button { border:0; background:transparent; color:#777; padding:8px 12px; border-radius:7px; font-size:12px !important; }.quiet-button:hover { background:#f4f4f4; color:#222; }.close-button { font-size:23px !important; line-height:1; padding:5px 8px; }.assistant-transcript { flex:1; min-height:0; overflow:auto; padding:12px 28px 24px; }.assistant-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; min-height:250px; padding-bottom:36px; text-align:center; }.empty-mark { color:#6d8b7b; margin-bottom:18px; }.assistant-empty h2 { font-size:30px; font-weight:500; letter-spacing:-.8px; line-height:1.25; margin-bottom:10px; }.assistant-empty>p { font-size:13px; color:#929292; }.assistant-suggestions { display:flex; flex-wrap:wrap; justify-content:center; gap:9px; margin-top:32px; }.assistant-suggestions button { border:1px solid #e7e7e7; border-radius:10px; background:#fff; padding:12px 15px; text-align:left; color:#535353; font-size:12px; transition:background .15s; }.assistant-suggestions button:hover { background:#f7f7f6; }.assistant-suggestions small { display:block; color:#aaa; font-size:10px; margin-top:5px; }
.composer-container { flex-shrink:0; width:100%; max-width:760px; margin:0 auto; padding:0 28px 16px; }.assistant-composer { background:#f5f5f4; border:1px solid #e9e9e7; border-radius:20px; padding:15px 16px 12px; }.assistant-composer textarea { display:block; resize:none; width:100%; min-height:50px; max-height:160px; background:transparent; color:#242424; border:0; padding:2px; line-height:1.5; font-size:14px; }.assistant-panel ::placeholder { color:#9b9b9b; opacity:1; }.composer-footer { display:flex; align-items:center; justify-content:space-between; padding-top:8px; }.mode-control { display:flex; gap:4px; align-items:center; color:#858585; }.mode-control select { background:transparent; color:#797979; border:0; font-size:11px; padding:4px; max-width:180px; cursor:pointer; }.composer-note { font-size:10px; color:#a1a1a1; text-align:center; margin:10px 0 0; line-height:1.4; }.send-button { display:grid; place-items:center; border:0; width:33px; height:33px; border-radius:50%; color:#fff; background:#292929; font-size:23px !important; }.send-button:disabled { background:#dededd; color:#999; opacity:1 !important; }.stop-button { border:1px solid #d4d4d4; background:#fff; border-radius:16px; padding:6px 12px; color:#555; font-size:11px !important; }.primary-button { border:0; background:#2e3531; color:#fff; border-radius:7px; padding:10px 16px; font-size:12px !important; }
.conversation-content { max-width:700px; margin:0 auto; }.session-toolbar { padding-bottom:16px; }.session-status { color:#909090; font-size:11px; }.session-status.approval { color:#9c773c; }.assistant-event { margin-bottom:22px; }.assistant-event.user { background:#f1f1f0; padding:12px 17px; border-radius:16px; margin-left:auto; max-width:86%; width:fit-content; }.event-label { font-size:11px; font-weight:500; color:#999; margin-bottom:9px; }.event-text { white-space:pre-wrap; overflow-wrap:anywhere; line-height:1.75; font-size:13px; }.assistant-event summary { display:flex; align-items:center; gap:7px; cursor:pointer; color:#909090; font-size:11px; padding:8px 0; }.assistant-event summary:after { content:'⌄'; margin-left:5px; }.assistant-event.tool,.assistant-event.action { margin-bottom:4px; }.assistant-panel pre { background:#f7f7f7; color:#606060; white-space:pre-wrap; overflow-wrap:anywhere; font-size:11px; padding:12px; max-height:210px; overflow:auto; border:1px solid #eee; border-radius:8px; }.assistant-event.error { color:#a95444; }.assistant-error { margin:0 28px 12px; background:#fff6f1; border:1px solid #f1ded1; color:#9d5a3c; border-radius:8px; padding:10px 14px; font-size:12px; }.assistant-working { display:flex; align-items:center; gap:8px; font-size:12px; color:#909090; padding:18px 0; }.status-dot { width:6px; height:6px; border-radius:50%; background:#aaa; display:inline-block; flex-shrink:0; }.status-dot.connected { background:#76a185; }
.assistant-setup { margin:0 28px 16px; padding:14px; border:1px solid #e8e8e8; border-radius:10px; font-size:12px; color:#757575; flex-shrink:0; }
.assistant-approval { margin:0 28px 16px; border:1px solid #dedfd6; background:#fbfcf9; border-radius:10px; padding:16px; max-height:40%; overflow:auto; }.approval-label { font-size:10px; color:#7c8d67; margin-bottom:5px; }.assistant-approval h3 { font-size:14px; margin-bottom:10px; }.assistant-approval pre { margin-bottom:12px; }.assistant-approval .quiet-button { margin-left:8px; }
.provider-settings { margin:0 28px 16px; padding:22px; border:1px solid #e8e8e8; border-radius:12px; background:#fff; box-shadow:0 6px 20px #00000005; max-height:68%; min-height:140px; overflow:auto; flex-shrink:1; }.settings-title { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; }.settings-title h2 { font-size:17px; font-weight:500; }.settings-title p { color:#999; font-size:11px; margin-top:4px; }.settings-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }.provider-settings label { display:block; font-size:11px; color:#777; margin:10px 0 6px; }.provider-settings select,.provider-settings input { width:100%; border:1px solid #dedede; border-radius:7px; background:#fff; color:#444; font-size:12px; padding:10px; }.settings-note { color:#999; font-size:10px; line-height:1.6; margin:12px 0; }.settings-actions { display:flex; gap:8px; }.sr-only { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0,0,0,0); }.mobile-only { display:none; }
@media(max-width:850px) { .assistant-sidebar { width:215px; }.assistant-suggestions { gap:7px; }.assistant-suggestions button { padding:10px; }.assistant-suggestions small { display:none; }.assistant-header h1 span { display:none; } }
@media(max-width:620px) { .assistant-panel { width:100vw; max-width:100vw; height:100dvh; max-height:100dvh; border-radius:0; border:0; }.assistant-sidebar { display:none; }.assistant-sidebar.mobile-open { display:flex; position:absolute; z-index:4; left:0; top:0; bottom:0; width:260px; box-shadow:20px 0 80px #0003; }.mobile-only { display:inline-flex; }.sidebar-brand .mobile-only { margin-left:auto; }.assistant-header { padding:16px; }.assistant-transcript { padding:12px 18px; }.assistant-empty { padding-bottom:20px; }.assistant-empty h2 { font-size:25px; }.assistant-empty>p { font-size:11px; }.assistant-suggestions { max-width:300px; margin-top:25px; }.composer-container { padding:0 14px 14px; }.provider-settings { margin:0 14px 12px; padding:16px; max-height:75%; }.assistant-setup,.assistant-error,.assistant-approval { margin-left:14px; margin-right:14px; }.settings-grid { grid-template-columns:1fr; gap:0; }.delete-topic { opacity:1; } }
</style>
