import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue2'
import { previewAuth } from './proxy-auth.mjs'
const here = path => fileURLToPath(new URL(path, import.meta.url))
export default {
  root: here('./'),
  plugins: [previewAuth(), vue()],
  resolve: { alias: [
    { find: '@/service/assistant', replacement: here('./api.js') },
    { find: '@', replacement: here('../../src') },
  ] },
  server: {
    host: '127.0.0.1', port: 5189, strictPort: true,
    cors: { origin: 'http://127.0.0.1:5189' },
    fs: { allow: [here('../../')] },
    proxy: { '/v2/app_management/assistant': 'http://127.0.0.1:5190' },
  },
}
