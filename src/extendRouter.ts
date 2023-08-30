import type { AwaitableFn, Fn } from '@rhao/types-base'
import { assign } from 'lodash-unified'
import { type RouteLocationNormalized, useRoute } from 'vue-router'
import { inject, onBeforeUnmount, shallowReactive } from 'vue'
import { APP_SDK_KEY, type AppSDK } from './sdk'

export interface AppSDKRouteDetails<T = unknown> {
  data: T | undefined
}

export type AppSDKRouteDirection = 'forward' | 'backward'

export interface AppSDKRouterOptions {
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
  const details = shallowReactive(resolveDetails())
  const hooks = inject(APP_SDK_KEY)!.hooks
  const routePath = useRoute()?.path

  const unListen = hooks.hook('sdk:router:details', (path, _details) => {
    // 非同一页面不合并
    if (routePath !== path) return
    assign(details, _details)
  })
  // 在作用域释放前清除事件监听
  onBeforeUnmount(unListen)

  return details as AppSDKRouteDetails<T>
}

/**
 * 扩展路由器
 */
export function extendRouter(sdk: AppSDK, options?: AppSDKRouterOptions) {
  let detailsData
  let isBack = false
  const hooks = sdk.hooks
  const router = sdk.router

  // 处理路由方向并触发 hooks
  router.beforeEach(async (to, from, next) => {
    let direction: AppSDKRouteDirection = isBack ? 'backward' : 'forward'
    isBack = false

    // 调用外部识别函数
    const _direction = await options?.identifyDirection?.(to, from, direction)
    if (_direction && ['backward', 'forward'].includes(_direction)) direction = _direction

    await hooks.callHookParallel('sdk:router:direction', direction)
    await hooks.callHookParallel(`sdk:router:${direction}`)

    next()
  })

  // 成功时触发hooks
  router.afterEach((to, _, failure) => {
    if (!failure) {
      hooks.callHookParallel(
        'sdk:router:details',
        to.path,
        resolveDetails({ data: detailsData }),
      )
    }
    detailsData = undefined
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

  // 扩展自定义函数
  router.pushWithData = function (to, data) {
    detailsData = data
    return router.push(to)
  }
  router.replaceWithData = function (to, data) {
    detailsData = data
    return router.replace(to)
  }
  router.goWithData = function (delta, data) {
    detailsData = data
    return router.go(delta)
  }
  router.forwardWithData = function (data) {
    detailsData = data
    return router.goWithData(1, data)
  }
  router.backWithData = function (data) {
    detailsData = data
    return router.goWithData(-1, data)
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
  }
}
