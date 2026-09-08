import { expect, it } from 'vitest'
import { systemUpdateStatus } from './system-update-status'

const sourceInfo = (overrides = {}) => ({ need_update: true, source: { enabled: true, operation: 'idle', repositories: [{ installed: 'a'.repeat(40), latest: 'b'.repeat(40) }], ...overrides } })

it('distinguishes changed commits from a release version and a running update', () => {
  expect(systemUpdateStatus(sourceInfo())).toBe('available')
  expect(systemUpdateStatus(sourceInfo({ operation: 'running' }))).toBe('running')
  expect(systemUpdateStatus(sourceInfo({ operation: 'running' }), 'offline')).toBe('running')
})
it('clears stale update indications after network and API check failures', () => {
  expect(systemUpdateStatus(sourceInfo(), 'offline')).toBe('failed')
  expect(systemUpdateStatus(sourceInfo({ check_error: 'offline' }))).toBe('failed')
  expect(systemUpdateStatus({ ...sourceInfo(), check_error: 'offline' })).toBe('failed')
})
it('never claims current or available before a complete comparison', () => {
  expect(systemUpdateStatus({}, '', false)).toBe('checking')
  expect(systemUpdateStatus(sourceInfo({ repositories: [] }))).toBe('unknown')
  expect(systemUpdateStatus(sourceInfo({ repositories: [{ latest: 'b'.repeat(40) }] }))).toBe('unknown')
  expect(systemUpdateStatus(sourceInfo({ enabled: false }))).toBe('setup')
})
it('uses full commits and preserves official version checks', () => {
  expect(systemUpdateStatus(sourceInfo({ repositories: [{ installed: 'a'.repeat(40), latest: 'A'.repeat(40) }] }))).toBe('current')
  expect(systemUpdateStatus({ need_update: true })).toBe('available')
  expect(systemUpdateStatus({ need_update: false })).toBe('current')
})
