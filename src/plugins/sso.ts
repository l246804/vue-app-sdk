import { createSSO } from '../sso'
import type { SSOOptions } from '../sso'

/**
 * 创建 SSO 插件
 * @deprecated "createSSOPlugin" has been deprecated, please use "createSSO"
 */
export function createSSOPlugin(options: SSOOptions) {
  const sso = createSSO(options)
  console.warn('[VueAppSDK SSO] - "createSSOPlugin" has been deprecated, please use "createSSO"')
  return sso.install
}
