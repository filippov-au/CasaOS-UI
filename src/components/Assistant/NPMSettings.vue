<template>
  <section class="npm-settings" aria-labelledby="npm-title">
    <div class="npm-heading"><div><h3 id="npm-title">Nginx Proxy Manager</h3><p>Give your apps a verified HTTPS address.</p></div><span class="npm-badge">{{ !opened ? 'Wildcard required' : connected ? 'Connected' : 'Not connected' }}</span></div>
    <button v-if="!opened" type="button" class="button is-small is-rounded" @click="open">Manage NPM</button>
    <template v-else>
      <p v-if="error" class="npm-error" role="alert">{{ error }}</p>
      <p v-if="notice" class="npm-notice" role="status">{{ notice }}</p>
      <form @submit.prevent="verify">
        <fieldset :disabled="busy">
          <label for="npm-instance">Installed NPM application</label>
          <select id="npm-instance" v-model="instanceKey" required @change="resetInventory"><option disabled value="">Choose an application</option><option v-for="item in instances" :key="`${item.app}/${item.service}`" :value="`${item.app}/${item.service}`">{{ item.app }} / {{ item.service }}{{ item.ready ? '' : ' (stopped)' }}</option></select>
          <p v-if="loaded && !instances.length" class="npm-note">No supported NPM Compose application was found. Install or start NPM, then refresh.</p>
          <label for="npm-username">NPM login</label><input id="npm-username" v-model="username" type="text" autocomplete="username" maxlength="320" required @input="resetInventory" />
          <label for="npm-password">NPM password</label><input id="npm-password" v-model="password" type="password" autocomplete="new-password" maxlength="4096" :placeholder="connected ? 'Leave blank to keep saved password' : 'Enter your NPM password'" @input="resetInventory" />
          <p class="npm-note">Stored privately on your CasaOS server. Your AI provider never receives these credentials.</p>
          <div class="npm-actions"><button type="submit" class="button is-small is-rounded" :disabled="!instanceKey || !username">{{ busy ? 'Checking…' : 'Check certificates' }}</button><button type="button" class="button is-small is-rounded" @click="load">Refresh applications</button></div>
          <template v-if="inventory">
            <div class="npm-domains">
              <p class="npm-note">A valid wildcard certificate is required. Only addresses covered by that wildcard can be published.</p>
              <p v-if="!inventory.suffixes.length" class="npm-error">No valid wildcard certificate found. Add or renew one in NPM, then check again.</p>
              <template v-else>
                <label for="npm-suffix">Application domain</label><select id="npm-suffix" v-model="suffix"><option disabled value="">Choose a wildcard domain</option><option v-for="domain in inventory.suffixes" :key="domain" :value="domain">*.{{ domain }}</option></select>
                <p v-if="suffix" class="npm-preview">https://<strong>app</strong>.{{ suffix }}</p>
                <ul class="npm-certificates"><li v-for="cert in eligibleCertificates" :key="cert.id">Certificate #{{ cert.id }} <span>expires {{ expiry(cert.expires_on) }}</span></li></ul>
                <label for="npm-access">Who can open published apps?</label><select id="npm-access" v-model="accessListID"><option disabled value="">Choose access</option><option :value="0">Public — use each app’s own login</option><option v-for="list in inventory.access_lists" :key="list.id" :value="list.id">{{ list.name }}</option></select>
                <button type="button" class="button is-small is-dark is-rounded npm-save" :disabled="!suffix || accessListID === ''" @click="save">Save connection</button>
              </template>
            </div>
          </template>
          <button v-if="connected" type="button" class="button is-small is-rounded npm-disconnect" @click="disconnect">Disconnect NPM</button>
        </fieldset>
      </form>
    </template>
  </section>
</template>
<script>
import api from '@/service/assistant'
export default {
  name: 'NPMSettings',
  data: () => ({ opened: false, connected: false, busy: false, loaded: false, disposed: false, instances: [], instanceKey: '', username: '', password: '', suffix: '', accessListID: '', inventory: null, error: '', notice: '' }),
  computed: { eligibleCertificates() { return (this.inventory?.certificates || []).filter(c => c.domain_names.some(d => d.toLowerCase() === `*.${this.suffix}`) && new Date(c.expires_on) > new Date()).sort((a, b) => new Date(b.expires_on) - new Date(a.expires_on) || a.id - b.id) } },
  beforeDestroy() { this.disposed = true; this.password = '' },
  methods: {
    expiry(value) { return new Date(value).toLocaleDateString() },
    resetInventory() { this.inventory = null; this.notice = '' },
    report(e) { this.error = e?.response?.data?.message || e?.message || 'Could not connect to NPM.' },
    setBusy(value) { this.busy = value; this.$emit('busy', value) },
    async open() { this.opened = true; await this.load() },
    async load() {
      this.setBusy(true); this.error = ''; this.password = ''
      try {
        const [found, saved] = await Promise.allSettled([api.npmDiscover(), api.npmSettings()])
        if (this.disposed) return
        if (found.status === 'fulfilled') { this.instances = found.value.data.data; this.loaded = true; if (!this.instanceKey && this.instances.length === 1) this.instanceKey = `${this.instances[0].app}/${this.instances[0].service}` } else this.report(found.reason)
        if (saved.status === 'fulfilled') { const inv = saved.value.data.data; this.connected = !!inv.connection; if (inv.connection) { const c = inv.connection; this.instanceKey = `${c.app}/${c.service}`; this.username = c.username; this.suffix = c.suffix; this.accessListID = c.access_list_id; this.inventory = inv; if (inv.error) this.error = inv.error } } else this.report(saved.reason)
      } finally { if (!this.disposed) this.setBusy(false) }
    },
    request() { const [app, service] = this.instanceKey.split('/'); return { app, service, username: this.username, password: this.password, suffix: this.suffix, ...(this.accessListID !== '' ? { access_list_id: Number(this.accessListID) } : {}) } },
    async verify() {
      if (this.busy) return
      this.setBusy(true); this.error = ''; this.notice = ''; this.inventory = null
      try { const { data } = await api.npmVerify(this.request()); if (this.disposed) return; this.inventory = data.data; if (!this.inventory.suffixes.includes(this.suffix)) this.suffix = this.inventory.suffixes.length === 1 ? this.inventory.suffixes[0] : '' } catch (e) { if (!this.disposed) this.report(e); this.password = '' } finally { if (!this.disposed) this.setBusy(false) }
    },
    async save() {
      if (this.busy || !this.suffix || this.accessListID === '') return
      const request = this.request(); this.password = ''; this.setBusy(true); this.error = ''; this.notice = ''
      try { await api.npmSave(request); if (!this.disposed) { this.connected = true; this.notice = 'Connected. Your assistant can publish apps under the selected wildcard domain.' } } catch (e) { if (!this.disposed) this.report(e) } finally { if (!this.disposed) this.setBusy(false) }
    },
    async disconnect() {
      if (this.busy) return
      this.password = ''; this.setBusy(true); this.error = ''
      try { await api.npmDisconnect(); if (!this.disposed) { this.connected = false; this.inventory = null; this.notice = 'NPM disconnected. Existing proxy hosts are retained.' } } catch (e) { if (!this.disposed) this.report(e) } finally { if (!this.disposed) this.setBusy(false) }
    },
  },
}
</script>
<style scoped>
.npm-settings { margin-top: 24px; padding-top: 22px; border-top: 1px solid #e5e7eb; }
.npm-heading { display: flex; justify-content: space-between; gap: 12px; align-items: start; margin-bottom: 14px; }
.npm-heading h3 { font-size: 15px; font-weight: 650; color: #17212c; }
.npm-heading p, .npm-note { color: #68717d; font-size: 12px; line-height: 1.6; }
.npm-badge { border: 1px solid #dce1e6; border-radius: 20px; padding: 3px 9px; font-size: 10px; white-space: nowrap; }
fieldset { border: 0; padding: 0; min-width: 0; }
label { display: block; font-size: 12px; font-weight: 600; margin: 14px 0 6px; }
input, select { width: 100%; height: 36px; border: 1px solid #d4dae0; border-radius: 8px; padding: 0 10px; color: #17212c; background: white; font: inherit; font-size: 13px; }
input:focus, select:focus { outline: 2px solid #91adc7; outline-offset: 2px; }
.npm-note { margin: 8px 0 12px; }
.npm-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.npm-domains { padding: 14px; margin-top: 16px; border: 1px solid #dce4df; border-radius: 10px; background: #f7faf8; }
.npm-preview { margin-top: 10px; font-size: 13px; overflow-wrap: anywhere; }
.npm-certificates { list-style: none; padding: 0; margin-top: 8px; font-size: 11px; color: #53675c; }
.npm-certificates span { margin-left: 6px; }
.npm-save, .npm-disconnect { margin-top: 14px; }
.npm-error { color: #a33737; font-size: 12px; margin-bottom: 10px; }
.npm-notice { color: #28744a; font-size: 12px; margin-bottom: 10px; }
</style>
