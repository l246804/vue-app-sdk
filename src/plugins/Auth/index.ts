import type { AuthOptions } from './Auth'
import { Auth } from './Auth'

export * from './Auth'

/**
 * 创建功能授权插件
 * @param options 配置项
 */
export function createAuth(options: AuthOptions = {}) {
  return new Auth(options)
}
