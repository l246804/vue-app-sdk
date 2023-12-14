import { join } from 'node:path'
import { readModules, srcRoot } from './internal/utils.mjs'

/**
 * @type {import('typedoc').TypeDocOptions}
 */
export default {
  entryPoints: readModules(true).map((name) => join(srcRoot, name)),
  plugin: ['typedoc-plugin-markdown', 'typedoc-vitepress-theme'],
  readme: 'none',
  includeVersion: true,
  outputFileStrategy: 'Modules',
  disableSources: true,
  hideInPageTOC: true,
  hideBreadcrumbs: true,
  hideGenerator: true,
  parametersFormat: 'table',
  propertiesFormat: 'table',
  enumMembersFormat: 'table',
  groupOrder: ['Variables', 'Functions', '*'],
}
