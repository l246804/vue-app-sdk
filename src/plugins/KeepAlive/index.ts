import type { KeepAliveOptions } from './KeepAlive'
import { KeepAlive } from './KeepAlive'

export * from './KeepAlive'

/**
 * 创建页面缓存管理插件
 */
export function createKeepAlive(options: KeepAliveOptions = {}) {
  return new KeepAlive(options)
}
