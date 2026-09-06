import { api } from './service'

const prefix = '/v2/app_management'
export default {
  list: () => api.get(`${prefix}/updates`),
  check: () => api.post(`${prefix}/updates/check`, {}, { timeout: 600000 }),
  update: id => api.patch(`${prefix}/compose/${encodeURIComponent(id)}`),
  rollback: id => api.post(`${prefix}/compose/${encodeURIComponent(id)}/rollback`),
}
