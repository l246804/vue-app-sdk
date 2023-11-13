import type { Fn, NoopFn } from '@rhao/types-base'
import { assign, isEmpty } from 'lodash-unified'
import type { NavigationFailure, RouteLocationNormalized } from 'vue-router'
import { isNavigationFailure, useRoute } from 'vue-router'
import type { InjectionKey, ShallowReactive } from 'vue'
import { inject, onBeforeUnmount, shallowReactive } from 'vue'
import type { RemovableRef } from '@vueuse/core'
import { APP_SDK_KEY, type AppSDK } from '../sdk'
import { createPersistentRef } from '../utils'
import type { AppSDKRouteDetails, AppSDKRouteDirection, AppSDKRouterOptions } from './types'

export const DETAILS_CACHE_KEY: InjectionKey<RemovableRef<Map<string, AppSDKRouteDetails>>>
  = Symbol('route details cache')

function createDetails(details?: Partial<AppSDKRouteDetails>): AppSDKRouteDetails {
  return assign({ data: undefined }, details)
}

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
  const { hooks } = inject(APP_SDK_KEY)!
  const cache = inject(DETAILS_CACHE_KEY)!
  const details = shallowReactive(createDetails(cache.value.get(routePath)))

  const cleanup = hooks.hook('sdk:router:details', (path, _details) => {
    // 非同一页面不合并
    if (routePath !== path) return
    assign(details, _details)
    // 更新缓存
    cache.value.set(routePath, createDetails(details))
  })
  // 在作用域释放前清除事件监听
  onBeforeUnmount(cleanup)

  return details as ShallowReactive<AppSDKRouteDetails<T>>
}

/**
 * 扩展路由器
 */
export function enhanceRouter(sdk: AppSDK, options: AppSDKRouterOptions = {}) {
  const { app, router, hooks } = sdk
  const {
    identifyDirection,
    persistedDetails = true,
    window,
    storage,
    storageKey = '__VUE_APP_SDK__ROUTE_DETAILS_CACHE__',
  } = options

  let isBack = false
  let details = createDetails()
  let oldMap: Map<string, AppSDKRouteDetails> | undefined
  const detailsCache = createPersistentRef<Map<string, AppSDKRouteDetails>, true>(
    {
      persisted: persistedDetails,
      window,
      storage,
      storageKey,
      value: new Map(),
    },
    true,
    {
      read: (v) => {
        const newMap = new Map<string, AppSDKRouteDetails>(JSON.parse(v))
        if (oldMap) {
          const map = oldMap
          oldMap = undefined
          map.forEach((value, key) => !newMap.has(key) && newMap.set(key, value))
        }
        return newMap
      },
      write: (v) => {
        oldMap = v
        const arr: [string, AppSDKRouteDetails][] = []
        v.forEach((value, key) => {
          // 不缓存空数据
          if (!isEmpty(value.data)) arr.push([key, value])
        })
        return JSON.stringify(arr)
      },
    },
  )

  // 全局注入详情缓存
  app.provide(DETAILS_CACHE_KEY, detailsCache)

  // 注册清理事件
  hooks.hook('sdk:cleanup', () => {
    detailsCache.value.clear()
  })

  let locked = false
  router.beforeOnce = (guard) => {
    return router.beforeEach((to, from, next) => {
      if (locked) return next()
      locked = true
      return guard(to, from, next)
    })
  }

  // 处理路由方向并触发 hooks
  router.beforeOnce(async (to, from, next) => {
    let direction: AppSDKRouteDirection = isBack ? 'backward' : 'forward'
    isBack = false

    // 调用外部识别函数
    const _direction = await identifyDirection?.(to, from, direction)
    if (_direction && ['backward', 'forward'].includes(_direction)) direction = _direction

    await hooks.callHookParallel('sdk:router:direction', direction, to, from)
    await hooks.callHookParallel(`sdk:router:${direction}`, to, from)

    const cleanup = router.afterEach((to, from, failure) => {
      cleanup()
      hooks.callHookParallel('sdk:router:direction:end', direction, to, from, failure)
      hooks.callHookParallel(`sdk:router:${direction}:end`, to, from, failure)
    })

    return next()
  })

  hooks.hook('sdk:router:direction:end', async (direction, _, from) => {
    // 路由后退时删除缓存
    if (direction === 'backward') detailsCache.value.delete(from.path)
  })

  router.afterEach((to, _, failure) => {
    locked = false
    if (!isNavigationFailure(failure)) {
      // 成功时设置目标路由缓存，避免异步组件或前进时页面还未注册回调
      detailsCache.value.set(to.path, createDetails(details))
      hooks.callHookParallel('sdk:router:details', to.path, createDetails(details))
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
    details = createDetails({ data })
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

declare module 'vue-app-sdk' {
  export interface AppSDKConfigHooks {
    /**
     * 路由前进或后退时触发
     */
    'sdk:router:direction': Fn<
      [direction: AppSDKRouteDirection, to: RouteLocationNormalized, from: RouteLocationNormalized]
    >
    /**
     * 路由前进时触发
     */
    'sdk:router:forward': Fn<[to: RouteLocationNormalized, from: RouteLocationNormalized]>
    /**
     * 路由后退时触发
     */
    'sdk:router:backward': Fn<[to: RouteLocationNormalized, from: RouteLocationNormalized]>
    /**
     * 路由前进或后退结束时触发
     */
    'sdk:router:direction:end': Fn<
      [
        direction: AppSDKRouteDirection,
        to: RouteLocationNormalized,
        from: RouteLocationNormalized,
        failure?: NavigationFailure | void,
      ]
    >
    /**
     * 路由前进结束时触发
     */
    'sdk:router:forward:end': Fn<
      [
        to: RouteLocationNormalized,
        from: RouteLocationNormalized,
        failure?: NavigationFailure | void,
      ]
    >
    /**
     * 路由后退结束时触发
     */
    'sdk:router:backward:end': Fn<
      [
        to: RouteLocationNormalized,
        from: RouteLocationNormalized,
        failure?: NavigationFailure | void,
      ]
    >
    /**
     * 路由跳转成功时触发
     */
    'sdk:router:details': Fn<[targetPath: string, details: AppSDKRouteDetails]>
  }
}

declare module 'vue-router' {
  export interface Router {
    /**
     * 同 `router.beforeEach`，区别在于仅单次触发，直到 `afterEach` 被执行后可下次触发，常用于避免在 `beforeEach` 内重定向再次触发 `before` 钩子的事件处理
     */
    beforeOnce: Fn<[guard: NavigationGuard], NoopFn>
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
