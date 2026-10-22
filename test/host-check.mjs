/**
 * Exercises the Host half over real HTTP with a fake webServer service: the
 * `/folder` route creates the drop-in folder, the library lists it and `/media`
 * serves a file from it while still refusing paths outside the fenced roots.
 * Run: node test/host-check.mjs
 *
 * Uses a throw-away folder next to this script (DSH_WALLPAPER_FOLDER), never the
 * user's real Pictures\ds-wallpapers.
 */
import http from 'node:http'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const temp = path.join(here, '.tmp-folder')
process.env.DSH_WALLPAPER_FOLDER = temp
await fsp.rm(temp, { recursive: true, force: true })

const plugin = (await import('../index.js')).default
const { ensureLocalFolder } = await import('../discovery.js')
const { writeProbeImage } = await import('./probe-image.mjs')

const info = await ensureLocalFolder()
const probe = path.join(info.dir, '__probe_http__.png')
await writeProbeImage(probe)

let handler = null
const server = http.createServer((req, res) => handler(req, res))
const ctx = {
  get: (name) =>
    name === 'webServer'
      ? {
          register: ({ handler: mounted }) => {
            handler = mounted
            return () => {}
          },
        }
      : undefined,
  effect: (fn) => fn(),
  logger: { warn() {}, info() {}, error() {} },
}
plugin.apply(ctx)
await new Promise((resolve) => server.listen(0, resolve))
const base = `http://127.0.0.1:${server.address().port}/wallpaper-engine/api`
const post = async (method, body = {}) => {
  const response = await fetch(`${base}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return response.json()
}

const state = await post('state')
console.log('state.ok      :', state.ok, '| installed:', state.value.installed, '| mount:', state.value.mount.mode)
console.log('state.folder  :', state.value.folder)

const lib = await post('library')
console.log('library items :', lib.value.items.length, '| folder count:', lib.value.folder.count, '| image:', lib.value.counts.image)
console.log('folder item   :', lib.value.items.find((one) => one.source === 'folder'))

const folder = await post('folder')
console.log('folder api    :', folder.value.path, '| count:', folder.value.count, '| writable:', folder.value.writable)

const media = await fetch(`${base}/media?p=${encodeURIComponent(probe)}`)
const bytes = await media.arrayBuffer()
console.log('media         :', media.status, media.headers.get('content-type'), bytes.byteLength, 'bytes')

const fenced = await fetch(`${base}/media?p=${encodeURIComponent('C:\\Windows\\win.ini')}`)
console.log('fenced path   :', fenced.status, (await fenced.json()).error.code)

await new Promise((resolve) => server.close(resolve))
// Windows keeps the file locked until the response stream is released.
for (let attempt = 0; attempt < 5; attempt += 1) {
  try {
    await fsp.rm(probe, { force: true })
    break
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
}
console.log('cleaned       :', !(await fsp.access(probe).then(() => true, () => false)))
await fsp.rm(temp, { recursive: true, force: true })
