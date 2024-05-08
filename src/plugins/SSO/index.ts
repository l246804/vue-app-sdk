import type { SSOOptions } from './SSO'
import { SSO } from './SSO'

export * from './SSO'

/**
 * 创建单点登录插件
 * @param options 配置项
 */
export function createSSO(options: SSOOptions) {
  return new SSO(options)
}
