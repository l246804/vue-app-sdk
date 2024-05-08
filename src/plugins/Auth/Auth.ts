import { type Directive, ref } from 'vue'
import type { AppSDKInternalInstance, Plugin, PluginID } from 'vue-app-sdk'
import type { MaybeArray } from '@rhao/types-base'
import { castArray } from 'nice-fns'
import { logger } from '@/utils'

/**
 * 功能授权列表，`*` 代表所有权限
 */
export type AuthList = '*' | string[]

/**
 * 操作符
 */
export type Operator = 'or' | 'and'

export interface AuthOptions {
  /**
   * 授权指令
   * @default 'auth'
   */
  directiveName?: string
}

/**
 * Auth Plugin ID
 */
export const AUTH_ID: PluginID<Auth> = Symbol('auth')

/**
 * 功能授权插件
 */
export class Auth implements Plugin {
  constructor(
    /**
     * 配置项
     */
    public options: AuthOptions = {},
  ) {
    // eslint-disable-next-line ts/no-this-alias
    const auth = this
    this.directive = {
      mounted(el, binding) {
        const { value, arg } = binding
        if (auth.verify(value, arg as Operator))
          el.remove()
      },
    }
  }

  id = AUTH_ID

  /**
   * 授权指令
   */
  directive: Directive<Element, MaybeArray<string>>

  /**
   * 授权列表
   */
  private _list = ref<AuthList>([])
  /**
   * 授权列表
   * @readonly
   */
  get list() {
    return this._list.value
  }

  /**
   * 未授权时是否允许提示
   */
  private _allowTip = true

  /**
   * 授权
   * @param list 授权列表
   */
  empower = (list: AuthList) => {
    this._list.value = list
    if (this._allowTip)
      this._allowTip = false
  }

  /**
   * 验证功能权限
   * @param features 功能列表
   * @param op 操作符
   */
  verify = (features: MaybeArray<string>, op: Operator = 'or') => {
    if (this.list === '*')
      return true

    features = castArray(features)
    if (features.length === 0)
      return false

    // 未授权提示
    if (this.list.length === 0 && this._allowTip)
      logger.warn('暂未设置授权列表！')

    const set = new Set(this.list)
    return features[op === 'and' ? 'every' : 'some'](set.has.bind(set))
  }

  install = (sdk: AppSDKInternalInstance) => {
    const { directiveName = 'auth' } = this.options
    sdk.app.directive(directiveName, this.directive)
    sdk.hook('sdk:cleanup', () => this.empower([]))
  }
}

declare module 'vue' {
  interface ComponentCustomProperties {
    vAuth: Auth['directive']
  }
}
