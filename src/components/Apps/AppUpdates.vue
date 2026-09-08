<template>
  <div class="app-updates" aria-live="polite">
    <div class="updates-toolbar">
      <div>
        <h3 class="title is-5 mb-2">{{ $t('Installed app updates') }}</h3>
        <p class="is-size-7">{{ $t(source === 'registry' ? 'Check installed images directly in their Docker registries.' : 'Updates come from your configured app stores.') }}</p>
        <p v-if="lastChecked" class="is-size-7 mt-1">{{ $t('Last checked') }}: {{ formatDate(lastChecked) }}</p>
      </div>
      <b-select v-model="source" :disabled="fetching || submitting" :aria-label="$t('Update source')" @input="changeSource">
        <option value="registry">{{ $t('Docker registry') }}</option>
        <option value="store">{{ $t('App Store') }}</option>
      </b-select>
      <b-button :loading="checking" :disabled="loading || unavailable || fetching || (source === 'registry' && registryUnavailable)" type="is-primary" rounded @click="refresh(true)">
        {{ $t('Check for updates') }}
      </b-button>
    </div>
    <p v-if="source === 'registry'" class="is-size-7 mb-4">
      {{ $t('Shows newer stable x.y.z tags and new builds of your configured tags. Pinned digests stay pinned. Other tag formats are checked for new builds only.') }}
      {{ $t('Registry versions are for review. To install a different tag, use app settings; App Store updates remain available in the source menu.') }}
    </p>
    <b-message v-if="unavailable" type="is-info" :closable="false">
      {{ $t('App updates require a newer CasaOS app-management service.') }}
    </b-message>
    <b-message v-else-if="source === 'registry' && registryUnavailable" type="is-info" :closable="false">
      {{ $t('Docker registry checks require a newer CasaOS app-management service. App Store checks are still available in the source menu.') }}
    </b-message>
    <b-message v-else-if="error" type="is-danger" :closable="false">
      {{ error }}
      <b-button size="is-small" class="ml-2" @click="refresh(false)">{{ $t('Retry') }}</b-button>
    </b-message>
    <p v-if="loading">{{ $t('Loading') }}…</p>
    <p v-else-if="!unavailable && !error && !apps.length" class="py-6 has-text-centered">{{ $t('No installed apps') }}</p>
    <article v-for="app in sortedApps" :key="app.id" class="update-row">
      <img v-if="app.icon" :src="app.icon" alt="" class="update-icon" @error="$event.target.style.visibility = 'hidden'">
      <div class="update-details">
        <h4 class="has-text-weight-semibold">{{ title(app) }}</h4>
        <template v-if="source === 'registry'">
          <p v-if="!app.registry_checked_at" class="is-size-7">{{ $t('Not checked yet') }}</p>
          <div v-for="image in app.registry_images || []" :key="image.service" class="registry-image is-size-7">
            <p class="has-text-weight-semibold">{{ image.service }}</p>
            <p>{{ $t('Configured image') }}: <code>{{ image.image || $t('Unknown') }}</code></p>
            <p :class="{ 'has-text-danger': image.status === 'failed', 'has-text-success': image.status === 'available' }">{{ registryLabel(image.status) }}</p>
            <p v-if="image.latest_image">{{ $t('Registry image') }}: <code>{{ image.latest_image }}</code></p>
            <p v-if="image.current_image_id" class="registry-digests">
              {{ $t('Installed image ID') }}: <code :title="image.current_image_id">{{ shortImageID(image.current_image_id) }}</code>
              <template v-if="image.latest_image_id"> → {{ $t('Registry image ID') }}: <code :title="image.latest_image_id">{{ shortImageID(image.latest_image_id) }}</code></template>
            </p>
            <p v-if="image.error" class="has-text-danger">{{ image.error }}</p>
          </div>
        </template>
        <template v-else>
        <p class="is-size-7">
          {{ $t('Installed') }}: {{ app.current_version || $t('Unknown') }}
          <span v-if="app.target_version"> · {{ $t('Store version') }}: {{ app.target_version }}</span>
        </p>
        <p class="is-size-7 mt-1" :class="{ 'has-text-danger': app.check_status === 'failed' }">{{ checkLabel(app.check_status) }}</p>
        <p v-if="app.check_error" class="is-size-7 has-text-danger">{{ app.check_error }}</p>
        </template>
        <p v-if="app.operation !== 'idle'" class="is-size-7 mt-1">{{ operationLabel(app.operation) }}</p>
        <progress v-if="busy(app)" class="progress is-small is-primary mt-2" :aria-label="operationLabel(app.operation)" />
        <p v-if="app.error" class="is-size-7 has-text-danger mt-1">{{ app.error }}</p>
        <p v-if="app.rollback_version" class="is-size-7 mt-2">
          {{ $t('Previous version') }}: {{ app.rollback_version }} · {{ formatDate(app.rollback_date) }}
        </p>
        <p v-if="app.rollback_reason" class="is-size-7 has-text-danger">{{ app.rollback_reason }}</p>
      </div>
      <div class="update-actions">
        <b-button v-if="source === 'store' && app.check_status === 'available'" type="is-primary" :disabled="busy(app)" rounded @click="confirm(app, false)">
          {{ $t('Update') }}
        </b-button>
        <b-button v-if="app.rollback_version" :disabled="busy(app) || !app.rollback_available" rounded @click="confirm(app, true)">
          {{ $t('Revert to previous version') }}
        </b-button>
      </div>
    </article>
    <b-modal :active.sync="confirmOpen" has-modal-card trap-focus :can-cancel="!submitting">
      <div class="modal-card" style="width: auto; max-width: 480px">
        <header class="modal-card-head"><h3 class="modal-card-title">{{ rollback ? $t('Revert to previous version') : $t('Update app') }}</h3></header>
        <section class="modal-card-body">
          <p class="has-text-weight-semibold mb-3">{{ selected ? title(selected) : '' }}</p>
          <p>{{ $t('The app may briefly stop. Current app data will be kept. Reverting the app version cannot undo database changes made by an update.') }}</p>
          <p v-if="rollback" class="mt-3">{{ $t('App settings will also return to their saved values.') }}</p>
          <p v-if="actionError" class="has-text-danger mt-3" role="alert">{{ actionError }}</p>
        </section>
        <footer class="modal-card-foot">
          <b-button :disabled="submitting" @click="confirmOpen = false">{{ $t('Cancel') }}</b-button>
          <b-button type="is-primary" :loading="submitting" :disabled="submitting" @click="submit">
            {{ rollback ? $t('Revert') : $t('Update') }}
          </b-button>
        </footer>
      </div>
    </b-modal>
  </div>
</template>

<script>
import updates from '@/service/updates'
import { ice_i18n } from '@/mixins/base/common-i18n'

export default {
  data: () => ({
    apps: [], source: 'registry', loading: true, checking: false, unavailable: false, registryUnavailable: false, error: '',
    confirmOpen: false, selected: null, rollback: false, submitting: false, actionError: '',
    timer: null, disposed: false, fetching: false,
  }),
  computed: {
    sortedApps() {
      const available = app => this.source === 'registry' ? (app.registry_images || []).some(image => image.status === 'available') : app.check_status === 'available'
      return [...this.apps].sort((a, b) => Number(available(b)) - Number(available(a)) || a.id.localeCompare(b.id))
    },
    lastChecked() {
      return this.apps.map(app => this.source === 'registry' ? app.registry_checked_at : app.checked_at).filter(Boolean).sort().pop()
    },
  },
  async mounted() {
    await this.refresh(false)
    if (!this.unavailable && (this.source !== 'registry' || !this.registryUnavailable) && !this.error && !this.disposed) await this.refresh(true)
  },
  beforeDestroy() {
    this.disposed = true
    clearTimeout(this.timer)
  },
  methods: {
    title: app => ice_i18n(app.title) || app.id,
    formatDate: value => value ? new Date(value).toLocaleString() : '',
    busy: app => ['busy', 'preparing', 'pulling', 'applying', 'reverting'].includes(app.operation),
    shortImageID: value => value.replace(/^sha256:/, '').slice(0, 12),
    registryLabel(status) {
      return this.$t({ available: 'Registry update available', up_to_date: 'Up to date', pinned: 'Pinned to an exact image', unsupported: 'Registry version unknown', failed: 'Check failed' }[status] || 'Not checked yet')
    },
    changeSource() { return this.refresh(true) },
    checkLabel(status) {
      return this.$t({ unchecked: 'Not checked yet', available: 'Update available', up_to_date: 'Up to date', unmanaged: 'No matching store app', failed: 'Check failed' }[status] || 'Not checked yet')
    },
    operationLabel(status) {
      return this.$t({ busy: 'Another app operation is running', preparing: 'Saving previous version', pulling: 'Downloading update', applying: 'Starting updated app', reverting: 'Restoring previous version', updated: 'Update completed', reverted: 'Previous version restored', failed: 'Operation failed', interrupted: 'Operation interrupted' }[status] || '')
    },
    message(error) {
      return error.response?.data?.message || this.$t('Could not load app updates. Please try again.')
    },
    async refresh(check) {
      if (this.fetching || this.disposed) return
      if (check && this.source === 'registry' && this.registryUnavailable) return
      clearTimeout(this.timer)
      this.fetching = true
      this.checking = check
      try {
        const response = await (check ? updates.check(this.source) : updates.list())
        if (!this.disposed) {
          this.apps = response.data.data
          this.registryUnavailable = response.data.registry_supported !== true
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
        if (!this.disposed && !this.unavailable) this.timer = setTimeout(() => this.refresh(false), this.apps.some(this.busy) ? 3000 : 15000)
      }
    },
    confirm(app, rollback) {
      this.selected = app
      this.rollback = rollback
      this.actionError = ''
      this.confirmOpen = true
    },
    async submit() {
      if (this.submitting) return
      this.submitting = true
      this.actionError = ''
      try {
        await (this.rollback ? updates.rollback(this.selected.id) : updates.update(this.selected.id))
        this.selected.operation = this.rollback ? 'reverting' : 'preparing'
        this.confirmOpen = false
        await this.refresh(false)
      } catch (error) {
        this.actionError = this.message(error)
      } finally {
        this.submitting = false
      }
    },
  },
}
</script>

<style scoped>
.updates-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 1.5rem; }
.update-row { display: flex; align-items: flex-start; gap: 1rem; padding: 1.25rem 0; border-bottom: 1px solid rgba(128,128,128,.2); }
.update-icon { width: 48px; height: 48px; border-radius: 12px; object-fit: contain; }
.update-details { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.update-actions { display: flex; flex-direction: column; gap: .5rem; align-items: flex-end; }
.registry-image { margin-top: .75rem; padding-left: .75rem; border-left: 2px solid rgba(128,128,128,.25); }
.registry-image code { color: inherit; overflow-wrap: anywhere; }
.registry-digests { margin-top: .25rem; color: #657580; }
@media (max-width: 640px) {
  .updates-toolbar { align-items: flex-start; flex-direction: column; }
  .update-row { flex-wrap: wrap; }
  .update-actions { width: 100%; align-items: stretch; }
}
</style>
