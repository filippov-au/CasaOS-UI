<template>
  <main class="system-updates">
    <div class="updates-page">
      <router-link to="/" class="updates-back">← {{ $t('Back to dashboard') }}</router-link>
      <header class="updates-header">
        <div>
          <p class="updates-eyebrow">CasaOS</p>
          <h1>{{ $t('System updates') }}</h1>
          <p class="updates-muted">{{ $t('See exactly what is installed and what will change.') }}</p>
        </div>
        <b-button rounded :loading="loading" :disabled="loading" @click="refresh">
          {{ $t('Check for updates') }}
        </b-button>
      </header>

      <section class="updates-summary" aria-live="polite">
        <div>
          <h2>{{ statusText }}</h2>
          <p v-if="info" class="updates-muted">
            {{ $t('Installed version') }}: v{{ info.current_version }}
            <span v-if="source"> · {{ source.owner }} / {{ source.branch }}</span>
          </p>
          <p v-if="source && source.checked_at" class="updates-muted updates-checked">
            {{ $t('Last checked') }}: {{ formatDate(source.checked_at) }}
          </p>
        </div>
        <b-button v-if="running || (info && info.need_update)" rounded type="is-dark"
                  :disabled="!running && (!canUpdate || loading)" @click="openUpdate">
          {{ $t(running ? 'View update progress' : 'Review update') }}
        </b-button>
      </section>

      <b-message v-if="error" type="is-danger" :closable="false" role="alert">{{ error }}</b-message>
      <b-message v-if="source && !source.enabled" type="is-info" :closable="false">
        {{ $t('Source updater setup is incomplete. Run casaos-source-update update once from the terminal.') }}
      </b-message>
      <b-message v-if="source && source.operation === 'failed'" type="is-danger" :closable="false">
        {{ $t('The last system update failed. Review the update and try again.') }}
      </b-message>

      <section v-if="source" class="updates-components" :aria-label="$t('System components')">
        <article v-for="repo in repositories" :key="repo.name" class="updates-repository">
          <header class="updates-repo-header">
            <div>
              <h2>{{ repo.name }}</h2>
              <a :href="repoUrl(repo)" target="_blank" rel="noopener noreferrer">
                {{ $t('Repository') }} <span aria-hidden="true">↗</span>
              </a>
              <span class="updates-link-divider">·</span>
              <a :href="`${repoUrl(repo)}/commits/${encodeURIComponent(source.branch)}`" target="_blank" rel="noopener noreferrer">
                {{ $t('Commit history') }} <span aria-hidden="true">↗</span>
              </a>
            </div>
            <span class="updates-badge" :class="{ 'updates-badge-changed': changed(repo) }">{{ repoStatus(repo) }}</span>
          </header>
          <div class="updates-commits">
            <div>
              <p class="updates-commit-label">{{ $t('Installed commit') }}</p>
              <a v-if="validCommit(repo.installed)" :href="`${repoUrl(repo)}/commit/${repo.installed}`" :title="repo.installed" target="_blank" rel="noopener noreferrer"><code>{{ repo.installed.slice(0, 12) }}</code></a>
              <span v-else class="updates-muted">{{ $t('Unknown') }}</span>
            </div>
            <span class="updates-commit-arrow" aria-hidden="true">→</span>
            <div>
              <p class="updates-commit-label">{{ $t('Latest commit') }}</p>
              <a v-if="validCommit(latestCommit(repo))" :href="`${repoUrl(repo)}/commit/${repo.latest}`" :title="repo.latest" target="_blank" rel="noopener noreferrer"><code>{{ repo.latest.slice(0, 12) }}</code></a>
              <span v-else class="updates-muted">{{ $t('Unknown') }}</span>
            </div>
            <a v-if="changed(repo)" class="updates-compare" :href="`${repoUrl(repo)}/compare/${repo.installed}...${repo.latest}`" target="_blank" rel="noopener noreferrer">
              {{ $t('View changes') }} <span aria-hidden="true">↗</span>
            </a>
          </div>
        </article>
        <p class="updates-footnote">{{ $t('Updates install the latest commits from these branches. Existing components are backed up before installation.') }}</p>
      </section>
      <section v-else-if="info" class="updates-repository">
        <h2>{{ $t('Release details') }}</h2>
        <p v-if="info.version && info.version.version" class="updates-muted">{{ $t('Latest version') }}: {{ info.version.version }}</p>
        <div v-dompurify-html="releaseNotes" class="content mt-4" />
      </section>
    </div>
  </main>
</template>

<script>
import { marked } from 'marked'
import UpdateModal from '@/components/settings/UpdateModal.vue'

export default {
  name: 'SystemUpdates',
  data: () => ({ info: null, loading: false, error: '', timer: null, disposed: false }),
  computed: {
    source() { return this.info?.source },
    repositories() { return this.source?.repositories || [] },
    running() { return this.source?.operation === 'running' },
    canUpdate() { return Boolean(this.info?.need_update && !this.error && (!this.source || this.source.enabled)) },
    releaseNotes() { return marked.parse(this.info?.version?.change_log || '') },
    statusText() {
      if (this.running) return this.$t('System update in progress')
      if (this.error) return this.$t('Unable to check for updates')
      if (!this.info) return this.$t('Checking for updates')
      if (this.source && !this.source.enabled) return this.$t('Source updater setup required')
      if (this.info.need_update) return this.$t('Update available')
      if (this.source && (!this.repositories.length || this.repositories.some(repo => !this.validCommit(repo.installed) || !this.validCommit(repo.latest)))) return this.$t('Update status unknown')
      return this.$t('Up to date')
    },
  },
  mounted() { this.refresh() },
  beforeDestroy() { this.disposed = true; clearTimeout(this.timer) },
  methods: {
    validCommit(commit) { return /^[0-9a-f]{40}$/i.test(commit || '') },
    latestCommit(repo) { return this.error ? '' : repo.latest },
    changed(repo) { return this.validCommit(repo.installed) && this.validCommit(this.latestCommit(repo)) && repo.installed !== repo.latest },
    repoStatus(repo) {
      if (!this.validCommit(repo.installed) || !this.validCommit(this.latestCommit(repo))) return this.$t('Unknown')
      return this.$t(this.changed(repo) ? 'Update available' : 'Up to date')
    },
    repoUrl(repo) { return `https://github.com/${encodeURIComponent(this.source.owner)}/${encodeURIComponent(repo.name)}` },
    formatDate(value) { return new Date(value).toLocaleString() },
    async refresh() {
      if (this.loading || this.disposed) return
      clearTimeout(this.timer)
      this.loading = true
      try {
        const response = await this.$api.sys.getVersion()
        if (this.disposed) return
        if (response.data.success !== 200 || !response.data.data) throw new Error('Version check failed')
        this.info = response.data.data
        this.error = this.info.check_error || this.source?.check_error || ''
      } catch (error) {
        if (!this.disposed) this.error = this.$t('Unable to check for updates')
      } finally {
        this.loading = false
        if (!this.disposed) this.timer = setTimeout(this.refresh, this.running ? 30000 : 300000)
      }
    },
    openUpdate() {
      if (!this.running && (!this.canUpdate || this.loading)) return
      this.$messageBus('dashboardsetting_versionupdate', true.toString())
      this.$buefy.modal.open({
        parent: this, component: UpdateModal, hasModalCard: true, trapFocus: true,
        canCancel: ['escape'], scroll: 'keep', animation: 'zoom-in',
        props: { changeLog: this.info.version?.change_log || '', sourceRunning: this.running, sourceMode: Boolean(this.source) },
        events: { close: () => this.refresh() },
      })
    },
  },
}
</script>

<style scoped>
.system-updates { height: 100%; overflow-y: auto; background: #f5f6f7; color: #2c3e50; }
.updates-page { max-width: 1000px; margin: 0 auto; padding: 32px 32px 64px; }
.updates-back { display: inline-block; color: #53636f; margin-bottom: 36px; }
.updates-header, .updates-summary, .updates-repo-header { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
.updates-header { margin-bottom: 32px; }
.updates-eyebrow { font-size: 12px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; margin-bottom: 6px; }
h1 { font-size: 32px; font-weight: 600; letter-spacing: -.025em; margin-bottom: 8px; }
h2 { font-size: 18px; font-weight: 500; }
.updates-muted, .updates-footnote { color: #657580; }
.updates-summary { border: 1px solid #dce3e7; border-radius: 12px; padding: 24px; margin-bottom: 24px; background: #edf1f3; }
.updates-summary h2 { margin-bottom: 6px; }
.updates-checked { font-size: 12px; margin-top: 8px; }
.updates-repository { border: 1px solid #e2e7eb; border-radius: 12px; padding: 24px; margin-bottom: 16px; background: white; }
.updates-repo-header { margin-bottom: 24px; }
.updates-repo-header a { font-size: 12px; }
.updates-repository a { color: #365d77; text-decoration: underline; text-underline-offset: 3px; }
.updates-link-divider { margin: 0 8px; color: #81909b; }
.updates-badge { white-space: nowrap; border-radius: 20px; background: #eff2f4; color: #52616c; padding: 5px 12px; font-size: 12px; }
.updates-badge-changed { background: #fff0d4; color: #825716; }
.updates-commits { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) minmax(7.5rem, max-content); align-items: center; gap: 24px; }
.updates-commit-label { font-size: 12px; color: #657580; margin-bottom: 8px; }
.updates-commits code { font-size: 15px; padding: 0; background: transparent; color: inherit; }
.updates-commit-arrow { color: #81909b; }
.updates-compare { font-size: 13px; justify-self: end; }
.updates-footnote { font-size: 12px; line-height: 1.6; margin-top: 24px; }
@media (max-width: 640px) {
  .updates-page { padding: 24px 16px 40px; }
  .updates-back { margin-bottom: 24px; }
  .updates-header, .updates-summary { align-items: flex-start; flex-direction: column; }
  .updates-header { margin-bottom: 24px; }
  .updates-repository, .updates-summary { padding: 20px; }
  .updates-repo-header { flex-wrap: wrap; gap: 12px; }
  .updates-commits { grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: 12px; }
  .updates-commits code { font-size: 13px; }
  .updates-compare { grid-column: 1 / -1; justify-self: start; margin-top: 8px; }
}
</style>
