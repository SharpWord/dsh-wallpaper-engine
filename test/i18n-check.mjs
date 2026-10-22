/**
 * Guards the i18n contract the bundle relies on: every `t('key')` used by the
 * client must exist in BOTH language dictionaries, otherwise the panel renders
 * an empty string (that is how a half-added feature ships broken).
 * Run: node test/i18n-check.mjs
 */
import fsp from 'node:fs/promises'

const source = await fsp.readFile(new URL('../client.js', import.meta.url), 'utf8')
const used = new Set([...source.matchAll(/\bt\('([A-Za-z][A-Za-z0-9]*)'\)/g)].map((match) => match[1]))

const enStart = source.indexOf('      en: {')
const zhStart = source.indexOf('      zh: {')
const zhEnd = source.indexOf('\n    }\n', zhStart)
if (enStart < 0 || zhStart < 0 || zhEnd < 0) {
  console.error('could not locate the dictionaries')
  process.exit(1)
}

/** Keys declared in one dictionary slice. */
function keysOf(slice) {
  const keys = new Set([...slice.matchAll(/^\s{6,}([A-Za-z][A-Za-z0-9]*):/gm)].map((match) => match[1]))
  // The slice boundaries are dictionary labels, not keys.
  keys.delete('en')
  keys.delete('zh')
  return keys
}

const en = keysOf(source.slice(enStart, zhStart))
const zh = keysOf(source.slice(zhStart, zhEnd))

const problems = []
for (const key of used) {
  if (!en.has(key)) problems.push(`missing in en: ${key}`)
  if (!zh.has(key)) problems.push(`missing in zh: ${key}`)
}
for (const key of en) if (!zh.has(key)) problems.push(`only in en: ${key}`)
for (const key of zh) if (!en.has(key)) problems.push(`only in zh: ${key}`)

console.log(`used keys: ${used.size} | en: ${en.size} | zh: ${zh.size}`)
const unused = [...en].filter((key) => !used.has(key))
console.log(`declared but unused: ${unused.length ? unused.join(', ') : 'none'}`)
if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log('i18n: ok')
