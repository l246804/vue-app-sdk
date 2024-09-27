import type { PageOptions } from './Page'
import { Page } from './Page'

export * from './define'
export * from './helper'
export * from './interface'
export * from './Page'

/**
 * 创建应用页面管理插件
 * @param options 配置项
 */
export function createPage(options: PageOptions) {
  return new Page(options)
}
