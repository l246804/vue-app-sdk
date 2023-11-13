import type {
  Fn,
  NoopFn,
  NotNullish,
  Recordable,
} from '@rhao/types-base'
import type { RouteLocationNormalized } from 'vue-router'
import { omit } from 'lodash-unified'
import type { AppSDKPluginObject } from '../sdk'

export interface SSOOptions {
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
  /**
   * 根据 `redirectUri` 获取 SSO 地址
   */
  resolveSSOUri: Fn<[redirectUri: string], string>
  /**
   * 识别 SSO 结果
   *
   * @example
   * ```ts
   * const sso = createSSO({
   *   verifyParams: ['authCode', 'error', 'state'],
   *   verifyLength: 2,
   *   identifyResult: (params) => {
   *     const error = !!params.error
   *     return { error, data: error ? params.error : params.authCode }
   *   }
   * })
   *
   * sso.verifyResult(to) // { error: false, data: '', params: { ... } }
   * ```
   *
   * @default
   * ```ts
   * (params) => ({ error: false, data: '' })
   * ```
   */
  identifyResult?: Fn<
    [params: Recordable<string>],
    {
      /**
       * 判断识别成功还是失败
       */
      error: boolean
      /**
       * 识别数据，错误时存放错误信息，成功时存放授权数据
       */
      data: string
    }
  >
}

export interface SSO extends AppSDKPluginObject {
  /**
   * SSO 验证的参数
   */
  readonly verifyParams: Set<string>
  /**
   * SSO 验证的参数长度
   */
  readonly verifyLength: number
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
  /**
   * 验证 SSO 结果
   */
  verifyResult: Fn<
    [route: RouteLocationNormalized],
    ReturnType<NotNullish<SSOOptions['identifyResult']>> & {
      /** SSO 参数 */ params: Recordable<string>
    }
  >
  /**
   * 基于 `route` 返回不需要传递 `to` 参数的 SSO
   *
   * @example
   * ```ts
   * const sso = createSSO({ ... })
   *
   * // 原始的 SSO
   * sso.isFromSSO(to)
   * sso.getSSOParams(to)
   *
   * // 携带 to 的 SSO
   * const _sso = sso.withRoute(to)
   * _sso.isFromSSO()
   * _sso.getSSOParams()
   * ```
   */
  withRoute: Fn<[route: RouteLocationNormalized], WithRoute<Omit<SSO, 'withRoute'>>>
}

type WithRoute<T extends object> = {
  [K in keyof T]: [T[K]] extends [Fn<[infer P0, ...infer P], infer R>]
    ? [P0] extends [RouteLocationNormalized]
        ? [unknown] extends [P0]
            ? T[K]
            : Fn<P, R>
        : T[K]
    : T[K]
// eslint-disable-next-line @typescript-eslint/ban-types
} & {}

function getHashWithoutParams() {
  const hash = location.hash
  return hash.slice(0, hash.indexOf('?'))
}

/**
 * 创建 SSO 管理器
 */
export function createSSO(options: SSOOptions) {
  const { resolveSSOUri, identifyResult = () => ({ error: false, data: '' }) } = options
  const verifyParams = new Set(options.verifyParams)
  const verifyLength = options.verifyLength ?? verifyParams.size

  const sso: SSO = {
    verifyParams,
    verifyLength,
    verifyResult,
    isFromSSO,
    getSSOParams,
    omitSSOParams,
    gotoSSO,
    withRoute,
    install: (sdk) => {
      sdk.sso = sso
    },
  }

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

  function verifyResult(to) {
    const params = getSSOParams(to)
    return { ...identifyResult(params), params: getSSOParams(to) }
  }

  function withRoute(to) {
    const _sso = omit(sso, ['withRoute'])
    const needToFnMethods = ['getSSOParams', 'isFromSSO', 'omitSSOParams', 'verifyResult']
    return {
      ..._sso,
      ...needToFnMethods.map(
        (method) =>
          (...args) =>
            _sso[method](to, ...args),
      ),
    } as any
  }

  return sso
}

declare module 'vue-app-sdk' {
  export interface AppSDK {
    /**
     * SSO 管理器
     */
    sso: SSO
  }
}
