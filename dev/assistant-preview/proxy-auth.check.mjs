import { test } from 'node:test'
import assert from 'node:assert/strict'
import { allowedPreviewRequest } from './proxy-auth.mjs'
const headers = { host: '127.0.0.1:5189', 'x-casa-preview': '1', origin: 'http://127.0.0.1:5189', 'sec-fetch-site': 'same-origin' }
test('allows same-origin preview and rejects cross-site/preflight/rebinding requests', () => {
  assert.equal(allowedPreviewRequest({ headers }), true)
  for (const override of [ { origin: 'https://evil.example' }, { host: 'evil.example:5189' }, { 'sec-fetch-site': 'cross-site' }, { 'x-casa-preview': undefined } ]) {
    assert.equal(allowedPreviewRequest({ headers: { ...headers, ...override } }), false)
  }
})
