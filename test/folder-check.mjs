/**
 * End-to-end check of the drop-in wallpaper folder: it is created, a picture
 * dropped into it shows up in the library, and /media is allowed to read it.
 * Run: node test/folder-check.mjs
 *
 * Uses a throw-away folder next to this script (DSH_WALLPAPER_FOLDER), never the
 * user's real Pictures\ds-wallpapers.
 */
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const temp = path.join(here, '.tmp-folder')
process.env.DSH_WALLPAPER_FOLDER = temp
await fsp.rm(temp, { recursive: true, force: true })

const { ensureLocalFolder, snapshot, resolveMedia, mediaRoots, invalidate } = await import('../discovery.js')
const { writeProbeImage } = await import('./probe-image.mjs')

const info = await ensureLocalFolder()
console.log('folder   :', info)

const probe = path.join(info.dir, '__probe__')
await writeProbeImage(`${probe}.png`)
invalidate()
const state = await snapshot({ force: true })
const item = state.items.find((one) => one.source === 'folder')

console.log('folderState:', state.folder)
console.log('item       :', item && { id: item.id, title: item.title, kind: item.kind, playKind: item.playKind })
console.log('mediaRoots :', mediaRoots(state))
console.log('resolveMedia:', item ? await resolveMedia(state, item.file) : null)
console.log('readme     :', await fsp.readFile(path.join(info.dir, 'README.txt'), 'utf8').then((t) => t.split(/\r?\n/)[0]))
console.log('counts     :', state.counts)

await fsp.rm(`${probe}.png`, { force: true })
invalidate()
const after = await snapshot({ force: true })
console.log('countAfter :', after.folder.count, 'itemStillThere:', after.items.some((one) => one.source === 'folder'))
await fsp.rm(temp, { recursive: true, force: true })
