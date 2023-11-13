import type { AnyFn, Fn, NoopFn } from '@rhao/types-base'
import { assign } from 'lodash-unified'
import type { AppSDKPluginObject } from '../sdk'
import type { StorageOptions } from '../types'
import { createPersistentRef } from '../utils'

export type AccessTokenFormat = 'normal' | 'jwt'

export interface TokenOptions extends StorageOptions {
  /**
   * `accessToken` 格式
   * - `normal`: 默认格式，`resolve()` 存储即所得
   * - `jwt`: JWT(JSON Web Token) 格式，`resolve()` 返回 `toJWT()` 格式
   *
   * @default 'normal'
   */
  format?: AccessTokenFormat
  /**
   * JWT(JSON Web Token) 前缀
   * @default 'Bearer'
   */
  jwtPrefix?: string
}

export interface TokenState {
  /**
   * 访问令牌
   */
  accessToken: string
  /**
   * 刷新令牌
   */
  refreshToken: string
}

export interface Token extends AppSDKPluginObject {
  /**
   * 是否有对应令牌
   */
  has: Fn<[key: keyof TokenState], boolean>
  /**
   * 获取存储的对应令牌
   */
  get: Fn<[key: keyof TokenState], string>
  /**
   * 设置令牌信息
   */
  set: Fn<[state: Partial<TokenState>]>
  /**
   * 清除对应令牌
   */
  clear: Fn<[key?: keyof TokenState]>
  /**
   * 清除令牌缓存并清除令牌信息
   */
  clearCache: NoopFn
  /**
   * 转换为 JWT(JSON Web Token 格式)
   * @example
   * ```ts
   * // 默认格式
   * const token = createToken()
   * token.set({ accessToken: 'abcdefg' })
   *
   * // 使用默认 `jwtPrefix`
   * token.toJWT() // 'abcdefg'
   *
   * // 使用自定义 `prefix`
   * token.toJWT('Bearer') // 'Bearer abcdefg'
   *
   * // JWT 格式
   * const token = createToken({ format: 'jwt' })
   * token.set({ accessToken: 'abcdefg' })
   *
   * // 使用默认 `jwtPrefix`
   * token.toJWT() // 'Bearer abcdefg'
   *
   * // 使用自定义 `prefix`
   * token.toJWT('Auth') // 'Auth abcdefg'
   * ```
   */
  toJWT: Fn<[prefix?: string], string>
  /**
   * 获取 `accessToken`，不同格式返回对应的 `token`
   * @example
   * ```ts
   * // 默认格式
   * const token = createToken()
   * token.set({ accessToken: 'abcdefg' })
   * token.resolve() // 'abcdefg'
   *
   * // JWT 格式
   * const token = createToken({ format: 'jwt' })
   * token.set({ accessToken: 'abcdefg' })
   * token.resolve() // 'Bearer abcdefg'
   * ```
   */
  resolve: Fn<[], string>
}

const defaultState = () => ({ accessToken: '', refreshToken: '' }) as TokenState

export function createToken(options: TokenOptions = {}) {
  const {
    persisted = true,
    window,
    storage,
    storageKey = '__VUE_APP_SDK__TOKEN__',
    format = 'normal',
    jwtPrefix = format === 'normal' ? '' : 'Bearer',
  } = options
  const state = createPersistentRef({
    persisted,
    window,
    storage,
    storageKey,
    value: defaultState(),
  })

  function withPreface<T extends AnyFn>(fn: T) {
    return ((...args) => {
      if (!state.value) state.value = defaultState()
      return fn(...args)
    }) as T
  }

  const token: Token = {
    has: withPreface((key) => !!state.value[key]),
    get: withPreface((key) => state.value[key]),
    set: withPreface((value) => {
      assign(state.value, value)
    }),
    clear: withPreface((key) => token.set(key ? { [key]: '' } : defaultState())),
    clearCache: () => {
      state.value = null
    },
    toJWT: withPreface((prefix = jwtPrefix) =>
      [prefix, state.value.accessToken].filter(Boolean).join(' ')),
    resolve: withPreface(() => (format === 'normal' ? state.value.accessToken : token.toJWT())),
    install: (sdk) => {
      sdk.token = token
      sdk.hooks.hook('sdk:cleanup', token.clearCache)
    },
  }

  return token
}

declare module 'vue-app-sdk' {
  export interface AppSDK {
    /**
     * 令牌管理器
     */
    token: Token
  }
}
