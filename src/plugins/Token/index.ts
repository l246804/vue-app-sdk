import type { TokenOptions } from './Token'
import { Token } from './Token'

export * from './Token'

/**
 * 创建应用令牌管理插件
 * @param options 配置项
 */
export function createToken(options: TokenOptions = {}) {
  return new Token(options)
}
