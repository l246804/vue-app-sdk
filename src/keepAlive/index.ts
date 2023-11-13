import type { AwaitableFn, Fn, NoopFn, PromiseFn } from '@rhao/types-base'
import type { Ref } from 'vue'
import { computed, nextTick, ref, watch } from 'vue'
import { isNavigationFailure } from 'vue-router'
import type { RouteRecordNormalized } from 'vue-router'
import { once } from 'lodash-unified'
import { useToggle } from '@vueuse/core'
import type { AppSDKPluginObject } from '../sdk'
import { asyncGetComponentNameByRoute } from '../utils'

export interface KeepAliveOptions {
  /**
   * 是否自动在路由前进时收集，后退时清理缓存，常用于模拟移动端缓存处理
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
   *     beforeRouteAdd: (route) => {
   *       // 根据路由元数据判断是否添加缓存
   *       return route.meta.keepAlive
   *     },
   *   }
   * })
   * ```
   */
  beforeRouteAdd?: AwaitableFn<[route: RouteRecordNormalized], unknown>
  /**
   * @deprecated 该配置项将在下个版本删除，请使用 `beforeRouteAdd` 代替！
   */
  beforeAddWithRoute?: AwaitableFn<[route: RouteRecordNormalized], boolean | undefined>
  /**
   * 删除路由缓存前执行，返回假值将阻止删除
   * @example
   * ```ts
   * createKeepAlivePlugin({
   *   keepAlive: {
   *     beforeRouteRemove: (route) => {
   *       return !route.path.includes('list')
   *     },
   *   }
   * })
   * ```
   */
  beforeRouteRemove?: AwaitableFn<[route: RouteRecordNormalized], unknown>
  /**
   * @deprecated 该配置项将在下个版本删除，请使用 `beforeRouteRemove` 代替！
   */
  beforeRemoveWithRoute?: AwaitableFn<[route: RouteRecordNormalized], boolean | undefined>
}

export interface KeepAlive extends AppSDKPluginObject {
  /**
   * KeepAlive 的缓存组件名集合
   */
  names: Ref<string[]>
  /**
   * @deprecated 该属性将在下个版本删除，请使用 `names` 代替！
   */
  caches: Ref<string[]>
  /**
   * 是否自动收集和清理
   */
  isAuto: Ref<boolean>
  /**
   * 切换自动模式
   */
  toggleAuto: Fn<[value?: boolean]>
  /**
   * 启用自动模式
   */
  enableAuto: NoopFn
  /**
   * 禁用自动模式
   */
  disableAuto: NoopFn
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
   * 设置缓存
   */
  setCache: Fn<[value: string[]]>
  /**
   * 根据路由添加缓存
   */
  addRouteCache: PromiseFn<[route: RouteRecordNormalized]>
  /**
   * 根据路由删除缓存
   */
  removeRouteCache: PromiseFn<[route: RouteRecordNormalized]>
  /**
   * 根据路由刷新缓存
   */
  refreshRouteCache: PromiseFn<[route: RouteRecordNormalized]>
  /**
   * @deprecated 该函数将在下个大版本删除，请使用 `addRouteCache` 代替！
   */
  addCacheWithRoute: PromiseFn<[route: RouteRecordNormalized]>
  /**
   * @deprecated 该函数将在下个大版本删除，请使用 `removeRouteCache` 代替！
   */
  removeCacheWithRoute: PromiseFn<[route: RouteRecordNormalized]>
  /**
   * @deprecated 该函数将在下个大版本删除，请使用 `refreshRouteCache` 代替！
   */
  refreshCacheWithRoute: PromiseFn<[route: RouteRecordNormalized]>
}

/**
 * 创建 KeepAlive 管理器，需安注册到 AppSDK 才能正常工作
 *
 * @example
 * ```ts
 * // sdk.ts
 * const keepAlive = createKeepAlive({ ... })
 * const sdk = createSDK({ plugins: [keepAlive] })
 *
 * // App.vue
 * console.log(keepAlive === sdk.keepAlive) // true
 * ```
 */
export function createKeepAlive(options: KeepAliveOptions = {}) {
  const {
    autoCollectAndClean = true,
    beforeAddWithRoute = () => true,
    beforeRemoveWithRoute = () => true,
    beforeRouteAdd = beforeAddWithRoute,
    beforeRouteRemove = beforeRemoveWithRoute,
  } = options

  const names = ref<string[]>([])
  const caches = computed(() => names.value)

  async function addRouteCache(route: RouteRecordNormalized) {
    const name = await asyncGetComponentNameByRoute(route)
    const valid = await beforeRouteAdd(route)
    valid && addCache(name)
  }

  async function removeRouteCache(route: RouteRecordNormalized) {
    const name = await asyncGetComponentNameByRoute(route)
    const valid = await beforeRouteRemove(route)
    valid && removeCache(name)
  }

  async function refreshRouteCache(route: RouteRecordNormalized) {
    const allowAdd = await beforeRouteAdd(route)
    const allowRemove = await beforeRouteRemove(route)
    if (allowAdd && allowRemove) {
      const name = await asyncGetComponentNameByRoute(route)
      refreshCache(name)
    }
  }

  function addCache(name: string) {
    if (!name || names.value.includes(name)) return
    names.value.push(name)
  }

  function removeCache(name: string) {
    names.value = names.value.filter((item) => item !== name)
  }

  function refreshCache(name: string) {
    removeCache(name)
    nextTick(() => {
      addCache(name)
    })
  }

  function setCache(value: string[]) {
    names.value = value.filter(Boolean)
  }

  function clearCache() {
    names.value = []
  }

  const [isAuto, toggleAuto] = useToggle(autoCollectAndClean)

  const keepAlive: KeepAlive = {
    names,
    caches,

    isAuto,
    toggleAuto,
    enableAuto: () => toggleAuto(true),
    disableAuto: () => toggleAuto(false),

    addCache,
    removeCache,
    refreshCache,
    clearCache,
    setCache,

    addRouteCache,
    removeRouteCache,
    refreshRouteCache,
    addCacheWithRoute: addRouteCache,
    removeCacheWithRoute: removeRouteCache,
    refreshCacheWithRoute: refreshRouteCache,

    install: (sdk) => {
      const { hooks } = sdk

      // 自动模式句柄，仅支持调用一次
      const collector = once(() => {
        hooks.hook('sdk:router:direction:end', async (direction, to, from, failure) => {
          if (!isAuto.value || isNavigationFailure(failure)) return
          if (direction === 'backward') {
            const needRemoveMatched = from.matched.filter((m) => !to.matched.includes(m))
            await Promise.all(needRemoveMatched.map(removeRouteCache))
          }
          await Promise.all(to.matched.map(addRouteCache))
        })
      })

      const unwatch = watch(
        isAuto,
        (value) => {
          if (value) {
            nextTick(() => unwatch())
            collector()
          }
        },
        { immediate: true },
      )

      // 注册清理事件
      hooks.hook('sdk:cleanup', () => {
        clearCache()
      })

      sdk.keepAlive = keepAlive
    },
  }

  return keepAlive
}

declare module 'vue-app-sdk' {
  export interface AppSDK {
    /**
     * KeepAlive 管理器
     */
    keepAlive: KeepAlive
  }
}
