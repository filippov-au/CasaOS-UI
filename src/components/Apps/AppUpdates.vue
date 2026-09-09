<template>
  <section class="app-updates" :aria-label="$t('App updates')">
    <header class="updates-header">
      <div>
        <h2>{{ $t('App updates') }}</h2>
        <p>{{ $t('Keep your apps up to date.') }}</p>
      </div>
      <div class="header-actions">
        <button class="check-button" :disabled="fetching || submitting || working || unavailable || unsupported" :aria-busy="checking" @click="refresh(true)">
          <span class="refresh-icon" :class="{ spinning: checking }" aria-hidden="true">↻</span>
          {{ $t(checking ? 'Checking for updates' : 'Check for updates') }}
        </button>
        <button class="update-button update-all-button" :disabled="!availableUpdates.length || fetching || submitting || unavailable || unsupported" @click="confirmAll">
          {{ $t('Update all') }}<span v-if="availableUpdates.length"> ({{ availableUpdates.length }})</span>
        </button>
      </div>
    </header>

    <div v-if="unavailable || unsupported" class="updates-notice" role="status">
      {{ $t('App updates require a newer CasaOS app-management service.') }}
    </div>
    <div v-else-if="error" class="updates-notice notice-error" role="alert">
      <span>{{ error }}</span>
      <button class="text-button" :disabled="fetching" @click="refresh(false)">{{ $t('Retry') }}</button>
    </div>
    <p v-if="bulkResult" class="bulk-result" role="status">{{ bulkResult }}</p>

    <div class="updates-overview" aria-live="polite">
      <span v-if="loading">{{ $t('Loading') }}…</span>
      <template v-else>
        <span class="overview-count">{{ overviewText }}</span>
        <span v-if="lastChecked" class="last-checked">{{ $t('Last checked') }} {{ formatDate(lastChecked) }}</span>
      </template>
    </div>

    <div v-if="!loading && !checking && !unavailable && !unsupported && !error && !groups.length" class="updates-empty">
      <span class="empty-symbol" aria-hidden="true">↓</span>
      <h3>{{ $t(apps.length ? 'No pending updates' : 'No installed apps') }}</h3>
      <p>{{ $t(apps.length ? 'Check for updates when you want to look for newer versions.' : 'Your installed apps will appear here.') }}</p>
    </div>

    <section v-for="group in groups" :key="group.id" class="update-group" :aria-label="$t(group.title)">
      <header class="group-header">
        <h3>{{ $t(group.title) }}</h3>
        <span>{{ group.apps.length }}</span>
      </header>
      <article v-for="app in group.apps" :key="app.id" class="update-card" :data-app-id="app.id">
        <div class="app-row">
          <div class="app-icon" :class="{ 'icon-fallback': !app.icon || brokenIcons[app.id] }">
            <img v-if="app.icon && !brokenIcons[app.id]" :src="app.icon" alt="" @error="$set(brokenIcons, app.id, true)">
            <span v-else aria-hidden="true">{{ title(app).charAt(0).toUpperCase() }}</span>
          </div>
          <div class="app-summary">
            <h4>{{ title(app) }}</h4>
            <p v-if="busy(app)" class="app-version">{{ pinOnly(app) ? $t('Pinning version') : operationLabel(app.operation) }}</p>
            <p v-else-if="ready(app) && pinOnly(app)" class="app-version">{{ app.current_version }} · {{ $t('Already installed') }}</p>
            <p v-else-if="ready(app) && app.target_version && app.current_version !== app.target_version" class="app-version">
              <span>{{ app.current_version || $t('Unknown') }}</span>
              <span class="version-arrow" aria-hidden="true">→</span>
              <span class="new-version">{{ app.target_version }}</span>
            </p>
            <p v-else-if="ready(app)" class="app-version">{{ $t('New update available') }}<span v-if="app.current_version"> · {{ app.current_version }}</span></p>
            <p v-else class="app-version">{{ app.current_version || $t('Unknown') }}<span v-if="app.check_status === 'up_to_date'"> · {{ $t('Up to date') }}</span></p>
          </div>
          <div class="update-actions">
            <button v-if="ready(app) || busy(app)" class="update-button" :disabled="busy(app) || fetching || submitting || unsupported || unavailable" :aria-label="$t(pinOnly(app) ? 'Pin version' : 'Update') + ' ' + title(app)" :aria-busy="busy(app)" @click="confirm(app, false)">
              <span v-if="busy(app)" class="button-spinner" aria-hidden="true" />
              {{ $t(busy(app) ? (pinOnly(app) ? 'Pinning' : 'Updating') : (pinOnly(app) ? 'Pin version' : 'Update')) }}
            </button>
          </div>
        </div>
        <progress v-if="busy(app)" class="app-progress" :aria-label="operationLabel(app.operation)" />
        <p v-if="app.check_error" class="app-error" role="status">{{ app.check_error }}</p>
        <p v-if="app.error" class="app-error" role="status">{{ app.error }}</p>
        <p v-if="submissionErrors[app.id]" class="app-error" role="alert">{{ submissionErrors[app.id] }}</p>
        <p v-if="!busy(app) && app.check_status === 'unchecked'" class="app-note">{{ $t('Not checked yet') }}</p>
        <p v-if="!busy(app) && app.check_status === 'unmanaged'" class="app-note">{{ $t('No matching store app') }}</p>

        <details v-if="(app.registry_images || []).length || app.rollback_version" class="app-details">
          <summary>{{ $t('Details') }}</summary>
          <div class="details-content">
            <p v-if="ready(app)" class="details-note">{{ $t(pinOnly(app) ? 'The same images are already installed. Pin their numbered versions for future updates.' : 'Updates the app images. Your settings and data are kept.') }}</p>
            <div v-for="image in app.registry_images || []" :key="image.service" class="image-detail">
              <h5>{{ image.service }}</h5>
              <p><span>{{ $t('Installed') }}</span><strong>{{ imageVersion(image.current_version, image.current_image_id) }}</strong></p>
              <p v-if="image.latest_image"><span>{{ $t(sameImage(image) ? 'Version' : 'Update') }}</span><strong>{{ imageVersion(image.latest_version, image.latest_image_id) }}</strong></p>
              <p><span>{{ $t('Image') }}</span><code>{{ image.installed_image || image.image }}</code></p>
              <p v-if="image.latest_image && image.latest_image !== (image.installed_image || image.image)"><span>{{ $t(sameImage(image) ? 'Pinned image' : 'New image') }}</span><code>{{ image.latest_image }}</code></p>
              <p v-if="image.error" class="app-error">{{ image.error }}</p>
            </div>
            <div v-if="app.rollback_version" class="restore-row">
              <div><p>{{ $t('Previous version') }}: {{ app.rollback_version }}</p><small>{{ formatDate(app.rollback_date) }}</small></div>
              <button class="text-button" :disabled="busy(app) || !app.rollback_available || submitting" @click="confirm(app, true)">{{ $t('Restore') }}</button>
            </div>
            <p v-if="app.rollback_reason" class="app-error">{{ app.rollback_reason }}</p>
          </div>
        </details>
      </article>
    </section>

    <details v-if="restoreApps.length" class="restore-history">
      <summary>{{ $t('Restore previous versions') }}</summary>
      <div v-for="app in restoreApps" :key="app.id" class="restore-row">
        <div><p>{{ title(app) }} · {{ app.rollback_version }}</p><small>{{ formatDate(app.rollback_date) }}</small><p v-if="app.rollback_reason" class="app-error">{{ app.rollback_reason }}</p></div>
        <button class="text-button" :disabled="busy(app) || !app.rollback_available || submitting" @click="confirm(app, true)">{{ $t('Restore') }}</button>
      </div>
    </details>

    <b-modal :active.sync="confirmOpen" has-modal-card trap-focus :can-cancel="!submitting">
      <div class="modal-card update-confirmation">
        <header class="modal-card-head"><h3 class="modal-card-title">{{ $t(bulk ? 'Update all apps' : rollback ? 'Revert to previous version' : pinOnly(selected) ? 'Pin current version' : 'Update app') }}</h3></header>
        <section class="modal-card-body">
          <template v-if="bulk">
            <p>{{ $t('Update {count} apps to the versions below?', { count: selectedApps.length }) }}</p>
            <ul class="bulk-app-list">
              <li v-for="app in selectedApps" :key="app.id"><strong>{{ title(app) }}</strong><span>{{ app.current_version }} → {{ app.target_version }}</span></li>
            </ul>
          </template>
          <p v-else class="confirmation-app">{{ selected ? title(selected) : '' }}</p>
          <p v-if="selected && !rollback && pinOnly(selected)" class="confirmation-version">{{ selected.current_version }} · {{ $t('Already installed') }}</p>
          <p v-else-if="selected" class="confirmation-version">{{ selected.current_version }} <span aria-hidden="true">→</span> {{ rollback ? selected.rollback_version : selected.target_version }}</p>
          <p v-if="bulk">{{ $t('The apps may briefly stop. Your settings and data are kept. Failed updates remain in the list for review.') }}</p>
          <p v-else-if="!rollback && pinOnly(selected)">{{ $t('This saves a numbered image reference. The software version stays the same. The app may briefly stop; your settings and data are kept.') }}</p>
          <p v-else>{{ $t('The app may briefly stop. Current app data will be kept. Reverting the app version cannot undo database changes made by an update.') }}</p>
          <p v-if="rollback" class="mt-3">{{ $t('App settings will also return to their saved values.') }}</p>
          <p v-if="actionError" class="app-error mt-3" role="alert">{{ actionError }}</p>
        </section>
        <footer class="modal-card-foot">
          <button class="check-button" :disabled="submitting" @click="confirmOpen = false">{{ $t('Cancel') }}</button>
          <button class="update-button confirm-button" :disabled="submitting" :aria-busy="submitting" @click="submit">{{ $t(submitting ? 'Starting' : bulk ? 'Update all' : rollback ? 'Restore' : pinOnly(selected) ? 'Pin version' : 'Update') }}</button>
        </footer>
      </div>
    </b-modal>
  </section>
</template>

<script>
import updates from '@/service/updates'
import { ice_i18n } from '@/mixins/base/common-i18n'

export default {
  data: () => ({
    apps: [], loading: true, checking: false, unavailable: false, unsupported: false, error: '', brokenIcons: {},
    confirmOpen: false, selected: null, rollback: false, submitting: false, actionError: '',
    bulk: false, selectedApps: [], submissionErrors: {}, bulkResult: '',
    timer: null, disposed: false, fetching: false,
  }),
  computed: {
    working() { return this.apps.some(this.busy) },
    availableUpdates() { return this.apps.filter(app => this.ready(app) && !this.busy(app) && !this.pinOnly(app)) },
    restoreApps() { return this.apps.filter(app => app.rollback_version).sort((a, b) => this.title(a).localeCompare(this.title(b))) },
    groups() {
      const sorted = [...this.apps].sort((a, b) => this.title(a).localeCompare(this.title(b)))
      const pending = app => this.ready(app) || this.busy(app)
      const attention = app => Boolean(app.check_error || app.error || this.submissionErrors[app.id] || ['failed', 'unmanaged'].includes(app.check_status) || ['failed', 'interrupted'].includes(app.operation))
      return [
        { id: 'available', title: 'Available updates', apps: sorted.filter(app => pending(app) && !this.pinOnly(app)) },
        { id: 'pins', title: 'Version pinning', apps: sorted.filter(app => pending(app) && this.pinOnly(app)) },
        { id: 'attention', title: 'Needs attention', apps: sorted.filter(app => !pending(app) && attention(app)) },
      ].filter(group => group.apps.length)
    },
    lastChecked() { return this.apps.map(app => app.checked_at).filter(Boolean).sort().pop() },
    overviewText() {
      if (this.checking) return this.$t('Looking for updates…')
      const count = this.availableUpdates.length
      if (count === 1) return this.$t('1 update available')
      if (count) return this.$t('{count} updates available', { count })
      if (this.apps.some(this.busy)) return this.$t(this.apps.filter(this.busy).every(this.pinOnly) ? 'Pinning versions…' : 'Updating your apps…')
      if (this.apps.some(app => this.ready(app) && this.pinOnly(app))) return this.$t('Installed versions can be pinned')
      if (this.apps.length && this.apps.every(app => app.check_status === 'up_to_date')) return this.$t('All apps are up to date')
      return this.$t('Your apps')
    },
  },
  async mounted() {
    await this.refresh(false)
    if (!this.unavailable && !this.unsupported && !this.error && !this.disposed && !this.working) await this.refresh(true)
  },
  beforeDestroy() { this.disposed = true; clearTimeout(this.timer) },
  methods: {
    sameImage: image => Boolean(image.current_image_id) && image.current_image_id === image.latest_image_id,
    pinOnly: app => app?.update_kind === 'pin',
    imageVersion(version, id) {
      if (version && !['latest', 'stable', 'main', 'master', 'nightly'].includes(version)) return version
      return id ? this.$t('Build {id}', { id: id.replace(/^sha256:/, '').slice(0, 12) }) : this.$t('Unknown')
    },
    title: app => ice_i18n(app.title) || app.id,
    formatDate: value => value ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '',
    busy: app => ['busy', 'preparing', 'pulling', 'applying', 'reverting'].includes(app.operation),
    ready: app => app.check_status === 'available' && app.update_ready && Boolean(app.update_token),
    operationLabel(status) {
      return this.$t({ busy: 'Another app operation is running', preparing: 'Saving previous version', pulling: 'Downloading update', applying: 'Starting updated app', reverting: 'Restoring previous version', updated: 'Update completed', reverted: 'Previous version restored', failed: 'Operation failed', interrupted: 'Operation interrupted' }[status] || '')
    },
    message(error) { return error.response?.data?.message || this.$t('Could not load app updates. Please try again.') },
    async refresh(check) {
      if (this.fetching || this.disposed || (check && (this.unsupported || this.submitting || this.working))) return
      clearTimeout(this.timer)
      this.fetching = true
      this.checking = check
      try {
        const response = await (check ? updates.check() : updates.list())
        if (!this.disposed) {
          const apps = response.data.data
          this.apps = apps
          if (check) this.submissionErrors = {}
          else apps.forEach(app => {
            if (['updated', 'reverted'].includes(app.operation) && !this.ready(app) && !app.error) this.$delete(this.submissionErrors, app.id)
          })
          this.unsupported = response.data.combined_updates_supported !== true
          this.unavailable = false
          this.error = ''
        }
      } catch (error) {
        if (!this.disposed) {
          this.unavailable = [404, 405].includes(error.response?.status)
          this.error = this.message(error)
        }
      } finally {
        this.fetching = false
        this.loading = false
        this.checking = false
        if (!this.disposed && !this.unavailable) this.timer = setTimeout(() => this.refresh(false), this.working ? 3000 : 15000)
      }
    },
    confirm(app, rollback) {
      if (this.submitting || this.busy(app) || (!rollback && (!this.ready(app) || this.unsupported || this.fetching))) return
      this.bulk = false
      this.selected = { ...app }
      this.rollback = rollback
      this.actionError = ''
      this.confirmOpen = true
    },
    confirmAll() {
      if (!this.availableUpdates.length || this.submitting || this.fetching || this.unsupported || this.unavailable) return
      this.bulk = true
      this.rollback = false
      this.selected = null
      this.selectedApps = this.availableUpdates.map(app => ({ ...app }))
      this.actionError = ''
      this.confirmOpen = true
    },
    async submit() {
      if (this.submitting || this.disposed || !this.confirmOpen || (!this.bulk && !this.selected)) return
      this.submitting = true
      this.actionError = ''
      this.bulkResult = ''
      try {
        if (this.bulk) {
          const results = await Promise.allSettled(this.selectedApps.map(async selected => {
            await updates.update(selected.id, selected.update_token)
            if (!this.disposed) {
              this.$delete(this.submissionErrors, selected.id)
              const app = this.apps.find(app => app.id === selected.id)
              if (app) app.operation = 'preparing'
            }
          }))
          if (this.disposed) return
          let failed = 0
          results.forEach((result, index) => {
            if (result.status === 'rejected') {
              failed++
              this.$set(this.submissionErrors, this.selectedApps[index].id, this.message(result.reason))
            }
          })
          this.bulkResult = failed
            ? this.$t('Started {started} of {total} updates. Apps that could not start remain in the list.', { started: results.length - failed, total: results.length })
            : this.$t('Started {count} app updates.', { count: results.length })
          this.confirmOpen = false
          await this.refresh(false)
          return
        }
        await (this.rollback ? updates.rollback(this.selected.id) : updates.update(this.selected.id, this.selected.update_token))
        if (this.disposed) return
        this.$delete(this.submissionErrors, this.selected.id)
        const app = this.apps.find(app => app.id === this.selected.id)
        if (app) app.operation = this.rollback ? 'reverting' : 'preparing'
        this.confirmOpen = false
        await this.refresh(false)
      } catch (error) { this.actionError = this.message(error) }
      finally { this.submitting = false }
    },
  },
}
</script>

<style scoped>
.app-updates { --update-blue: #0866ce; --update-ink: #202c3b; --update-muted: #687587; color: var(--update-ink); padding: 8px 0 24px; }
.updates-header { display: flex; justify-content: space-between; align-items: center; gap: 24px; margin-bottom: 28px; }
.updates-header h2 { font-size: 28px; font-weight: 700; letter-spacing: -.7px; line-height: 1.2; margin: 0 0 8px; }
.updates-header p, .last-checked { color: var(--update-muted); font-size: 13px; }
.header-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
.update-all-button { white-space: nowrap; }
.bulk-result { margin-bottom: 16px; font-size: 13px; color: var(--update-muted); }
.bulk-app-list { margin: 16px 0; padding: 0; list-style: none; }
.bulk-app-list li { display: flex; flex-direction: column; padding: 10px 0; border-bottom: 1px solid #e7ebf0; overflow-wrap: anywhere; }
.bulk-app-list span { color: var(--update-muted); font-size: 13px; }
.restore-history { margin-top: 28px; font-size: 13px; }
.restore-history > summary { width: fit-content; color: var(--update-muted); cursor: pointer; }
.restore-history .app-error { margin-left: 0; }
.check-button, .update-button, .text-button { font: inherit; border: 0; cursor: pointer; transition: background .15s ease, color .15s ease; }
.check-button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 38px; background: #f1f4f8; border-radius: 10px; color: #3e4d61; font-size: 13px; font-weight: 600; padding: 9px 14px; }
.check-button:hover { background: #e6ecf3; }
.refresh-icon { font-size: 22px; line-height: 16px; display: inline-block; }
.updates-overview { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 8px; padding-bottom: 16px; border-bottom: 1px solid #e7ebf0; }
.overview-count { font-size: 14px; font-weight: 600; }
.last-checked { font-size: 12px; }
.update-group { margin-top: 28px; }
.group-header { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
.group-header h3 { font-size: 17px; font-weight: 650; }
.group-header > span { border-radius: 20px; padding: 2px 8px; background: #edf2f8; color: #607087; font-size: 11px; font-weight: 600; }
.update-card { padding: 22px 0; border-bottom: 1px solid #e7ebf0; }
.app-row { display: flex; align-items: center; gap: 16px; }
.app-icon { width: 60px; height: 60px; flex: 0 0 60px; border-radius: 14px; overflow: hidden; }
.app-icon img { width: 100%; height: 100%; object-fit: contain; }
.icon-fallback { display: grid; place-items: center; background: #eaf1fb; color: #38649f; font-size: 25px; font-weight: 650; }
.app-summary { flex: 1; min-width: 0; }
.app-summary h4 { font-size: 17px; font-weight: 650; line-height: 1.35; margin: 0 0 6px; overflow-wrap: anywhere; }
.app-version { color: var(--update-muted); font-size: 13px; line-height: 1.5; overflow-wrap: anywhere; }
.version-arrow { margin: 0 8px; color: #929dae; }
.new-version { color: #354963; font-weight: 600; }
.update-button { display: inline-flex; align-items: center; justify-content: center; gap: 7px; border-radius: 24px; min-width: 94px; min-height: 36px; padding: 8px 18px; background: #eaf3ff; color: var(--update-blue); font-size: 14px; font-weight: 700; }
.update-button:hover { background: #d7e9ff; }
button:disabled { cursor: default; opacity: .55; }
button:focus-visible, summary:focus-visible { outline: 2px solid var(--update-blue); outline-offset: 4px; }
.app-details { margin: 10px 0 0 76px; font-size: 12px; }
.app-details summary { display: list-item; width: fit-content; color: var(--update-blue); cursor: pointer; padding: 3px 0; }
.details-content { padding: 14px 16px; background: #f6f8fb; border-radius: 10px; margin-top: 10px; }
.details-note { margin-bottom: 14px; color: #5d6d81; }
.image-detail + .image-detail { margin-top: 16px; }
.image-detail h5 { font-size: 12px; font-weight: 650; margin-bottom: 6px; }
.image-detail p { display: flex; gap: 10px; margin-top: 4px; }
.image-detail p > span { flex: 0 0 76px; color: var(--update-muted); }
.image-detail strong { min-width: 0; overflow-wrap: anywhere; font-weight: 600; }
.image-detail code { padding: 0; background: transparent; color: #455970; overflow-wrap: anywhere; min-width: 0; font-size: 11px; }
.app-error { color: #aa3b3b; font-size: 13px; line-height: 1.5; margin: 10px 0 0 76px; overflow-wrap: anywhere; }
.details-content .app-error, .update-confirmation .app-error { margin-left: 0; }
.app-note { margin: 8px 0 0 76px; color: var(--update-muted); font-size: 12px; }
.restore-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; border-top: 1px solid #dfe6ef; padding-top: 14px; margin-top: 16px; }
.restore-row small { color: var(--update-muted); }
.text-button { background: transparent; color: var(--update-blue); font-size: 12px; font-weight: 600; padding: 6px 0; }
.updates-notice { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 16px; margin-bottom: 20px; background: #f1f5fa; border-radius: 10px; font-size: 13px; }
.notice-error { background: #fff2ef; color: #a44438; }
.updates-empty { padding: 52px 20px; text-align: center; }
.empty-symbol { display: block; font-size: 32px; color: #8c9bb0; margin-bottom: 12px; }
.updates-empty h3 { font-size: 18px; font-weight: 600; margin-bottom: 6px; }
.updates-empty p { font-size: 13px; color: var(--update-muted); }
.app-progress { display: block; width: calc(100% - 76px); height: 3px; margin: 12px 0 0 76px; border: 0; accent-color: var(--update-blue); }
.update-confirmation { width: 460px; max-width: calc(100vw - 32px); }
.confirmation-app { font-size: 20px; font-weight: 650; margin-bottom: 6px; }
.confirmation-version { color: var(--update-muted); margin-bottom: 18px; }
.confirmation-version span { padding: 0 8px; }
.update-confirmation .modal-card-body { font-size: 14px; line-height: 1.6; }
.update-confirmation .modal-card-foot { justify-content: flex-end; }
.confirm-button { background: var(--update-blue); color: white; }
.confirm-button:hover { background: #0054af; }
.button-spinner { border: 2px solid currentColor; border-top-color: transparent; border-radius: 50%; width: 12px; height: 12px; animation: update-spin 1s linear infinite; }
.spinning { animation: update-spin 1s linear infinite; }
@keyframes update-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spinning, .button-spinner { animation: none; } }
@media (max-width: 640px) {
  .updates-header { align-items: flex-start; flex-direction: column; gap: 16px; margin-bottom: 24px; }
  .updates-header h2 { font-size: 25px; }
  .app-row { gap: 12px; }
  .app-icon { width: 48px; height: 48px; flex-basis: 48px; border-radius: 12px; }
  .app-summary h4 { font-size: 15px; }
  .app-version { font-size: 12px; }
  .update-button { min-width: 76px; min-height: 36px; padding: 8px 12px; font-size: 13px; }
  .app-details, .app-note, .app-error { margin-left: 60px; }
  .app-progress { width: calc(100% - 60px); margin-left: 60px; }
  .details-content { margin-left: -60px; }
}
</style>
