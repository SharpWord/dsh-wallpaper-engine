/**
 * dsh-wallpaper-engine — Host half.
 *
 * Registers `/wallpaper-engine/api` on the DSH web server:
 *   POST /wallpaper-engine/api/state    → install + active wallpaper per monitor
 *   POST /wallpaper-engine/api/library  → the wallpaper library
 *   POST /wallpaper-engine/api/refresh  → rescan, then the library
 *   GET  /wallpaper-engine/api/media    → one fenced media file, with Range support
 *
 * The Client half renders the chosen wallpaper behind the app surface; nothing
 * here writes to the Wallpaper Engine installation.
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { snapshot, invalidate, resolveMedia, samePath, ensureLocalFolder } from './discovery.js'

const ROUTE_PREFIX = '/wallpaper-engine/api'
const MAX_BODY_BYTES = 64 * 1024
const STREAM_CHUNK = 64 * 1024

/** Content types for the files the library can point at. */
const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
}

/** A typed failure that maps onto the API error envelope. */
function failure(code, message, status = 200) {
  const error = new Error(message)
  error.code = code
  error.status = status
  return error
}

/**
 * How this Host half reached `webServer`: `direct` when the service was already
 * up at mount, `deferred` when the plugin waited for it through `ctx.inject`.
 * Surfaced in `/state` so a cold-boot ordering bug is visible from the outside.
 */
const mountInfo = { mode: 'none', at: null }

/** Mark the mount outcome once the routes are actually registered. */
function markMounted(mode) {
  mountInfo.mode = mode
  mountInfo.at = new Date().toISOString()
}

/** Read one bounded JSON request body. */
async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw failure('too-large', 'request body is too large')
    chunks.push(chunk)
  }
  if (size === 0) return {}
  let parsed
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw failure('bad-request', 'request body is not valid JSON')
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw failure('bad-request', 'request body must be a JSON object')
  }
  return parsed
}

/** Write one JSON response. */
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(body)
}

/** The same file on disk, ignoring case and separator style. */
function fileKey(target) {
  return String(target || '').replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
}

/** Client-facing shape of one library item (no host-only folders). */
function slim(item) {
  return {
    id: item.id,
    source: item.source,
    workshopId: item.workshopId,
    title: item.title,
    kind: item.kind,
    tags: item.tags,
    schemecolor: item.schemecolor,
    file: item.file,
    preview: item.preview,
    previewKind: item.previewKind,
    playFile: item.playFile,
    playKind: item.playKind,
    workshopUrl: item.workshopUrl,
  }
}

/** The small view the Client polls. */
function stateView(value) {
  const byFile = new Map()
  const byDir = new Map()
  const byWorkshop = new Map()
  for (const item of value.items) {
    if (item.file !== '') byFile.set(fileKey(item.file), item)
    if (item.dir !== '') byDir.set(fileKey(item.dir), item)
    if (item.workshopId) byWorkshop.set(String(item.workshopId), item)
  }
  /** A wallpaper config may name scene.json while the item's main file is scene.pkg. */
  const lookup = (file) => {
    if (file === '') return null
    const direct = byFile.get(fileKey(file))
    if (direct) return direct
    const byParent = byDir.get(fileKey(path.dirname(file)))
    if (byParent) return byParent
    const match = /[\\/]431960[\\/](\d+)(?:[\\/]|$)/.exec(file)
    return (match && byWorkshop.get(match[1])) || null
  }
  const monitors = value.monitors.map((row) => {
    const item = lookup(row.file)
    return { monitor: row.monitor, file: row.file, item: item ? slim(item) : null }
  })
  return {
    installed: value.weDir !== '',
    weDir: value.weDir,
    steamRoot: value.steamRoot,
    libraries: value.libraries,
    configPath: value.configPath,
    workshopRoot: value.workshopRoot,
    folder: value.folder,
    user: value.user,
    monitors,
    counts: value.counts,
    warnings: value.warnings,
    scannedAt: value.scannedAt,
    recent: recent.slice(-6).reverse(),
    renderer,
    mount: { ...mountInfo },
  }
}

/** The library view. */
function libraryView(value) {
  return {
    items: value.items.map(slim),
    counts: value.counts,
    workshopRoot: value.workshopRoot,
    weDir: value.weDir,
    folder: value.folder,
    scannedAt: value.scannedAt,
    warnings: value.warnings,
  }
}

/** POST methods exposed to the Client half. */
function createApi() {
  return {
    async state() {
      const value = await snapshot()
      return stateView(value)
    },
    async library(payload) {
      const value = await snapshot({ force: payload && payload.refresh === true })
      return libraryView(value)
    },
    async refresh() {
      invalidate()
      const value = await snapshot({ force: true })
      return libraryView(value)
    },
    /**
     * Create the drop-in folder and report where it is. This is the path that
     * makes the plugin work with no Wallpaper Engine at all, so the page shows
     * it verbatim instead of asking the user to hunt for it.
     */
    async folder() {
      const info = await ensureLocalFolder()
      invalidate()
      const value = await snapshot({ force: true })
      return {
        path: info.dir,
        created: info.created,
        writable: info.writable,
        count: value.folder ? value.folder.count : 0,
        installed: value.weDir !== '',
        items: value.items.filter((item) => item.source === 'folder').map(slim),
      }
    },
    /** Reveal the drop-in folder in Explorer (best effort; Windows only). */
    async openFolder() {
      const info = await ensureLocalFolder()
      let opened = false
      if (process.platform === 'win32') {
        try {
          // The callback swallows an async spawn failure instead of crashing the Host.
          execFile('explorer.exe', [info.dir], () => {})
          opened = true
        } catch {
          /* the path still goes back to the page, which shows it as text */
        }
      }
      return { path: info.dir, opened }
    },
    async report(payload) {
      renderer = { at: new Date().toISOString(), ...cleanReport(payload) }
      return { received: true }
    },
    // The page polls this every few seconds; a new token tells it to run its
    // own UI self test (the Host cannot click inside the desktop window).
    async ping() {
      return { verify: verifyToken, at: verifyAt }
    },
    async verify() {
      verifySeq += 1
      verifyToken = `${Date.now()}-${verifySeq}`
      verifyAt = new Date().toISOString()
      return { verify: verifyToken, at: verifyAt }
    },
  }
}

/** Parse one `Range: bytes=…` header. */
function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header || '').trim())
  if (!match) return null
  const startText = match[1]
  const endText = match[2]
  if (startText === '' && endText === '') return null
  let start
  let end
  if (startText === '') {
    const suffix = Number(endText)
    if (!Number.isFinite(suffix) || suffix <= 0) return null
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(startText)
    end = endText === '' ? size - 1 : Number(endText)
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null
    if (end >= size) end = size - 1
  }
  if (start < 0 || start > end || start >= size) return null
  return { start, end }
}

/** Stream one media file, honoring `Range`. */
async function serveMedia(req, res, url) {
  const value = await snapshot()
  const raw = url.searchParams.get('p')
  const target = await resolveMedia(value, raw)
  if (!target) {
    sendJson(res, 404, { ok: false, error: { code: 'not-found', message: 'media file is not available' } })
    return
  }
  let info
  try {
    info = await fsp.stat(target)
  } catch {
    sendJson(res, 404, { ok: false, error: { code: 'not-found', message: 'media file is not readable' } })
    return
  }
  const size = info.size
  const type = MIME[path.extname(target).toLowerCase()] || 'application/octet-stream'
  const range = parseRange(req.headers.range, size)
  const headers = {
    'content-type': type,
    'accept-ranges': 'bytes',
    'cache-control': 'private, max-age=120',
    'access-control-allow-origin': '*',
    'x-content-type-options': 'nosniff',
  }
  if (range) {
    headers['content-range'] = `bytes ${range.start}-${range.end}/${size}`
    headers['content-length'] = range.end - range.start + 1
    res.writeHead(206, headers)
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    const stream = fs.createReadStream(target, { start: range.start, end: range.end, highWaterMark: STREAM_CHUNK })
    stream.on('error', () => res.destroy())
    stream.pipe(res)
    return
  }
  headers['content-length'] = size
  res.writeHead(200, headers)
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  const stream = fs.createReadStream(target, { highWaterMark: STREAM_CHUNK })
  stream.on('error', () => res.destroy())
  stream.pipe(res)
}

/**
 * Recent API hits, newest last. Bounded and local-only: it powers the
 * "the host is talking to the page" line in the settings section.
 */
const recent = []
function record(req, pathname) {
  recent.push({
    at: new Date().toISOString(),
    method: req.method ?? '',
    path: pathname,
    range: String(req.headers.range ?? ''),
    from: String(req.headers.referer || req.headers.origin || ''),
    agent: String(req.headers['user-agent'] || '').slice(0, 96),
  })
  if (recent.length > 24) recent.shift()
}

/**
 * Last self-report posted by the Client half (renderer diagnostics). The page
 * cannot be inspected from outside, so the page instead describes what it sees:
 * resolved wallpaper, injected style sizes, computed surfaces, media state.
 */
let renderer = null
// Verify handshake: the Host bumps `verifyToken`, the page polls `/ping` and
// runs its own UI self test when the token is new.
let verifyToken = ''
let verifyAt = null
let verifySeq = 0
const REPORT_STRING_MAX = 300
const REPORT_STRING_LONG = 6000
const REPORT_KEYS_MAX = 96
function cleanReport(payload) {
  const out = {}
  if (!payload || typeof payload !== 'object') return out
  // The self test verdict is the reason a report exists at all, so it is
  // copied before the key cap can drop it (it sits late in the payload).
  if (typeof payload.selfTest === 'string' && payload.selfTest !== '') {
    out.selfTest = payload.selfTest.slice(0, REPORT_STRING_LONG)
  }
  let keys = 0
  for (const [key, raw] of Object.entries(payload)) {
    if (key === 'selfTest') continue
    if (keys >= REPORT_KEYS_MAX) break
    if (typeof key !== 'string' || key.length > 40) continue
    keys += 1
    const limit = key === 'selfTest' ? REPORT_STRING_LONG : REPORT_STRING_MAX
    if (typeof raw === 'string') out[key] = raw.slice(0, limit)
    else if (typeof raw === 'number' || typeof raw === 'boolean') out[key] = raw
    else if (raw === null) out[key] = null
    else if (Array.isArray(raw)) out[key] = raw.slice(0, 8).map((one) => String(one).slice(0, 120))
    else if (typeof raw === 'object') {
      const flat = {}
      for (const [inner, value] of Object.entries(raw).slice(0, 12)) {
        if (typeof value === 'string') flat[inner] = value.slice(0, REPORT_STRING_MAX)
        else if (typeof value === 'number' || typeof value === 'boolean') flat[inner] = value
      }
      out[key] = flat
    }
  }
  return out
}

/**
 * Register the Wallpaper Engine API against a ready `webServer`, mounted with
 * `ctx.effect` so a plugin reload removes the route with the rest of the Host
 * half.
 */
function mount(ctx, mode = 'direct') {
  const webServer = ctx.get?.('webServer') ?? ctx.webServer
  if (!webServer || typeof webServer.register !== 'function') {
    ctx.logger?.warn?.('dsh-wallpaper-engine: no webServer in this composition; the wallpaper API is unavailable')
    return undefined
  }
  const api = createApi()
  const handler = async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://dsh.internal')
      const pathname = url.pathname
      record(req, pathname)
      if (!pathname.startsWith(`${ROUTE_PREFIX}/`)) {
        sendJson(res, 404, { ok: false, error: { code: 'not-found', message: 'unknown route' } })
        return
      }
      const tail = pathname.slice(ROUTE_PREFIX.length + 1)
      if (tail === 'media') {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          sendJson(res, 405, { ok: false, error: { code: 'method-error', message: 'GET only' } })
          return
        }
        await serveMedia(req, res, url)
        return
      }
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: { code: 'method-error', message: 'POST only' } })
        return
      }
      if (tail === '' || tail.includes('/') || !Object.hasOwn(api, tail)) {
        sendJson(res, 404, { ok: false, error: { code: 'not-found', message: `unknown method: ${tail}` } })
        return
      }
      const payload = await readJsonBody(req)
      const value = await api[tail](payload)
      sendJson(res, 200, { ok: true, value })
    } catch (error) {
      const code = error && typeof error.code === 'string' ? error.code : 'internal'
      const status = error && Number.isInteger(error.status) ? error.status : 500
      const message = error && typeof error.message === 'string' ? error.message : String(error)
      sendJson(res, status, { ok: false, error: { code, message } })
    }
  }
  ctx.effect(
    () => webServer.register({ kind: 'prefix', path: ROUTE_PREFIX, handler }),
    'dsh-wallpaper-engine: /wallpaper-engine/api routes',
  )
  markMounted(mode)
}

/**
 * The loader may mount this plugin before the `webServer` service exists (a
 * cold boot reorders entries, an install into a running process does not), so
 * wait for the service instead of bailing once: `ctx.inject` runs the body as a
 * dependent sub-plugin and mounts the routes as soon as `webServer` appears.
 */
export function apply(ctx) {
  // One path for both boot orders: `ctx.inject` mounts immediately when the
  // service is already up and otherwise mounts the routes the moment it appears.
  if (typeof ctx.inject === 'function') {
    try {
      ctx.inject(['webServer'], (scoped) => mount(scoped, 'injected'))
      return
    } catch (error) {
      ctx.logger?.warn?.(`dsh-wallpaper-engine: could not wait for webServer (${error?.message ?? error})`)
    }
  }
  const webServer = ctx.get?.('webServer') ?? ctx.webServer
  if (webServer && typeof webServer.register === 'function') {
    mount(ctx, 'direct')
    return
  }
  ctx.logger?.warn?.('dsh-wallpaper-engine: webServer is unavailable and ctx.inject is missing; the wallpaper API is off')
}

export default { apply }
