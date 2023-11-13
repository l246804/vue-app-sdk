import type { RouteLocationNormalized, RouteLocationNormalizedLoaded } from 'vue-router'
import type { AppSDKPluginObject } from '../sdk'

export type Awaitable<T> = T | Promise<T>

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
  to: RouteLocationNormalized
  from: RouteLocationNormalizedLoaded | undefined
  element: Element | Window
  selector: string
  savedPosition: ScrollPositionCoordinates | undefined
}

export interface RouterScrollHandler {
  (context: RouterScrollHandlerContext): Awaitable<ScrollPositionCoordinates | boolean | void>
}

export interface RouterScrollBehaviorOptions {
  selectors: Record<string, boolean | RouterScrollHandler>
  /**
   * Default scroll behavior applied, when not specified in the handler
   */
  behavior?: ScrollOptions['behavior']
  /**
   * Customize the scrolling record key
   *
   * @default
   * ```ts
   * (route) => route.fullPath
   * ```
   */
  recordKeyGenerator?(route: RouteLocationNormalized): string
}

export interface RouterScroller extends AppSDKPluginObject {
  /**
   * 配置项
   */
  options: RouterScrollBehaviorOptions
  /**
   * 滚动位置记录
   */
  positions: Map<string, ScrollPositionCoordinatesGroup>
  /**
   * 手动触发滚动行为，默认会在路由器后置守卫时自动触发，若由于动画等原因无法正常滚动时可手动触发
   */
  trigger(): void
}
