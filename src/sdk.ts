import { isFunction } from 'lodash-unified'
import { inject } from 'vue'
import type { App, InjectionKey } from 'vue'
import { type Router } from 'vue-router'
import type { Fn } from '@rhao/types-base'
import { type AppSDKHooks, createHooks } from './hooks'
import { type AppSDKRouterOptions, extendRouter } from './extendRouter'

export interface AppSDKOptions {
  /**
   * 扩展路由器配置项
   */
  router?: AppSDKRouterOptions
  /**
   * 扩展插件列表
   */
  plugins?: AppSDKPlugin[]
}

export interface AppSDK {
  /**
   * 配置项
   */
  readonly options: AppSDKOptions
  /**
   * Vue 实例
   */
  readonly app: App
  /**
   * Vue 路由器
   */
  readonly router: Router
  /**
   * hooks 管理器
   */
  readonly hooks: AppSDKHooks
  /**
   * 集中清理缓存和旧数据资源，不会干扰到 AppSDK 及插件功能正常运行
   */
  cleanup(): void
  /**
   * 自动被 `app.use` 调用，调用后将挂载 AppSDK 并初始化插件运行
   */
  install(app: App): void
}

export type AppSDKPlugin = Fn<[sdk: AppSDK]>

export const APP_SDK_KEY: InjectionKey<AppSDK> = Symbol('App SDK')

/**
 * 获取 AppSDK 实例
 */
export function useAppSDK() {
  return inject(APP_SDK_KEY)!
}

/**
 * 创建 VueAppSDK
 *
 * @example
 * ```ts
 * // router.ts
 * export const router = createRouter({ ... })
 *
 * // sdk.ts
 * export const sdk = createAppSDK({ ... })
 *
 * // main.ts
 * const app = createApp({ ... })
 *
 * // 需先挂载路由器再挂载 SDK
 * app.use(router).use(sdk)
 *
 * app.mount('#app')
 * ```
 */
export function createAppSDK(options: AppSDKOptions = {}) {
  const { plugins = [] } = options
  const hooks = createHooks()

  let isInitialed = false
  const sdk: any = {
    options,
    hooks,
    cleanup,
    install(app: App) {
      if (isInitialed) return
      isInitialed = true

      const props = app.config.globalProperties
      const router = props.$router
      if (!router) throw new Error('[VueAppSDK] - Please install vue-router first!')

      // 挂载 app、router
      sdk.app = app
      sdk.router = router

      // 挂载至全局 $appSDK 并全局注入
      props.$appSDK = sdk
      app.provide(APP_SDK_KEY, sdk)

      // 扩展路由器
      extendRouter(sdk, sdk.options.router)

      // 初始化插件运行
      runPlugins()
    },
  }

  function runPlugins() {
    plugins.forEach((plugin) => isFunction(plugin) && plugin(sdk as AppSDK))
  }

  function cleanup() {
    hooks.callHookParallel('sdk:cleanup')
  }

  return sdk as Omit<AppSDK, 'app' | 'router'>
}

declare module 'vue' {
  export interface ComponentCustomProperties {
    $appSDK: AppSDK
  }
}
