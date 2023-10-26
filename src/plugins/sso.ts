import type { Fn, NoopFn, Recordable } from '@rhao/types-base'
import type { RouteLocationNormalized } from 'vue-router'
import { type AppSDKPlugin } from '../sdk'

export interface SSOOptions {
  /**
   * 根据 `redirectUri` 获取 SSO 地址
   */
  resolveSSOUri: Fn<[redirectUri: string], string>
  /**
   * SSO 需要验证的参数
   */
  verifyParams: string[]
  /**
   * SSO 需要验证的参数长度
   * @default
   * ```ts
   * new Set(verifyParams).size
   * ```
   */
  verifyLength?: number
}

export interface SSO {
  /**
   * SSO 验证的参数
   */
  verifyParams: Set<string>
  /**
   * SSO 验证的参数长度
   */
  verifyLength: number
  /**
   * 根据 `route.query` 判断来源是否为 SSO
   */
  isFromSSO: Fn<[route: RouteLocationNormalized], boolean>
  /**
   * 根据 `route.query` 获取 SSO 参数
   */
  getSSOParams: Fn<[route: RouteLocationNormalized], Recordable<string>>
  /**
   * 忽略 `route.query` 里的 SSO 参数，返回新 `query`
   */
  omitSSOParams: Fn<[route: RouteLocationNormalized], RouteLocationNormalized['query']>
  /**
   * 去往 SSO 认证
   */
  gotoSSO: NoopFn
}

export function createSSOPlugin(options: SSOOptions): AppSDKPlugin {
  return (sdk) => {
    const resolveSSOUri = options.resolveSSOUri
    const verifyParams = new Set(options.verifyParams)
    const verifyLength = options.verifyLength ?? verifyParams.size

    function isFromSSO(route: RouteLocationNormalized) {
      const query = route.query
      let count = 0
      verifyParams.forEach((key) => {
        if (query[key]) count += 1
      })
      return count === verifyLength
    }

    function getSSOParams(route: RouteLocationNormalized) {
      const params = {} as Recordable<string>
      Object.entries(route.query).forEach(([key, value]) => {
        if (verifyParams.has(key)) params[key] = value as string
      })
      return params
    }

    function omitSSOParams(route: RouteLocationNormalized) {
      const query = {} as RouteLocationNormalized['query']
      Object.entries(route.query).forEach(([key, value]) => {
        if (verifyParams.has(key)) return
        query[key] = value
      })
      return query
    }

    function gotoSSO() {
      const redirectURI = [location.origin, location.pathname, getHashWithoutParams()]
        .filter(Boolean)
        .join('')

      location.replace(resolveSSOUri(redirectURI))
    }

    function getHashWithoutParams() {
      const hash = location.hash
      return hash.slice(0, hash.indexOf('?'))
    }

    sdk.sso = {
      verifyParams,
      verifyLength,
      isFromSSO,
      getSSOParams,
      omitSSOParams,
      gotoSSO,
    }
  }
}

declare module 'vue-app-sdk' {
  export interface AppSDK {
    /**
     * SSO 管理器
     */
    sso: SSO
  }
}
