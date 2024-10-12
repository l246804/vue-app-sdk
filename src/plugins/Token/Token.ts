import type { KeyOf } from '@rhao/types-base'
import type { MaybeRefOrGetter, Ref } from 'vue'
import type { AppSDKInternalInstance, Plugin, PluginID, StorageOptions } from 'vue-app-sdk'
import { assign, createPersistentRef } from '@/utils'
import { isString } from 'nice-fns'
import { toValue } from 'vue'

/**
 * 访问令牌格式
 */
export type AccessTokenFormat = 'normal' | 'jwt'

/**
 * 定义令牌键，在使用插件方法时可以获取类型提示
 * @example
 * ```ts
 * // types/vue-app-sdk.d.ts
 * declare module 'vue-app-sdk' {
 *   interface TokenRecord {
 *     // 令牌 'aaa'，这里值类型随意设置
 *     aaa: void
 *   }
 * }
 * ```
 */
export interface TokenRecord {}

/**
 * 令牌键
 */
export type TokenKey = KeyOf<TokenRecord, string>

export interface TokenProfile {
  /**
   * 访问令牌格式
   * - `normal`: 普通格式，`resolve()` 存储即所得
   * - `jwt`: JWT(JSON Web Token) 格式，`resolve()` 返回 `toJWT()` 格式
   *
   * @default 'normal'
   */
  format?: MaybeRefOrGetter<AccessTokenFormat>
  /**
   * 默认的 JWT(JSON Web Token) 前缀
   * @default 'Bearer'
   */
  jwtPrefix?: string
}

export interface TokenOptions extends TokenProfile, StorageOptions {}

export interface TokenState<Multiple extends boolean = true> {
  /**
   * 访问令牌
   */
  accessToken: [Multiple] extends [true] ? Partial<Record<TokenKey, string>> : string
  /**
   * 刷新令牌
   */
  refreshToken: [Multiple] extends [true] ? Partial<Record<TokenKey, string>> : string
}

export type TokenType = keyof TokenState

/**
 * Token Plugin ID
 */
export const TOKEN_ID: PluginID<Token> = Symbol('token')

function defaultState(): TokenState<true> {
  return {
    accessToken: {},
    refreshToken: {},
  }
}

/**
 * 应用令牌管理插件
 */
export class Token implements Plugin {
  constructor(
    /**
     * 配置项
     */
    public options: TokenOptions = {},
  ) {
    const { persistent = true, window, storage, storageKey = '__VUE_APP_SDK__TOKEN__' } = options
    this._state = createPersistentRef({
      persistent,
      window,
      storage,
      storageKey,
      value: defaultState(),
    })

    // 绑定 this
    this.set = this.set.bind(this)
  }

  /**
   * 默认令牌键
   */
  static get defaultKey() {
    return '__PRIVATE__'
  }

  id = TOKEN_ID

  /**
   * 令牌状态
   */
  private _state: Ref<TokenState<true>>

  /**
   * 令牌配置
   */
  private _tokenProfile: Record<string, TokenProfile> = {}

  /**
   * 指定令牌是否存在
   * @param type 令牌类型
   * @param key 令牌键
   * @example
   * ```ts
   * // 应用仅存在单令牌
   * token.has('accessToken')
   *
   * // 应用存在多令牌
   * token.has('accessToken', 'second')
   * ```
   */
  has = (type: TokenType, key: TokenKey = Token.defaultKey) => {
    return !!this.get(type, key)
  }

  /**
   * 获取指定令牌
   * @param type 令牌类型
   * @param key 令牌键
   * @example
   * ```ts
   * // 应用仅存在单令牌
   * token.get('accessToken')
   *
   * // 应用存在多令牌
   * token.get('accessToken', 'second')
   * ```
   */
  get = (type: TokenType, key: TokenKey = Token.defaultKey) => {
    return this._state.value[type][key]
  }

  /**
   * 设置令牌状态
   * @param type 令牌类型
   * @param value 令牌
   * @param key 令牌键
   * @param profile 令牌配置
   *
   * @example
   * ```ts
   * // 应用仅存在单令牌
   * token.set('accessToken', 'token value', { format: 'jwt' })
   *
   * // 应用存在多令牌
   * token.set('accessToken', 'token value', 'second', { format: 'jwt', jwtPrefix: 'Token' })
   * ```
   */
  set(type: TokenType, value?: string, key?: TokenKey, profile?: TokenProfile): void
  /**
   * 设置令牌状态
   * @param type 令牌类型
   * @param value 令牌
   * @param profile 令牌配置
   *
   * @example
   * ```ts
   * // 应用仅存在单令牌
   * token.set('accessToken', 'token value', { format: 'jwt' })
   *
   * // 应用存在多令牌
   * token.set('accessToken', 'token value', 'second', { format: 'jwt', jwtPrefix: 'Token' })
   * ```
   */
  set(type: TokenType, value?: string, profile?: TokenProfile): void
  /**
   * 设置令牌状态
   * @param state 令牌状态
   * @param key 令牌键
   * @param profile 令牌配置
   *
   * @example
   * ```ts
   * // 应用仅存在单令牌
   * token.set({ accessToken: 'token value' }, { format: 'jwt' })
   *
   * // 应用存在多令牌
   * token.set({ accessToken: 'token value' }, 'second', { format: 'jwt', jwtPrefix: 'Token' })
   * ```
   */
  set(state: Partial<TokenState<false>>, key?: TokenKey, profile?: TokenProfile): void
  /**
   * 设置令牌状态
   * @param state 令牌状态
   * @param profile 令牌配置
   *
   * @example
   * ```ts
   * // 应用仅存在单令牌
   * token.set({ accessToken: 'token value' }, { format: 'jwt' })
   *
   * // 应用存在多令牌
   * token.set({ accessToken: 'token value' }, 'second', { format: 'jwt', jwtPrefix: 'Token' })
   * ```
   */
  set(state: Partial<TokenState<false>>, profile?: TokenProfile): void
  set(...args: any[]) {
    if (isString(args[0])) {
      const [type, value, ..._args] = args
      args = [{ [type]: value }, ..._args]
    }

    // 处理参数
    const [state, keyOrProfile, profileOrNil] = args
    const key = (isString(keyOrProfile) ? keyOrProfile : Token.defaultKey) || Token.defaultKey
    const profile = isString(keyOrProfile) ? profileOrNil : keyOrProfile

    Object.entries(state).forEach(([type, value]) => {
      assign(this._state.value[type], { [key]: value })
    })

    if (!this._tokenProfile[key])
      this._tokenProfile[key] = {}
    assign(this._tokenProfile[key], profile)
  }

  /**
   * 清理令牌状态
   * @param type 令牌类型，设为空时清理全部令牌
   * @param key 令牌键，设为空时清理指定类型全部令牌
   * @example
   * ```ts
   * // 应用仅存在单令牌
   * token.clear('accessToken')
   *
   * // 应用存在多令牌
   * token.clear('accessToken', 'second')
   *
   * // 删除指定类型所有令牌
   * token.clear('accessToken', '')
   *
   * // 删除全部令牌
   * token.clear()
   * ```
   */
  clear = (type?: TokenType, key: TokenKey = Token.defaultKey) => {
    if (type) {
      if (key)
        this.set(type, '', key)
      else this._state.value[type] = {}
    }
    else {
      this._state.value = defaultState()
    }
  }

  /**
   * 转为 JWT(JSON Web Token) 格式令牌
   * @param prefix JWT(JSON Web Token) 前缀
   * @param key 令牌键
   * @returns JWT(JSON Web Token) 格式令牌
   * @example
   * ```ts
   * // 使用默认 `jwtPrefix`
   * token.toJWT() // 'Bearer abcdefg'
   *
   * // 使用自定义 `jwtPrefix`
   * token.toJWT('Token') // 'Token abcdefg''
   * ```
   */
  toJWT = (prefix?: string, key: TokenKey = Token.defaultKey) => {
    if (prefix == null)
      prefix = this.getTokenProfile(key).jwtPrefix
    return [prefix, this.get('accessToken', key)].filter(Boolean).join(' ')
  }

  /**
   * 根据设定令牌格式获取访问令牌
   * @param key 令牌键
   * @example
   * ```ts
   * // 普通格式
   * const token = createToken()
   * token.set('accessToken', 'abcdefg')
   * token.resolve() // 'abcdefg'
   *
   * // JWT 格式
   * const token = createToken({ format: 'jwt' })
   * token.set('accessToken', 'abcdefg')
   * token.resolve() // 'Bearer abcdefg'
   *
   * // 单独设置
   * const token = createToken()
   * token.set('accessToken', 'abcdefg', { format: 'jwt', jwtPrefix: 'Token' })
   * token.resolve() // 'Token abcdefg'
   * ```
   */
  resolve = (key: TokenKey = Token.defaultKey) => {
    const profile = this.getTokenProfile(key)
    return toValue(profile.format) === 'jwt'
      ? this.toJWT(profile.jwtPrefix, key)
      : this.get('accessToken', key)
  }

  /**
   * 获取令牌配置
   * @param key 令牌键
   */
  getTokenProfile = (key: TokenKey = Token.defaultKey) => {
    return Object.assign(
      { format: 'normal', jwtPrefix: 'Bearer' } as TokenProfile,
      this.options,
      this._tokenProfile[key],
    ) as TokenProfile
  }

  install = (sdk: AppSDKInternalInstance) => {
    sdk.hook('sdk:cleanup', this.clear)
  }
}
