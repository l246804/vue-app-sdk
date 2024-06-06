import type { Awaitable } from '@rhao/types-base'
import type { AppSDKInternalInstance, Plugin, PluginID } from 'vue-app-sdk'
import { NavigationDirection } from 'vue-app-sdk'
import { isFunction } from 'nice-fns'
import type { MaybeRefOrGetter, Ref } from 'vue'
import { isRef, nextTick, ref, toValue, watch } from 'vue'
import type { RouteLocationNormalized, RouteLocationNormalizedLoaded } from 'vue-router'
import { logger } from '@/utils'

/**
 * Scroll position similar to
 * {@link https://developer.mozilla.org/en-US/docs/Web/API/ScrollToOptions | `ScrollToOptions`}.
 * Note that not all browsers support `behavior`.
 */
export interface ScrollPositionCoordinates {
  behavior?: ScrollOptions['behavior']
  left?: number
  top?: number
}

export type ScrollPositionCoordinatesGroup = Record<string, ScrollPositionCoordinates>

export interface RouterScrollHandlerContext {
  /**
   * 目标路由
   */
  to: RouteLocationNormalized
  /**
   * 来源路由，手动触发时同目标路由一致
   */
  from: RouteLocationNormalizedLoaded
  /**
   * 滚动元素
   */
  element: Element | Window
  /**
   * 选择器
   */
  selector: string
  /**
   * 导航方向，手动滚动时为 `unchanged`
   */
  direction: NavigationDirection
  /**
   * 已保存的滚动位置
   */
  savedPosition: ScrollPositionCoordinates | undefined
  /**
   * 是否手动触发
   */
  isManual: boolean
}

export interface RouterScrollHandler {
  (context: RouterScrollHandlerContext): Awaitable<ScrollPositionCoordinates | boolean | void>
}

export interface RouterScrollerOptions {
  /**
   * 是否自动收集滚动位置
   * @default true
   */
  autoCollect?: MaybeRefOrGetter<boolean>

  /**
   * 允许捕获的选择器，支持特殊选择器 `window`、`body`
   */
  selectors: Record<string, boolean | RouterScrollHandler>

  /**
   * 默认的滚动行为
   */
  behavior?: ScrollOptions['behavior']

  /**
   * `selectors` 为 `true` 时默认将在导航成功后还原滚动位置，如果设为 `true` 则仅在导航后退时还原，适用于移动端
   * @default false
   */
  scrollOnlyBackward?: boolean
}

/**
 * RouterScroller Plugin ID
 */
export const ROUTER_SCROLLER_ID: PluginID<RouterScroller> = Symbol('router scroller')

/**
 * 路由滚动管理插件
 */
export class RouterScroller implements Plugin {
  constructor(
    /**
     * 配置项
     */
    public options: RouterScrollerOptions,
  ) {
    const { autoCollect = true } = options

    this._isAuto = ref(toValue(autoCollect))
    // 监听响应式自动模式
    if (isRef(autoCollect) || isFunction(autoCollect))
      watch(autoCollect, this.toggleAuto)
  }

  id = ROUTER_SCROLLER_ID

  /**
   * AppSDK 实例
   */
  private _sdk!: AppSDKInternalInstance

  /**
   * 滚动位置记录
   */
  positions = new Map<string, ScrollPositionCoordinatesGroup>()

  /**
   * 是否自动模式
   */
  private _isAuto: Ref<boolean>
  /**
   * 是否自动模式
   * @readonly
   */
  get isAuto() {
    return this._isAuto.value
  }

  /**
   * 切换自动模式
   * @param value 状态值
   */
  toggleAuto = (value = !this._isAuto.value) => {
    this._isAuto.value = value
    return value
  }

  /**
   * 启用自动模式
   */
  enableAuto = () => {
    return this.toggleAuto(true)
  }

  /**
   * 禁用自动模式
   */
  disableAuto = () => {
    return this.toggleAuto(false)
  }

  /**
   * 由于 `Transition` 动画可能导致元素自动还原滚动无效，此时可手动触发还原滚动
   * @example
   * ```html
   * <script setup lang="ts">
   * import { useAppSDK, ROUTER_SCROLLER_ID } from 'vue-app-sdk'
   *
   * const routerScroller = useAppSDK().getPlugin(ROUTER_SCROLLER_ID)!
   *
   * function handleAfterEnter() {
   *   routerScroller.trigger()
   * }
   * </script>
   *
   * <template>
   *   <Transition @after-enter="handleAfterEnter">
   *     ...
   *   </Transition>
   * </template>
   * ```
   */
  trigger = () => {
    const { router } = this._sdk
    const route = router.currentRoute.value
    const key = route.fullPath
    return this.applyPositions(
      route,
      route,
      this.positions.get(key),
      NavigationDirection.unchanged,
      true,
    )
  }

  /**
   * 获取滚动元素
   * @param selector 选择器
   * @returns 滚动元素
   */
  querySelector = (selector: string) => {
    if (typeof window === 'undefined')
      return undefined
    if (selector === 'body')
      return document.body
    if (selector === 'window')
      return window
    return document.querySelector(selector)
  }

  /**
   * 获取滚动位置
   * @param el 滚动元素
   * @returns 滚动位置
   */
  getScrollPosition = (el: Element | Window): ScrollPositionCoordinates => {
    if (el instanceof Window)
      return { left: window.scrollX, top: window.scrollY }
    else return { left: el.scrollLeft, top: el.scrollTop }
  }

  /**
   * 捕获滚动位置
   */
  capturePositions = () => {
    const pos: ScrollPositionCoordinatesGroup = {}
    for (const [selector] of Object.entries(this.options.selectors)) {
      const element = this.querySelector(selector)
      if (!element)
        continue
      pos[selector] = this.getScrollPosition(element)
    }
    return pos
  }

  /**
   * 还原滚动位置
   * @param to 目标路由
   * @param from 来源路由
   * @param position 滚动位置
   * @param direction 导航方向
   * @param isManual 是否手动触发
   */
  applyPositions = async (
    to: RouteLocationNormalized,
    from: RouteLocationNormalizedLoaded,
    position: ScrollPositionCoordinatesGroup | undefined,
    direction: NavigationDirection,
    isManual = false,
  ) => {
    for (const [selector, handler] of Object.entries(this.options.selectors)) {
      const element = this.querySelector(selector)
      if (!element)
        continue

      let pos = position?.[selector]
      if (isFunction(handler)) {
        const result = await handler({
          to,
          from,
          element,
          selector,
          direction,
          savedPosition: pos,
          isManual,
        })
        if (!result)
          continue

        if (result !== true)
          pos = result
      }
      else if (handler === true) {
        // 仅后退时滚动则置空非后退时的滚动位置
        if (this.options.scrollOnlyBackward && direction !== NavigationDirection.backward)
          pos = undefined
      }

      element.scrollTo({
        behavior: this.options.behavior,
        ...(pos || { top: 0, left: 0 }),
      })
    }
  }

  install = (sdk: AppSDKInternalInstance) => {
    this._sdk = sdk
    const { router } = sdk

    if (router.options.scrollBehavior) {
      logger.warn(
        '"scrollBehavior" options in Vue Router is overwritten by "RouterScroller" plugin, you can remove it from "createRouter()".',
      )
    }

    router.options.scrollBehavior = () => {}

    // `beforeLeave` but after all other hooks
    router.beforeResolve((to, from) => {
      // `beforeResolve` is also called when going back in history, we ignores it
      if (history.state?.current === to.fullPath)
        return

      if (!this.isAuto)
        return

      // 捕获滚动位置并存储
      const pos = this.capturePositions()
      this.positions.set(from.fullPath, pos)
    })

    // 导航成功时延迟还原滚动位置
    sdk.hook('sdk:router:navigate', (direction, to, from) => {
      if (!this.isAuto)
        return

      const pos = this.positions.get(to.fullPath)
      nextTick(() => this.applyPositions(to, from, pos, direction, false))
    })

    // 注册清理事件
    sdk.hook('sdk:cleanup', () => this.positions.clear())
  }
}
