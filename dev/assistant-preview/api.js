const root = '/v2/app_management/assistant'
async function call(method, path, body) {
  const response = await fetch(root + path, { method, headers: { 'Content-Type': 'application/json', 'X-Casa-Preview': '1' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const data = await response.json()
  if (!response.ok) { const error = new Error(data.message || 'Assistant request failed'); error.response = { status: response.status, data }; throw error }
  return { data }
}
const session = id => '/sessions/' + encodeURIComponent(id)
export default {
  npmDiscover: () => call('GET', '/npm/discovery'),
  npmSettings: () => call('GET', '/npm'),
  npmVerify: body => call('POST', '/npm/verify', body),
  npmSave: body => call('PUT', '/npm', body),
  npmDisconnect: () => call('DELETE', '/npm'),
  settings: () => call('GET', '/settings'),
  saveSettings: body => call('PUT', '/settings', body),
  disconnect: provider => call('DELETE', '/connections/' + encodeURIComponent(provider)),
  deleteSettings: () => call('DELETE', '/settings'),
  list: () => call('GET', '/sessions'),
  start: (message) => call('POST', '/sessions', { message, mode: 'read' }),
  get: id => call('GET', session(id)),
  reply: (id, message) => call('POST', session(id) + '/messages', { message }),
  cancel: id => call('POST', session(id) + '/cancel'),
  remove: id => call('DELETE', session(id)),
  addCredential: (id, name, value) => call('POST', session(id) + '/credentials', { name, value }),
  decide: (id, approval_id, allow) => call('POST', session(id) + '/decision', { approval_id, allow }),
}
