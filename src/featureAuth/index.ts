import { toValue } from 'vue'
import type { Directive, MaybeRefOrGetter } from 'vue'
import type { Fn, MaybeArray } from '@rhao/types-base'
import { castArray } from 'lodash-unified'
import type { AppSDKPluginObject } from '../sdk'

export type AuthListType = '*' | string[]

export type Operator = 'or' | 'and'

export interface FeatureAuthOptions {
  /**
   * 授权功能列表
   */
  authList: MaybeRefOrGetter<AuthListType>
  /**
   * 授权指令名
   * @default 'auth'
   */
  directiveName?: string
}

export interface FeatureAuth extends AppSDKPluginObject {
  /**
   * 判断是否已授权
   *
   * @example
   * ```ts
   * const featureAuth = createFeatureAuth({ authList: ['ab', 'cd'] })
   *
   * featureAuth.hasAuth('ab') // true
   * featureAuth.hasAuth('eg') // false
   * featureAuth.hasAuth(['ab', 'eg']) // true
   * featureAuth.hasAuth(['ab', 'eg'], 'and') // false
   * featureAuth.hasAuth(['ab', 'cd'], 'and') // true
   * ```
   */
  hasAuth: Fn<[features: MaybeArray<string>, op?: Operator], boolean>
  /**
   * 授权指令
   * @example
   * ```html
   * <template>
   *   <button v-auth="'list.add'">新增</button>
   *   <button v-auth="'list.edit'">编辑</button>
   *   <button v-auth:and="['list.add', 'list.edit']">删除</button>
   * </template>
   * ```
   */
  directive: Directive<HTMLElement, MaybeArray<string>>
}

/**
 * 创建功能授权管理器
 */
export function createFeatureAuth(options: FeatureAuthOptions) {
  const { authList, directiveName = 'auth' } = options

  const featureAuth: FeatureAuth = {
    hasAuth(features, op = 'or') {
      const _authList = toValue(authList)
      if (_authList === '*') return true

      features = castArray(features)
      if (features.length === 0) return false

      const authSet = new Set(_authList)
      return features[op === 'and' ? 'every' : 'some'](authSet.has)
    },
    directive: {
      mounted(el, binding) {
        const { value, arg } = binding
        if (!featureAuth.hasAuth(value, arg as Operator)) el.remove()
      },
    },
    install(sdk) {
      sdk.app.directive(directiveName, featureAuth.directive)
      sdk.featureAuth = featureAuth
    },
  }

  return featureAuth
}

declare module 'vue-app-sdk' {
  interface AppSDK {
    featureAuth: FeatureAuth
  }
}

declare module 'vue' {
  interface ComponentCustomProperties {
    vAuth: FeatureAuth['directive']
  }
}
