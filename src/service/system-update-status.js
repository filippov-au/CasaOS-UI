export const validCommit = commit => /^[0-9a-f]{40}$/i.test(commit || '')

// need_update also means "an update is running" on older source backends.
export function systemUpdateStatus(info, error = '', checked = true) {
  const source = info?.source
  if (source?.operation === 'running') return 'running'
  if (error || info?.check_error || source?.check_error) return 'failed'
  if (!checked || !info) return 'checking'
  if (source) {
    if (!source.enabled) return 'setup'
    const repos = source.repositories || []
    if (repos.some(repo => validCommit(repo.installed) && validCommit(repo.latest) && repo.installed.toLowerCase() !== repo.latest.toLowerCase())) return 'available'
    if (!repos.length || repos.some(repo => !validCommit(repo.installed) || !validCommit(repo.latest))) return 'unknown'
    return 'current'
  }
  return info.need_update ? 'available' : 'current'
}

export const systemUpdateLabels = {
  running: 'System update in progress', failed: 'Unable to check for updates',
  checking: 'Checking for updates', setup: 'Source updater setup required',
  available: 'Update available', unknown: 'Update status unknown', current: 'Up to date',
}
