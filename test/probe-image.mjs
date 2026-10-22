/**
 * A 1×1 PNG written from a constant, so the folder/host checks do not depend on
 * a screenshot lying around next to the plugin. Returns the file path.
 */
import fsp from 'node:fs/promises'

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
)

export async function writeProbeImage(target) {
  await fsp.writeFile(target, PNG_1X1)
  return target
}
