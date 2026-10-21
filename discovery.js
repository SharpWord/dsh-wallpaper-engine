/**
 * dsh-wallpaper-engine — Host discovery.
 *
 * Reads the local Steam + Wallpaper Engine installation, the per-user
 * `config.json` (which wallpaper is active on each monitor) and the Workshop
 * content directory (app 431960), and turns them into one flat item list the
 * Client half can render. Pure Node: no Cordis, no HTTP, so it can be probed
 * from a terminal (`node test/probe.mjs`).
 */
import fsp from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/** Steam application id of Wallpaper Engine. */
export const WE_APP_ID = '431960'

/** How long one discovery result stays warm. */
const CACHE_TTL_MS = 15_000

/** Wallpaper kinds we understand. */
const KINDS = new Set(['scene', 'video', 'web', 'app'])

/** Image extensions a project preview may use. */
const PREVIEW_NAMES = ['preview.gif', 'preview.jpg', 'preview.jpeg', 'preview.png', 'preview.webp', 'preview.bmp']

let cache = null

/** Drop the memoized discovery result. */
export function invalidate() {
  cache = null
}

/** Whether a path exists (any type). */
async function exists(target) {
  try {
    await fsp.stat(target)
    return true
  } catch {
    return false
  }
}

/** Whether a path is a file. */
async function isFile(target) {
  try {
    const info = await fsp.stat(target)
    return info.isFile()
  } catch {
    return false
  }
}

/** Whether a path is a directory. */
async function isDirectory(target) {
  try {
    const info = await fsp.stat(target)
    return info.isDirectory()
  } catch {
    return false
  }
}

/** Read one registry string value; '' when unavailable. */
async function registryValue(key, name) {
  if (process.platform !== 'win32') return ''
  try {
    const { stdout } = await execFileAsync('reg.exe', ['query', key, '/v', name], {
      windowsHide: true,
      timeout: 4000,
      encoding: 'utf8',
    })
    const match = /^\s*\S.*?\s+REG_SZ\s+(.+?)\s*$/m.exec(stdout)
    return match ? match[1].trim() : ''
  } catch {
    return ''
  }
}

/** Candidate Steam roots, most reliable first. */
async function steamCandidates() {
  const roots = []
  const push = (value) => {
    if (typeof value !== 'string') return
    const trimmed = value.trim().replace(/^"+|"+$/g, '')
    if (trimmed === '') return
    const normalized = path.resolve(trimmed.replace(/[\\/]+$/, '').replace(/\//g, path.sep))
    if (!roots.some((entry) => entry.toLowerCase() === normalized.toLowerCase())) roots.push(normalized)
  }
  push(process.env.STEAM_PATH || '')
  push(await registryValue('HKCU\\Software\\Valve\\Steam', 'SteamPath'))
  push(await registryValue('HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath'))
  push(await registryValue('HKLM\\SOFTWARE\\Valve\\Steam', 'InstallPath'))
  for (const drive of ['C:', 'D:', 'E:', 'F:']) {
    push(`${drive}\\Program Files (x86)\\Steam`)
    push(`${drive}\\Program Files\\Steam`)
    push(`${drive}\\Steam`)
    push(`${drive}\\SteamLibrary`)
  }
  return roots
}

/** First candidate that really looks like a Steam root. */
async function findSteamRoot() {
  for (const root of await steamCandidates()) {
    if (await isDirectory(path.join(root, 'steamapps'))) return root
  }
  return ''
}

/** Every Steam library root: the install itself plus `libraryfolders.vdf`. */
async function libraryRoots(steamRoot) {
  const roots = []
  const push = (value) => {
    if (typeof value !== 'string' || value.trim() === '') return
    const normalized = path.resolve(value.trim().replace(/\//g, path.sep))
    if (!roots.some((entry) => entry.toLowerCase() === normalized.toLowerCase())) roots.push(normalized)
  }
  push(steamRoot)
  const vdf = path.join(steamRoot, 'steamapps', 'libraryfolders.vdf')
  try {
    const text = await fsp.readFile(vdf, 'utf8')
    for (const match of text.matchAll(/"path"\s+"((?:[^"\\]|\\.)*)"/gi)) {
      push(match[1].replace(/\\\\/g, '\\'))
    }
  } catch {
    /* no library file: the install root alone still works */
  }
  return roots
}

/** Locate `steamapps/common/wallpaper_engine` under any library root. */
async function findWallpaperEngine(roots) {
  for (const root of roots) {
    for (const folder of ['wallpaper_engine', 'wallpaper_engine_']) {
      const dir = path.join(root, 'steamapps', 'common', folder)
      if (await exists(path.join(dir, 'config.json'))) return dir
      if (await exists(path.join(dir, 'launcher.exe'))) return dir
    }
  }
  return ''
}

/** Parse the per-project `project.json`; null when absent. */
async function readProject(dir) {
  const file = path.join(dir, 'project.json')
  try {
    const text = await fsp.readFile(file, 'utf8')
    const parsed = JSON.parse(text.replace(/^\uFEFF/, ''))
    if (parsed && typeof parsed === 'object') return parsed
  } catch {
    /* unreadable or absent manifest */
  }
  return null
}

/** Normalize a Wallpaper Engine project type. */
function kindOf(project, mainFile) {
  const declared = String((project && project.type) || '').trim().toLowerCase()
  if (KINDS.has(declared)) return declared
  const file = String(mainFile || '').toLowerCase()
  if (/\.(mp4|webm|m4v|mov|mkv|avi)$/.test(file)) return 'video'
  if (/\.html?$/.test(file)) return 'web'
  if (/\.pkg$/.test(file)) return 'scene'
  if (/\.exe$/.test(file)) return 'app'
  return 'scene'
}

/** Absolute main file of a project (may not exist for web/application). */
function mainFileOf(dir, project) {
  const declared = typeof (project && project.file) === 'string' ? project.file.trim() : ''
  if (declared === '') return ''
  return path.isAbsolute(declared) ? path.resolve(declared) : path.resolve(dir, declared)
}

/** Absolute preview image of a project, or ''. */
async function previewOf(dir, project) {
  const declared = typeof (project && project.preview) === 'string' ? project.preview.trim() : ''
  const names = declared === '' ? PREVIEW_NAMES : [declared, ...PREVIEW_NAMES]
  for (const name of names) {
    const candidate = path.isAbsolute(name) ? path.resolve(name) : path.resolve(dir, name)
    if (await isFile(candidate)) return candidate
  }
  return ''
}

/** One library item from a project folder. */
async function itemOf(dir, project, source, workshopId) {
  const file = mainFileOf(dir, project)
  const kind = kindOf(project, file)
  const preview = await previewOf(dir, project)
  const rawTitle = typeof (project && project.title) === 'string' ? project.title.trim() : ''
  const title = rawTitle === '' ? path.basename(dir) : rawTitle
  const tags = project && Array.isArray(project.tags) ? project.tags.filter((tag) => typeof tag === 'string') : []
  const general = (project && project.general) || {}
  const properties = (general && general.properties) || {}
  const schemecolor = typeof properties.schemecolor === 'string' ? properties.schemecolor : ''
  const previewKind = preview === '' ? '' : path.extname(preview).toLowerCase() === '.gif' ? 'gif' : 'image'
  return {
    id: `${source}:${workshopId || path.basename(dir)}`,
    source,
    workshopId: workshopId || null,
    title,
    kind,
    tags,
    schemecolor,
    dir,
    file,
    preview,
    previewKind,
    /** The file the browser should animate: the real video, else the preview. */
    playFile: kind === 'video' && file !== '' ? file : preview,
    playKind: kind === 'video' && file !== '' ? 'video' : previewKind === '' ? '' : 'image',
    workshopUrl: workshopId ? `https://steamcommunity.com/sharedfiles/filedetails/?id=${workshopId}` : '',
  }
}

/** Every installed Workshop wallpaper (app 431960). */
async function listWorkshop(workshopRoot) {
  const items = []
  let entries
  try {
    entries = await fsp.readdir(workshopRoot, { withFileTypes: true })
  } catch {
    return items
  }
  for (const entry of entries) {
    if (!/^\d{5,}$/.test(entry.name)) continue
    const dir = path.join(workshopRoot, entry.name)
    if (!(entry.isDirectory() || entry.isSymbolicLink())) continue
    const project = await readProject(dir)
    if (!project) continue
    items.push(await itemOf(dir, project, 'workshop', entry.name))
  }
  return items
}

/** Every locally created wallpaper (`projects/myprojects`). */
async function listLocal(weDir) {
  const items = []
  const root = path.join(weDir, 'projects', 'myprojects')
  let entries
  try {
    entries = await fsp.readdir(root, { withFileTypes: true })
  } catch {
    return items
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dir = path.join(root, entry.name)
    const project = (await readProject(dir)) || {}
    items.push(await itemOf(dir, project, 'local', null))
  }
  return items
}

/** Active wallpaper file per monitor, from the per-user config section. */
function selectedWallpapers(section) {
  const general = (section && section.general) || {}
  const config = (general && general.wallpaperconfig) || {}
  const selected = (config && config.selectedwallpapers) || {}
  const rows = []
  for (const [monitor, entry] of Object.entries(selected)) {
    const file = entry && typeof entry.file === 'string' ? entry.file : ''
    rows.push({ monitor, file })
  }
  rows.sort((a, b) => a.monitor.localeCompare(b.monitor, 'en', { numeric: true }))
  return rows
}

/** Pick the config section that belongs to the current Windows user. */
function userSection(config) {
  const name = (() => {
    try {
      return os.userInfo().username.toLowerCase()
    } catch {
      return ''
    }
  })()
  const entries = Object.entries(config).filter(([key, value]) => {
    if (key.startsWith('?') || key.toLowerCase() === 'version') return false
    return value !== null && typeof value === 'object'
  })
  const exact = entries.find(([key]) => key.toLowerCase() === name)
  if (exact) return { name: exact[0], section: exact[1] }
  const withGeneral = entries.find(([, value]) => value && typeof value.general === 'object')
  if (withGeneral) return { name: withGeneral[0], section: withGeneral[1] }
  return null
}

/** Count items per kind. */
export function countKinds(items) {
  const counts = { scene: 0, video: 0, web: 0, app: 0, all: items.length }
  for (const item of items) counts[item.kind] = (counts[item.kind] || 0) + 1
  return counts
}

/** Compare two Windows paths ignoring case and separator style. */
export function samePath(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false
  const normalize = (value) => value.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
  return normalize(left) === normalize(right)
}

/** Full discovery pass. */
async function discoverAll() {
  const warnings = []
  const steamRoot = await findSteamRoot()
  const libraries = steamRoot === '' ? [] : await libraryRoots(steamRoot)
  const weDir = await findWallpaperEngine(libraries)
  const workshopRoot = libraries
    .map((root) => path.join(root, 'steamapps', 'workshop', 'content', WE_APP_ID))
    .find(() => true) || ''

  let resolvedWorkshopRoot = ''
  for (const root of libraries) {
    const candidate = path.join(root, 'steamapps', 'workshop', 'content', WE_APP_ID)
    if (await isDirectory(candidate)) {
      resolvedWorkshopRoot = candidate
      break
    }
  }

  let user = null
  let configPath = ''
  let monitors = []
  if (weDir !== '') {
    configPath = path.join(weDir, 'config.json')
    try {
      const text = await fsp.readFile(configPath, 'utf8')
      const config = JSON.parse(text.replace(/^\uFEFF/, ''))
      user = userSection(config)
      if (user) monitors = selectedWallpapers(user.section)
      if (!user) warnings.push('config.json has no per-user section yet; open Wallpaper Engine once.')
    } catch (error) {
      warnings.push(`could not read config.json: ${error && error.message ? error.message : String(error)}`)
    }
  } else {
    warnings.push('Wallpaper Engine was not found in any Steam library.')
  }

  const items = []
  if (resolvedWorkshopRoot !== '') items.push(...(await listWorkshop(resolvedWorkshopRoot)))
  if (weDir !== '') items.push(...(await listLocal(weDir)))
  items.sort((left, right) => left.title.localeCompare(right.title, 'zh-Hans-CN'))

  return {
    steamRoot,
    libraries,
    weDir,
    configPath,
    workshopRoot: resolvedWorkshopRoot || workshopRoot,
    user: user ? user.name : '',
    monitors,
    items,
    counts: countKinds(items),
    warnings,
    scannedAt: new Date().toISOString(),
  }
}

/** Memoized discovery result. */
export async function snapshot({ force = false } = {}) {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value
  const value = await discoverAll()
  cache = { at: Date.now(), value }
  return value
}

/** Roots a media request may read from. */
export function mediaRoots(state) {
  const roots = []
  if (state && state.weDir) roots.push(path.resolve(state.weDir))
  if (state && state.workshopRoot) roots.push(path.resolve(state.workshopRoot))
  return roots
}

/** Resolve one candidate media file, fenced to the allowed roots. */
export async function resolveMedia(state, raw) {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (value === '') return null
  const absolute = path.isAbsolute(value) ? path.resolve(value) : ''
  if (absolute === '') return null
  let real
  try {
    real = await fsp.realpath(absolute)
  } catch {
    return null
  }
  const allowed = mediaRoots(state)
  const inside = allowed.some((root) => {
    const rel = path.relative(root, real)
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
  })
  if (!inside) return null
  if (!(await isFile(real))) return null
  return real
}

export default { WE_APP_ID, snapshot, invalidate, resolveMedia, mediaRoots, countKinds, samePath }
