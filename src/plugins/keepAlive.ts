import type { AwaitableFn, Fn, NoopFn } from '@rhao/types-base'
import type { Ref } from 'vue'
import { nextTick, shallowRef } from 'vue'
import { type RouteRecordNormalized, isNavigationFailure } from 'vue-router'
import { type AppSDKPlugin } from '../sdk'

export interface KeepAliveOptions {
  /**
   * 是否自动在路由前进时收集，后退时清理缓存
   * @default true
   */
  autoCollectAndClean?: boolean
  /**
   * 添加路由缓存前执行，返回假值将阻止添加
   *
   * @example
   * ```ts
   * createKeepAlivePlugin({
   *   keepAlive: {
   *     beforeAddWithRoute: (route) => {
   *       // 根据路由元数据判断是否添加缓存
   *       return route.meta.keepAlive
   *     },
   *   }
   * })
   * ```
   */
  beforeAddWithRoute?: AwaitableFn<[route: RouteRecordNormalized], boolean | undefined>
  /**
   * 删除路由缓存前执行，返回假值将阻止删除
   * @example
   * ```ts
   * createKeepAlivePlugin({
   *   keepAlive: {
   *     beforeRemoveWithRoute: (route) => {
   *       return !route.path.includes('list')
   *     },
   *   }
   * })
   * ```
   */
  beforeRemoveWithRoute?: AwaitableFn<[route: RouteRecordNormalized], boolean | undefined>
}

export interface AppSDKKeepAlive {
  /**
   * KeepAlive 的缓存组件名集合
   */
  caches: Ref<string[]>
  /**
   * 根据名称添加缓存
   */
  addCache: Fn<[name: string]>
  /**
   * 根据名称删除缓存
   */
  removeCache: Fn<[name: string]>
  /**
   * 根据名称刷新缓存
   */
  refreshCache: Fn<[name: string]>
  /**
   * 清除所有缓存
   */
  clearCache: NoopFn
  /**
   * 根据路由添加缓存
   */
  addCacheWithRoute: Fn<[route: RouteRecordNormalized]>
  /**
   * 根据路由删除缓存
   */
  removeCacheWithRoute: Fn<[route: RouteRecordNormalized]>
  /**
   * 根据路由刷新缓存
   */
  refreshCacheWithRoute: Fn<[route: RouteRecordNormalized]>
}

function getComponentNameByRoute(route: RouteRecordNormalized) {
  const comp = route.components?.default
  if (!comp) return ''
  // @ts-expect-error
  return comp?.name || comp?.__name || ''
}

export function createKeepAlivePlugin(options: KeepAliveOptions = {}): AppSDKPlugin {
  return (sdk) => {
    const {
      autoCollectAndClean = true,
      beforeAddWithRoute = () => true,
      beforeRemoveWithRoute = () => true,
    } = options
    const { router, hooks } = sdk

    // 缓存集合
    const caches = shallowRef<string[]>([])

    // 自动收集和清理缓存
    if (autoCollectAndClean) {
      let isBackward = false
      hooks.hook('sdk:router:direction', (direction) => {
        isBackward = direction === 'backward'
      })

      router.beforeEach(async (_, from, next) => {
        if (isBackward) await Promise.all(from.matched.map(removeCacheWithRoute))
        next()
      })

      router.afterEach(async (to, _, failure) => {
        if (!isNavigationFailure(failure)) await Promise.all(to.matched.map(addCacheWithRoute))
      })
    }

    async function addCacheWithRoute(route: RouteRecordNormalized) {
      const name = getComponentNameByRoute(route)
      const valid = await beforeAddWithRoute(route)
      valid && addCache(name)
    }

    async function removeCacheWithRoute(route: RouteRecordNormalized) {
      const name = getComponentNameByRoute(route)
      const valid = await beforeRemoveWithRoute(route)
      valid && removeCache(name)
    }

    async function refreshCacheWithRoute(route: RouteRecordNormalized) {
      const allowAdd = await beforeAddWithRoute(route)
      const allowRemove = await beforeRemoveWithRoute(route)
      if (allowAdd && allowRemove) {
        const name = getComponentNameByRoute(route)
        refreshCache(name)
      }
    }

    function addCache(name: string) {
      if (!name || caches.value.includes(name)) return
      caches.value = [...caches.value, name]
    }

    function removeCache(name: string) {
      caches.value = caches.value.filter((item) => item !== name)
    }

    function refreshCache(name: string) {
      removeCache(name)
      nextTick(() => {
        addCache(name)
      })
    }

    function clearCache() {
      caches.value = []
    }

    // 注册清理事件
    hooks.hook('sdk:cleanup', () => {
      clearCache()
    })

    sdk.keepAlive = {
      caches,

      addCache,
      removeCache,
      refreshCache,
      clearCache,

      addCacheWithRoute,
      removeCacheWithRoute,
      refreshCacheWithRoute,
    }
  }
}

declare module 'vue-app-sdk' {
  export interface AppSDK {
    /**
     * KeepAlive 管理器
     */
    keepAlive: AppSDKKeepAlive
  }
}
