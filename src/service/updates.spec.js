import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import updates from './updates'
import { api, instance } from './service'

vi.mock('@/router', () => ({ default: { replace: vi.fn() } }))
vi.mock('@/store', () => ({ default: { commit: vi.fn() } }))

const originalAdapter = instance.defaults.adapter
let requests

beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null })
  requests = []
  instance.defaults.adapter = async config => {
    requests.push(config)
    return { data: {}, status: 200, statusText: 'OK', headers: {}, config }
  }
})

afterEach(() => { instance.defaults.adapter = originalAdapter; vi.unstubAllGlobals() })

it('sends the reviewed update token through the real HTTP wrapper', async () => {
  await updates.update('plex', 'reviewed-plex-plan')
  const request = requests[0]
  const url = new URL(instance.getUri(request), 'https://casaos.test')
  expect(request.method).toBe('patch')
  expect(url.pathname).toBe('/v2/app_management/compose/plex')
  expect(url.searchParams.get('update_token')).toBe('reviewed-plex-plan')
  expect(url.searchParams.has('force')).toBe(false)
})

it('preserves each app token when starting multiple updates', async () => {
  await Promise.all([updates.update('plex', 'plex-plan'), updates.update('audiobookshelf', 'books-plan')])
  expect(requests.map(request => [request.url, request.params.update_token])).toEqual([
    ['/v2/app_management/compose/plex', 'plex-plan'],
    ['/v2/app_management/compose/audiobookshelf', 'books-plan'],
  ])
})

it('keeps existing PATCH callers without request config compatible', async () => {
  await api.patch('/v2/app_management/container/demo', { name: 'demo' })
  expect(requests[0].url).toBe('/v2/app_management/container/demo')
  expect(JSON.parse(requests[0].data)).toEqual({ name: 'demo' })
  expect(requests[0].params).toBeUndefined()
})
