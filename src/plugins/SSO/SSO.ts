import type { Plugin, PluginID } from 'vue-app-sdk'
import { isArray, isString } from 'nice-fns'
import type { LocationQuery, RouteLocationNormalized } from 'vue-router'

export interface VerifyParamRecord {
  /**
   * 参数名成
   */
  name: string
  /**
   * 是否必填
   * @default true
   */
  required?: boolean
}

/**
 * 验证参数类型
 */
export type VerifyParamType = string | VerifyParamRecord

export interface SSOOptions {
  /**
   * 需要验证的参数列表，若存在多种情况可进行分组设置
   * @example
   * ```ts
   * // 不分组
   * createSSO({ verifyParams: ['token', { name: 'state', required: false }] })
   *
   * // 分组
   * createSSO({
   *   verifyParams: {
   *     success: ['token', { name: 'state', required: false }],
   *     error: ['error'],
   *   }
   * })
   * ```
   */
  verifyParams: VerifyParamType[] | Record<string, VerifyParamType[]>
  /**
   * 获取单点登录地址
   */
  resolveSSOUri: (redirectUri: string) => string
}

/**
 * SSO Plugin ID
 */
export const SSO_ID: PluginID<SSO> = Symbol('sso')

const DEFAULT_GROUP_KEY = 'normal'

/**
 * 单点登录插件
 */
export class SSO implements Plugin {
  constructor(
    /**
     * 配置项
     */
    public options: SSOOptions,
  ) {
    const { verifyParams } = options
    if (isArray(verifyParams)) {
      this._verifyParams = { [DEFAULT_GROUP_KEY]: this._normalizeParams(verifyParams) }
    }
    else {
      this._verifyParams = Object.fromEntries(
        Object.entries(verifyParams).map(([key, params]) => [key, this._normalizeParams(params)]),
      )
    }
  }

  id = SSO_ID

  /**
   * 需要验证的参数列表
   */
  private _verifyParams: Record<string, VerifyParamRecord[]>

  /**
   * 统一化参数列表
   * @param params 参数列表
   */
  private _normalizeParams = (params: VerifyParamType[]): VerifyParamRecord[] => {
    return params.map((param) => ({
      required: true,
      ...(isString(param) ? { name: param } : param),
    }))
  }

  /**
   * 获取不带参数的哈希路径
   */
  private _getHashWithoutParams = () => {
    const hash = location.hash
    return hash.slice(0, hash.indexOf('?'))
  }

  /**
   * 验证分组参数列表
   * @param route 路由
   * @param params 需要验证的参数列表
   */
  private _verifyGroupParams = (route: RouteLocationNormalized, params: VerifyParamRecord[]) => {
    return params.every(({ name, required }) => {
      if (!required)
        return true
      return name in route.query
    })
  }

  /**
   * 验证路由是否来源于单点登录
   * @param route 路由
   */
  isFromSSO = (route: RouteLocationNormalized) => {
    return Object.values(this._verifyParams).some((verifyParams) =>
      this._verifyGroupParams(route, verifyParams))
  }

  /**
   * 获取验证参数
   * @param route 路由
   */
  getVerifyParams = <T = LocationQuery>(
    route: RouteLocationNormalized,
  ): [groupKey: string, params: T] => {
    const params = {} as T

    for (const [groupKey, verifyParams] of Object.entries(this._verifyParams)) {
      // 分组未验证通过时跳过后续步骤
      if (!this._verifyGroupParams(route, verifyParams))
        continue

      // 复制单点登录参数
      for (const { name } of verifyParams) {
        if (name in route.query)
          params[name] = route.query[name]
      }

      // 返回分组名和参数
      return [groupKey, params]
    }

    return [DEFAULT_GROUP_KEY, params]
  }

  /**
   * 跳转至单点登录页
   */
  gotoSSO = () => {
    const redirectURI = [location.origin, location.pathname, this._getHashWithoutParams()]
      .filter(Boolean)
      .join('')
    location.replace(this.options.resolveSSOUri(redirectURI))
  }

  install = () => {}
}
