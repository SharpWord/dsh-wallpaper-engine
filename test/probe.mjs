/** Dev probe: print what the Host half discovers on this machine. */
import { snapshot, resolveMedia, countKinds } from '../discovery.js'

const state = await snapshot({ force: true })
console.log('steamRoot   :', state.steamRoot)
console.log('libraries   :', state.libraries.join(' | '))
console.log('weDir       :', state.weDir)
console.log('configPath  :', state.configPath)
console.log('workshopRoot:', state.workshopRoot)
console.log('user        :', state.user)
console.log('monitors    :', JSON.stringify(state.monitors, null, 2))
console.log('counts      :', JSON.stringify(countKinds(state.items)))
console.log('warnings    :', state.warnings)
const sample = state.items.slice(0, 5)
for (const item of sample) {
  console.log('---')
  console.log(JSON.stringify({ id: item.id, title: item.title, kind: item.kind, file: item.file, preview: item.preview, playKind: item.playKind }, null, 2))
}
const active = state.monitors[0]
if (active && active.file) {
  const resolved = await resolveMedia(state, active.file)
  console.log('active file resolves:', Boolean(resolved), resolved)
  const escaped = await resolveMedia(state, 'C:/Windows/win.ini')
  console.log('outside root rejected:', escaped === null)
  const gif = state.items.find((item) => item.previewKind === 'gif')
  if (gif) console.log('gif preview         :', gif.preview, Boolean(await resolveMedia(state, gif.preview)))
  const video = state.items.find((item) => item.kind === 'video')
  if (video) console.log('video item          :', video.file, Boolean(await resolveMedia(state, video.file)))
}
