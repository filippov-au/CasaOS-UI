import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
const origin = 'http://127.0.0.1:5189'
const defaultCache = process.platform === 'darwin' ? join(homedir(), 'Library/Caches') : process.env.XDG_CACHE_HOME || join(homedir(), '.cache')
const startupPath = process.env.CASA_PREVIEW_STARTUP || join(defaultCache, 'CasaOS/assistant-preview/startup.json')

// Dev-only proxy: the private JWT stays in Node, never in a URL or browser storage.
// The non-simple header plus exact Origin/Host checks blocks cross-site requests,
// including preflights, forms, images and DNS rebinding to the preview listener.
export function allowedPreviewRequest(req) {
  return req.headers.host === '127.0.0.1:5189' &&
    req.headers['x-casa-preview'] === '1' &&
    (!req.headers.origin || req.headers.origin === origin) &&
    (!req.headers['sec-fetch-site'] || req.headers['sec-fetch-site'] === 'same-origin')
}
export function previewAuth() {
  return {
    name: 'casa-preview-auth',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url.startsWith('/v2/app_management/assistant/')) return next()
        res.setHeader('Cache-Control', 'no-store')
        if (!allowedPreviewRequest(req)) {
          res.statusCode = 403; res.end(JSON.stringify({ message: 'Open the local preview directly to connect.' })); return
        }
        try {
          const startup = JSON.parse(readFileSync(startupPath, 'utf8'))
          if (startup.api !== 'http://127.0.0.1:5190' || !startup.access_token) throw new Error('Invalid preview startup')
          req.headers.authorization = startup.access_token
          next()
        } catch {
          res.statusCode = 503; res.end(JSON.stringify({ message: 'The local assistant server is unavailable. Start assistant-preview and retry.' }))
        }
      })
    },
  }
}
