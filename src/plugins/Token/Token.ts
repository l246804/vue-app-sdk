import type {
  AppSDKInternalInstance,
  Plugin,
  PluginID,
  StorageOptions,
} from 'vue-app-sdk'
import type { MaybeRefOrGetter, Ref } from 'vue'
import { toValue } from 'vue'
import { isString } from 'nice-fns'
import type { KeyOf } from '@rhao/types-base'
import { assign, createPersistentRef } from '@/utils'

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
   * - `normal`: 默认格式，`resolve()` 存储即所得
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

export interface TokenState {
  /**
   * 访问令牌
   */
  accessToken: Record<TokenKey, string>
  /**
   * 刷新令牌
   */
  refreshToken: Record<TokenKey, string>
}

export type TokenType = keyof TokenState

/**
 * Token Plugin ID
 */
export const TOKEN_ID: PluginID<Token> = Symbol('token')

/**
 * 默认令牌键
 */
export const NORMAL_TOKEN = '__normal__'

function defaultState(): TokenState {
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

  id = TOKEN_ID

  /**
   * 令牌状态
   */
  private _state: Ref<TokenState>

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
   * Token.has('accessToken')
   *
   * // 应用存在多令牌
   * Token.has('accessToken', 'second')
   * ```
   */
  has = (type: TokenType, key: TokenKey = NORMAL_TOKEN) => {
    return !!this._state.value[type][key]
  }

  /**
   * 获取指定令牌
   * @param type 令牌类型
   * @param key 令牌键
   * @example
   * ```ts
   * // 应用仅存在单令牌
   * Token.get('accessToken')
   *
   * // 应用存在多令牌
   * Token.get('accessToken', 'second')
   * ```
   */
  get = (type: TokenType, key: TokenKey = NORMAL_TOKEN) => {
    return this._state.value[type][key]
  }

  /**
   * 设置令牌状态
   * @param type 令牌类型
   * @param value 令牌
   * @param key 令牌键
   * @example
   * ```ts
   * // 应用仅存在单令牌
   * Token.set('accessToken', 'token value')
   *
   * // 应用存在多令牌
   * Token.set('accessToken', 'token value', 'second')
   * ```
   */
  set(type: TokenType, value?: string, key?: TokenKey, profile?: TokenProfile): void
  /**
   * 设置令牌状态
   * @param type 令牌类型
   * @param value 多令牌值
   * @example
   * ```ts
   * import { NORMAL_TOKEN } from 'vue-app-sdk'
   *
   * // 应用仅存在单令牌
   * Token.set('accessToken', { [NORMAL_TOKEN]: 'token value' })
   *
   * // 应用存在多令牌
   * Token.set('accessToken', { [NORMAL_TOKEN]: 'token value', second: 'token value' })
   * ```
   */
  set(type: TokenType, value?: Record<TokenKey, string>, profile?: TokenProfile): void
  set(
    type: TokenType,
    value?: string | Record<TokenKey, string>,
    keyOrProfile: TokenKey | TokenProfile = NORMAL_TOKEN,
    profile: TokenProfile = {},
  ) {
    const key = isString(keyOrProfile) ? keyOrProfile : NORMAL_TOKEN
    profile = isString(keyOrProfile) ? profile : keyOrProfile

    const record = !value || isString(value) ? { [key]: value } : value
    assign(this._state.value[type], record)

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
   * Token.clear('accessToken')
   *
   * // 应用存在多令牌
   * Token.clear('accessToken', 'second')
   *
   * // 删除指定类型所有令牌
   * Token.clear('accessToken', '')
   *
   * // 删除全部令牌
   * Token.clear()
   * ```
   */
  clear = (type?: TokenType, key: TokenKey = NORMAL_TOKEN) => {
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
   * // 默认格式
   * const token = createToken()
   * token.set('accessToken', 'abcdefg')
   *
   * // 使用默认 `jwtPrefix`
   * token.toJWT() // 'abcdefg'
   *
   * // 使用自定义 `prefix`
   * token.toJWT('Bearer') // 'Bearer abcdefg'
   *
   * // JWT 格式
   * const token = createToken({ format: 'jwt' })
   * token.set('accessToken', 'abcdefg')
   *
   * // 使用默认 `jwtPrefix`
   * token.toJWT() // 'Bearer abcdefg'
   *
   * // 使用自定义 `prefix`
   * token.toJWT('Auth') // 'Auth abcdefg'
   * ```
   */
  toJWT = (prefix?: string, key: TokenKey = NORMAL_TOKEN) => {
    if (prefix == null)
      prefix = this.getTokenProfile(key).jwtPrefix
    return [prefix, this.get('accessToken', key)].filter(Boolean).join(' ')
  }

  /**
   * 根据设定令牌格式获取访问令牌
   * @param key 令牌键
   * @example
   * ```ts
   * // 默认格式
   * const token = createToken()
   * token.set('accessToken', 'abcdefg')
   * token.resolve() // 'abcdefg'
   *
   * // JWT 格式
   * const token = createToken({ format: 'jwt' })
   * token.set('accessToken', 'abcdefg')
   * token.resolve() // 'Bearer abcdefg'
   * ```
   */
  resolve = (key: TokenKey = NORMAL_TOKEN) => {
    const profile = this.getTokenProfile(key)
    const format = toValue(profile.format) || 'normal'
    return format === 'jwt' ? this.toJWT(undefined, key) : this.get('accessToken', key)
  }

  /**
   * 获取令牌配置
   * @param key 令牌键
   */
  getTokenProfile = (key: TokenKey = NORMAL_TOKEN) => {
    return Object.assign({}, this.options, this._tokenProfile[key]) as TokenProfile
  }

  install = (sdk: AppSDKInternalInstance) => {
    sdk.hook('sdk:cleanup', this.clear)
  }
}
