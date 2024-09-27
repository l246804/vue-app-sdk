import type { StorageOptions } from '@/types'
import type { NoopFn, NotNullish, Simplify } from '@rhao/types-base'
/* eslint-disable ts/method-signature-style */
import type { InjectionKey, ShallowRef } from 'vue'
import type { RouteLocationNormalized } from 'vue-router'
import type { Plugin, PluginID } from './Plugin'
import { assign, createPersistentRef } from '@/utils'
import { pick } from 'nice-fns'
import { inject, shallowReactive, shallowReadonly, watch } from 'vue'
import { isNavigationFailure, useRoute } from 'vue-router'
import { type AppSDKInternalInstance, useAppSDK } from './SDK'

/**
 * 路由导航方向
 */
export enum NavigationDirection {
  /**
   * 前进
   */
  forward = 'forward',
  /**
   * 后退
   */
  backward = 'backward',
  /**
   * 刷新
   */
  unchanged = 'unchanged',
}

/**
 * 路由配置项
 */
export interface RouterOptions extends Omit<StorageOptions<true>, 'persistent'> {
  /**
   * 是否持久化详情记录，开启后会将 `detailsRecord` 存储在 `storage` 中，防止刷新丢失
   *
   * ***注意：持久化后会缓存每次导航的详情信息，默认只在导航后退时清理旧导航信息，也可手动执行 `router.clearDetails()` 清理全部缓存。***
   * @default true
   */
  persistentDetails?: boolean
  /**
   * 自定义识别导航方向
   * @param to 目标路由
   * @param from 来源路由
   */
  identifyDirection?: (ctx: {
    to: RouteLocationNormalized
    from: RouteLocationNormalized
    latestPosition: number | null
    currentPosition: number | null
  }) => NavigationDirection
}

/**
 * Router Plugin ID
 */
export const ROUTER_ID: PluginID<Router> = Symbol('router')

/**
 * 路由详情
 */
export interface RouteDetails<T = unknown> {
  /**
   * 来源路由信息
   */
  from:
    | Simplify<Readonly<Pick<RouteLocationNormalized, 'path' | 'name' | 'fullPath' | 'hash'>>>
    | undefined
  /**
   * 详情数据
   */
  data: T | undefined
}

/**
 * 路由详情记录
 */
export type RouteDetailsRecord = Record<string, RouteDetails>

/**
 * 路由详情变更标识
 */
const DETAILS_CHANGED_FLAG = Symbol('details changed flag')

/**
 * Route Details Record Injection Key
 */
const DETAILS_RECORD_KEY: InjectionKey<ShallowRef<RouteDetailsRecord>> = Symbol('details record')

/**
 * 获取路由详情（只读）
 *
 * @example
 * ```ts
 * // a.vue
 * router.pushWithData('/b', { msg: 'from a' })
 *
 * // b.vue
 * import { useRouteDetails } from 'vue-app-sdk'
 *
 * const details = useRouteDetails()
 * details.data.msg // => 'from a'
 *
 * // 持续监听
 * watch(() => details.data, (data) => {
 *   console.log(data)
 * })
 * ```
 */
export function useRouteDetails<T = unknown>() {
  const sdk = useAppSDK()
  const detailsRecord = inject(DETAILS_RECORD_KEY)!
  const { getDetails, makeDetails } = sdk.getPlugin(ROUTER_ID)!
  const { fullPath } = useRoute()

  // 路由详情
  const details = shallowReactive(makeDetails(getDetails[fullPath]) as RouteDetails<T>)

  // 监听详情记录，有变更时更新 details
  watch(detailsRecord, (record) => {
    const newDetails = record[fullPath]
    if (!newDetails)
      return

    // 不相等时更新详情
    if (newDetails[fullPath[DETAILS_CHANGED_FLAG]] !== details[DETAILS_CHANGED_FLAG])
      assign(details, newDetails)
  })

  return shallowReadonly(details)
}

/**
 * 默认的路由详情数据
 */
const DEFAULT_DETAILS_DATA = Symbol('details data')

/**
 * 默认识别导航方向
 */
const defaultIdentifyDirection: NotNullish<RouterOptions['identifyDirection']> = ({
  latestPosition,
  currentPosition,
}) => {
  if (latestPosition == null || currentPosition == null)
    return NavigationDirection.forward

  if (currentPosition < latestPosition)
    return NavigationDirection.backward

  if (currentPosition === latestPosition)
    return NavigationDirection.unchanged

  return NavigationDirection.forward
}

/**
 * 路由插件
 */
export class Router implements Plugin {
  constructor(
    /**
     * 配置项
     */
    public options: RouterOptions = {},
  ) {
    const {
      persistentDetails = true,
      storage,
      storageKey = '__VUE_APP_SDK__ROUTE_DETAILS_RECORD__',
      window,
    } = options

    this._detailsRecord = createPersistentRef(
      {
        persistent: persistentDetails,
        window,
        storage,
        storageKey,
        shallow: true,
        value: {} as RouteDetailsRecord,
      },
      true,
    )
  }

  id = ROUTER_ID

  /**
   * 最近记录的位置
   */
  latestPosition: number | null = null

  /**
   * 识别导航方向
   * @readonly
   */
  get identifyDirection() {
    return this.options.identifyDirection || defaultIdentifyDirection
  }

  /**
   * 路由详情记录
   */
  private _detailsRecord: ShallowRef<RouteDetailsRecord>

  /**
   * 锁定 `beforeOnce`
   */
  private _onceLocked = false

  /**
   * 详情数据
   */
  private _detailsData: unknown = DEFAULT_DETAILS_DATA

  /**
   * 设置详情数据
   * @param data 详情数据
   */
  private _setDetailsData = (data) => {
    this._detailsData = data
  }

  /**
   * 消费详情数据
   */
  private _consumeDetailsData = () => {
    const isChanged = this._detailsData === DEFAULT_DETAILS_DATA
    const data = isChanged ? this._detailsData : undefined
    return { isChanged, data }
  }

  /**
   * 更新详情记录
   * @param value 详情记录
   */
  private _updateDetailsRecord(value: RouteDetailsRecord) {
    this._detailsRecord.value = value
  }

  /**
   * 获取路由详情
   * @param fullPath 完整路径
   * @returns 路由详情
   */
  getDetails = (fullPath: string) => {
    return this._detailsRecord.value[fullPath]
  }

  /**
   * 清理所有详情记录
   */
  clearDetailsRecord = () => {
    this._updateDetailsRecord({})
  }

  /**
   * 创建路由详情
   * @param details 需要合并的路由详情
   * @param increment 需要自增路由详情变更次数
   */
  makeDetails = (details?: Partial<RouteDetails>, increment = false): RouteDetails => {
    const count: number = details ? details[DETAILS_CHANGED_FLAG] || 0 : 0
    const result: RouteDetails = assign(
      { from: undefined, data: undefined, [DETAILS_CHANGED_FLAG]: count },
      details,
    )

    // 设置只读来源信息
    if (result.from)
      result.from = Object.freeze(pick(result.from, ['path', 'name', 'fullPath', 'hash']))

    // 自增变更次数
    if (increment)
      result[DETAILS_CHANGED_FLAG]++

    return result
  }

  /**
   * 获取当前导航位置
   * @returns 当前导航位置
   */
  getCurrentPosition = () => {
    return history.state?.position as number | null
  }

  install = (sdk: AppSDKInternalInstance) => {
    const { app, router } = sdk

    // =======================注入详情记录=======================
    app.provide(DETAILS_RECORD_KEY, this._detailsRecord)

    // =======================初始化记录位置=======================
    router.isReady().then(() => {
      this.latestPosition = this.getCurrentPosition()
    })

    // =======================识别方向=======================
    router.afterEach((to, from, failure) => {
      // 导航失败跳过后续操作
      if (isNavigationFailure(failure))
        return

      const latestPosition = this.latestPosition
      const currentPosition = this.getCurrentPosition()
      const direction = this.identifyDirection({ to, from, latestPosition, currentPosition })

      // 触发相应的事件
      switch (direction) {
        case NavigationDirection.backward:
          sdk.callHookSync('sdk:router:backward', to, from)
          break
        case NavigationDirection.unchanged:
          sdk.callHookSync('sdk:router:replace', to, from)
          break
        default:
          sdk.callHookSync('sdk:router:forward', to, from)
          break
      }
      sdk.callHookSync('sdk:router:navigate', direction, to, from)

      // 记录新的位置
      this.latestPosition = currentPosition
    })

    // =======================beforeOnce=======================
    router.beforeOnce = (guard) => {
      return router.beforeEach((...args) => {
        if (this._onceLocked)
          return
        this._onceLocked = true
        return guard(...args)
      })
    }
    router.afterEach(() => {
      // 还原锁定状态
      this._onceLocked = false
    })

    // =======================自定义函数=======================
    const { _setDetailsData, _consumeDetailsData } = this
    router.pushWithData = function (to, data) {
      _setDetailsData(data)
      return router.push(to)
    }
    router.replaceWithData = function (to, data) {
      _setDetailsData(data)
      return router.replace(to)
    }
    router.goWithData = function (delta, data) {
      _setDetailsData(data)
      return router.go(delta)
    }
    router.forwardWithData = function (data) {
      _setDetailsData(data)
      return router.goWithData(1, data)
    }
    router.backWithData = function (data) {
      _setDetailsData(data)
      return router.goWithData(-1, data)
    }
    router.clearDetailsRecord = this.clearDetailsRecord

    // 注册路由导航成功事件，更新详情记录
    sdk.hook('sdk:router:navigate', (direction, to, from) => {
      const detailsRecord = this._detailsRecord.value
      const { isChanged, data } = _consumeDetailsData()

      switch (direction) {
        // 路由未变更时删除旧详情并添加新详情
        case NavigationDirection.unchanged:
          delete detailsRecord[from.fullPath]
          detailsRecord[to.fullPath] = this.makeDetails({ from, data }, true)
          break

        // 路由后退时删除来源路由详情并根据数据副本更新旧详情
        case NavigationDirection.backward:
          delete detailsRecord[from.fullPath]
          if (isChanged)
            detailsRecord[to.fullPath] = this.makeDetails({ from, data }, true)
          break

        // 路由前进时仅添加新详情
        default:
          detailsRecord[to.fullPath] = this.makeDetails({ from, data }, true)
          break
      }

      // 更新详情记录
      this._updateDetailsRecord(detailsRecord)
    })

    // =======================注册集中清理=======================
    sdk.hook('sdk:cleanup', this.clearDetailsRecord)

    // =======================监听详情记录变更=======================
    const unwatch = watch(this._detailsRecord, (record) =>
      sdk.callHookSync('sdk:router:detailsRecordChange', record))

    return () => {
      this.latestPosition = null
      this._onceLocked = false
      this._detailsData = DEFAULT_DETAILS_DATA
      unwatch()
    }
  }
}

declare module 'vue-app-sdk' {
  export interface AppSDKHooks {
    /**
     * 路由前进后触发
     */
    'sdk:router:forward'(to: RouteLocationNormalized, from: RouteLocationNormalized): void
    /**
     * 路由后退后触发
     */
    'sdk:router:backward'(to: RouteLocationNormalized, from: RouteLocationNormalized): void
    /**
     * 路由替换后触发
     */
    'sdk:router:replace'(to: RouteLocationNormalized, from: RouteLocationNormalized): void
    /**
     * 路由导航成功后触发
     */
    'sdk:router:navigate'(
      direction: NavigationDirection,
      to: RouteLocationNormalized,
      from: RouteLocationNormalized,
    ): void
    /**
     * 路由详情记录变更后触发
     */
    'sdk:router:detailsRecordChange'(record: RouteDetailsRecord): void
  }
}

declare module 'vue-router' {
  export interface Router {
    /**
     * 同 `router.beforeEach`，区别在于仅单次触发，直到 `afterEach` 被执行后可下次触发，常用于避免在 `beforeEach` 内重定向再次触发 `beforeEach` 钩子的回调处理
     */
    beforeOnce(guard: NavigationGuard): NoopFn
    /**
     * 携带跨页面数据，类似于 `params`
     * @example
     * ```ts
     * // a.vue
     * router.pushWithData('/b', { msg: 'from a' })
     *
     * // b.vue
     * import { useRouteDetails } from 'vue-app-sdk'
     *
     * const details = useRouteDetails()
     * details.data.msg // => 'from a'
     *
     * // 持续监听
     * watch(() => details.data, (data) => {
     *   console.log(data.msg)
     * })
     * ```
     */
    pushWithData(to: RouteLocationRaw, data?: unknown): ReturnType<Router['push']>
    /**
     * 携带跨页面数据，类似于 `params`，参考 `router.pushWithData`
     */
    replaceWithData(to: RouteLocationRaw, data?: unknown): ReturnType<Router['replace']>
    /**
     * 携带跨页面数据，类似于 `params`，参考 `router.pushWithData`
     */
    forwardWithData(data?: unknown): ReturnType<Router['forward']>
    /**
     * 携带跨页面数据，类似于 `params`，参考 `router.pushWithData`
     */
    backWithData(data?: unknown): ReturnType<Router['back']>
    /**
     * 携带跨页面数据，类似于 `params`，参考 `router.pushWithData`
     */
    goWithData(delta: number, data?: unknown): ReturnType<Router['go']>
    /**
     * 清理所有详情记录
     */
    clearDetailsRecord(): void
  }
}
