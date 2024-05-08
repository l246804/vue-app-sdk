import type { RouterScrollerOptions } from './RouterScroller'
import { RouterScroller } from './RouterScroller'

export * from './RouterScroller'

/**
 * 创建路由滚动管理插件
 * @param options 配置项
 */
export function createRouterScroller(options: RouterScrollerOptions) {
  return new RouterScroller(options)
}
