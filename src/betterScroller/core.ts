import { nextTick } from 'vue'
import { isNavigationFailure } from 'vue-router'
import type { RouteLocationNormalized, RouteLocationNormalizedLoaded, Router } from 'vue-router'
import type { NotNullish } from '@rhao/types-base'
import { createSDKRef } from '../utils'
import type {
  RouterScrollBehaviorOptions,
  RouterScroller,
  ScrollPositionCoordinates,
  ScrollPositionCoordinatesGroup,
} from './types'

const defaultRecordKeyGenerator: NotNullish<RouterScrollBehaviorOptions['recordKeyGenerator']> = (
  route,
) => route.fullPath

/**
 * Set up router scroll behavior as a Vue plugin.
 *
 * Based on
 * {@link https://www.npmjs.com/package/vue-router-better-scroller | `vue-router-better-scroller`}.
 * Fix some bugs.
 *
 * @example
 * ```ts
 * import { createRouter } from 'vue-router'
 * import { createSDK, createRouterScroller } from 'vue-app-sdk'
 *
 * const app = createApp(App)
 * const router = createRouter({ ... })
 *
 * app.use(router)
 * app.use(createSDK({ plugins: [createRouterScroller({ ... })] })) // <-- this
 *
 * app.mount('#app')
 * ```
 */
export function createRouterScroller(options: RouterScrollBehaviorOptions) {
  const { recordKeyGenerator = defaultRecordKeyGenerator } = options
  const { setSDK, resolveSDK } = createSDKRef('BetterScroller')
  const positions = new Map<string, ScrollPositionCoordinatesGroup>()

  /**
   * Setup router scroll behavior directly with a router instance.
   *
   * Based on
   * {@link https://www.npmjs.com/package/vue-router-better-scroller | vue-router-better-scroller}.
   * Fixed some bugs.
   */
  function setupRouterScroller(router: Router, options: RouterScrollBehaviorOptions) {
    if (router.options.scrollBehavior) {
      console.warn(
        '`scrollBehavior` options in Vue Router is overwritten by `vue-router-scroller` plugin, you can remove it from createRouter()',
      )
    }

    router.options.scrollBehavior = () => {}

    // `beforeLeave` but after all other hooks
    router.beforeResolve((to, from) => {
      // `beforeResolve` is also called when going back in history, we ignores it
      if (history.state?.current === to.fullPath) return

      const pos = capturePositions(options)
      const key = recordKeyGenerator(from)
      positions.set(key, pos)
    })

    router.afterEach((to, from, failure) => {
      if (isNavigationFailure(failure)) return

      const key = recordKeyGenerator(to)
      const pos = positions.get(key)

      nextTick(() => {
        applyPositions(to, from, pos, options)
      })
    })
  }

  function trigger() {
    const route = resolveSDK().router.currentRoute.value
    const key = recordKeyGenerator(route)
    return applyPositions(route, undefined, positions.get(key), options)
  }

  const routerScroller: RouterScroller = {
    options,
    positions,
    trigger,
    install(sdk) {
      sdk.routerScroller = routerScroller
      setSDK(sdk)
      setupRouterScroller(sdk.router, options)
    },
  }

  return routerScroller
}

function capturePositions(options: RouterScrollBehaviorOptions) {
  const pos: ScrollPositionCoordinatesGroup = {}
  for (const [selector] of Object.entries(options.selectors)) {
    const element = querySelector(selector)
    if (!element) continue
    pos[selector] = getScrollPosition(element)
  }
  return pos
}

function querySelector(name: string) {
  if (typeof window === 'undefined') return undefined
  if (name === 'body') return document.body
  if (name === 'window') return window
  return document.querySelector(name)
}

function getScrollPosition(el: Element | Window): ScrollPositionCoordinates {
  if (el instanceof Window) return { left: window.scrollX, top: window.scrollY }
  else return { left: el.scrollLeft, top: el.scrollTop }
}

async function applyPositions(
  to: RouteLocationNormalized,
  from: RouteLocationNormalizedLoaded | undefined,
  pos: ScrollPositionCoordinatesGroup | undefined,
  options: RouterScrollBehaviorOptions,
) {
  for (const [selector, handler] of Object.entries(options.selectors)) {
    const element = querySelector(selector)
    if (!element) continue

    let position = pos?.[selector]
    if (typeof handler === 'function') {
      const result = await handler({
        to,
        from,
        element,
        selector,
        savedPosition: position,
      })
      if (!result) continue

      if (result !== true) position = result
    }
    else if (!handler) {
      position = undefined
    }

    element.scrollTo({
      behavior: options.behavior,
      ...(position || { top: 0, left: 0 }),
    })
  }
}

declare module 'vue-app-sdk' {
  export interface AppSDK {
    routerScroller: RouterScroller
  }
}
