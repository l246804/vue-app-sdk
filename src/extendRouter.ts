import type { AwaitableFn, Fn, NoopFn } from '@rhao/types-base'
import { assign } from 'lodash-unified'
import { type RouteLocationNormalized, isNavigationFailure, useRoute } from 'vue-router'
import type { InjectionKey, ShallowReactive } from 'vue'
import { inject, onBeforeUnmount, ref, shallowReactive, shallowRef } from 'vue'
import type { ConfigurableWindow, RemovableRef, StorageLikeAsync } from '@vueuse/core'
import { defaultWindow, useStorageAsync } from '@vueuse/core'
import { APP_SDK_KEY, type AppSDK } from './sdk'

export interface AppSDKRouteDetails<T = unknown> {
  data: T | undefined
}

export type AppSDKRouteDirection = 'forward' | 'backward'

export interface AppSDKRouterOptions extends ConfigurableWindow {
  /**
   * 是否持久化详情，如果设为 `true`，则会将 `details` 存储在 `Storage` 中，防止刷新丢失
   *
   * ***注意：持久化后会缓存每次前进的详情数据，只有在手动替换或页面后退时进行清理，也可执行 `router.clearDetails()` 清理全部缓存。***
   * @default true
   */
  persistedDetails?: boolean
  /**
   * 用于持久化详情的存储中心
   * @default localStorage
   */
  storage?: StorageLikeAsync
  /**
   * 持久化存储详情的键
   * @default '__VUE_APP_SDK__ROUTE_DETAILS_CACHE__'
   */
  storageKey?: string
  /**
   * 识别方向，用于触发指定的 hooks，默认除过 `back()` 和 `go(-n)` 会被识别为后退，其他识别为前进
   */
  identifyDirection?: AwaitableFn<
    [
      to: RouteLocationNormalized,
      from: RouteLocationNormalized,
      currentDirection: AppSDKRouteDirection,
    ],
    AppSDKRouteDirection
  >
}

function resolveDetails(details?: Partial<AppSDKRouteDetails>): AppSDKRouteDetails {
  return assign({ data: undefined }, details)
}

const DETAILS_CACHE_KEY: InjectionKey<RemovableRef<Map<string, AppSDKRouteDetails>>>
  = Symbol('route details cache')

/**
 * 获取路由跳转详情
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
  const routePath = useRoute().path
  const hooks = inject(APP_SDK_KEY)!.hooks
  const cache = inject(DETAILS_CACHE_KEY)!
  const details = shallowReactive(resolveDetails(cache.value.get(routePath)))

  const cleanup = hooks.hook('sdk:router:details', (path, _details) => {
    // 非同一页面不合并
    if (routePath !== path) return
    assign(details, _details)
    // 更新缓存
    cache.value.set(routePath, resolveDetails(details))
  })
  // 在作用域释放前清除事件监听
  onBeforeUnmount(cleanup)

  return details as ShallowReactive<AppSDKRouteDetails<T>>
}

/**
 * 扩展路由器
 */
export function extendRouter(sdk: AppSDK, options: AppSDKRouterOptions = {}) {
  const { app, router, hooks } = sdk
  const {
    identifyDirection,
    persistedDetails = true,
    window = defaultWindow,
    storage = window?.localStorage,
    storageKey = '__VUE_APP_SDK__ROUTE_DETAILS_CACHE__',
  } = options

  // 创建可持久化 ref 变量
  function createPersistedRef<T>(key, value: T, shallow = true) {
    if (persistedDetails) return useStorageAsync(key, value, storage, { shallow, window })
    return (shallow ? shallowRef(value) : ref(value)) as RemovableRef<T>
  }

  let isBack = false
  let details = resolveDetails()
  const detailsCache = createPersistedRef<Map<string, AppSDKRouteDetails>>(
    storageKey,
    new Map(),
    false,
  )

  // 全局注入详情缓存
  app.provide(DETAILS_CACHE_KEY, detailsCache)

  // 注册清理事件
  hooks.hook('sdk:cleanup', () => {
    detailsCache.value.clear()
  })

  // 处理路由方向并触发 hooks
  router.beforeEach(async (to, from, next) => {
    let direction: AppSDKRouteDirection = isBack ? 'backward' : 'forward'
    isBack = false

    // 调用外部识别函数
    const _direction = await identifyDirection?.(to, from, direction)
    if (_direction && ['backward', 'forward'].includes(_direction)) direction = _direction

    await hooks.callHookParallel('sdk:router:direction', direction)
    await hooks.callHookParallel(`sdk:router:${direction}`)

    // 后退时删除来源路由缓存
    if (direction === 'backward') detailsCache.value.delete(from.path)

    next()
  })

  router.afterEach((to, _, failure) => {
    if (!isNavigationFailure(failure)) {
      // 成功时设置目标路由缓存，避免异步组件或前进时页面还未注册回调
      detailsCache.value.set(to.path, resolveDetails(details))
      hooks.callHookParallel('sdk:router:details', to.path, resolveDetails(details))
    }
  })

  // 重写 back 和 go
  const originalBack = router.back
  const originalGo = router.go
  router.back = () => {
    isBack = true
    return originalBack()
  }
  router.go = (delta: number) => {
    if (delta < 0) isBack = true
    return originalGo(delta)
  }

  // 重写 replace
  const originalReplace = router.replace
  router.replace = (to) => {
    const path = router.currentRoute.value.path
    detailsCache.value.delete(path)
    return originalReplace(to)
  }

  const updateDetailsByData = (data) => {
    details = resolveDetails({ data })
  }

  // 扩展自定义函数
  router.pushWithData = function (to, data) {
    updateDetailsByData(data)
    return router.push(to)
  }
  router.replaceWithData = function (to, data) {
    updateDetailsByData(data)
    return router.replace(to)
  }
  router.goWithData = function (delta, data) {
    updateDetailsByData(data)
    return router.go(delta)
  }
  router.forwardWithData = function (data) {
    updateDetailsByData(data)
    return router.goWithData(1, data)
  }
  router.backWithData = function (data) {
    updateDetailsByData(data)
    return router.goWithData(-1, data)
  }
  router.clearDetails = function () {
    detailsCache.value.clear()
  }
}

declare module 'vue-router' {
  export interface Router {
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
    pushWithData: Fn<[to: RouteLocationRaw, data?: any], ReturnType<Router['push']>>
    /**
     * 携带跨页面数据，类似于 `params`，参考 `router.pushWithData`
     */
    replaceWithData: Fn<[to: RouteLocationRaw, data?: any], ReturnType<Router['replace']>>
    /**
     * 携带跨页面数据，类似于 `params`，参考 `router.pushWithData`
     */
    forwardWithData: Fn<[data?: any], ReturnType<Router['forward']>>
    /**
     * 携带跨页面数据，类似于 `params`，参考 `router.pushWithData`
     */
    backWithData: Fn<[data?: any], ReturnType<Router['back']>>
    /**
     * 携带跨页面数据，类似于 `params`，参考 `router.pushWithData`
     */
    goWithData: Fn<[delta: number, data?: any], ReturnType<Router['go']>>
    /**
     * 清除详情缓存
     */
    clearDetails: NoopFn
  }
}
