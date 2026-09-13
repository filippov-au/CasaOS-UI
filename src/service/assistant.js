import { api } from './service'

const root = '/v2/app_management/assistant'
const session = id => `${root}/sessions/${encodeURIComponent(id)}`
export default {
  npmDiscover: () => api.get(`${root}/npm/discovery`),
  npmSettings: () => api.get(`${root}/npm`),
  npmVerify: connection => api.post(`${root}/npm/verify`, connection),
  npmSave: connection => api.put(`${root}/npm`, connection),
  npmDisconnect: () => api.delete(`${root}/npm`),
  list: () => api.get(`${root}/sessions`),
  settings: () => api.get(`${root}/settings`),
  saveSettings: settings => api.put(`${root}/settings`, settings),
  disconnect: provider => api.delete(`${root}/connections/${encodeURIComponent(provider)}`),
  deleteSettings: () => api.delete(`${root}/settings`),
  start: (message, mode) => api.post(`${root}/sessions`, { message, mode }),
  get: id => api.get(session(id)),
  reply: (id, message) => api.post(`${session(id)}/messages`, { message }),
  decide: (id, approval_id, allow) => api.post(`${session(id)}/decision`, { approval_id, allow }),
  addCredential: (id, name, value) => api.post(`${session(id)}/credentials`, { name, value }),
  cancel: id => api.post(`${session(id)}/cancel`),
  remove: id => api.delete(session(id)),
}
