import type { PageOptions } from './Page'
import { Page } from './Page'

export * from './Page'
export * from './interface'
export * from './macros'
export * from './helper'

/**
 * 创建应用页面管理插件
 * @param options 配置项
 */
export function createPage(options: PageOptions) {
  return new Page(options)
}
