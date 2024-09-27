import type { TabsOptions } from './Tabs'
import { Tabs } from './Tabs'

export * from './interface'
export * from './Tabs'

/**
 * 创建标签页管理插件
 * @param options 配置项
 */
export function createTabs(options: TabsOptions = {}) {
  return new Tabs(options)
}
