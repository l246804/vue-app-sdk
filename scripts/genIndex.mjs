import fs from 'fs-extra'
import { readModules, resolveEntryInfo } from '../internal/utils.mjs'

const { file: entryFile, relative: relativePrefix } = resolveEntryInfo()

function genTemplate(module) {
  return `export * from '${relativePrefix}/${module}'`
}

function writeEntryFile(modules = []) {
  fs.writeFileSync(entryFile, `${modules.map(genTemplate).join('\n')}\n`)
}

function start() {
  const modules = readModules()
  writeEntryFile(modules)
}

start()
