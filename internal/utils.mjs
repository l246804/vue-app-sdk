import { basename, extname, resolve } from 'node:path'
import { cwd } from 'node:process'
import fs from 'fs-extra'
import { isString } from 'lodash-unified'

export const srcRoot = resolve(cwd(), 'src')
export const srcIndexFile = resolve(srcRoot, 'index.ts')

export function resolveEntryInfo() {
  return {
    file: srcIndexFile,
    relative: '.',
  }
}

const exclude = ['types', 'utils', 'plugins']

export function readModules(preserveExtname = false) {
  return fs
    .readdirSync(srcRoot)
    .map((name) => basename(name, preserveExtname ? '' : extname(name)))
    .filter((name) => !exclude.some((reg) => isString(reg) ? reg === name : reg.test(name)))
}
